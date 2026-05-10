import type { Logger } from "pino";
import { NotFoundError } from "@/shared/errors.js";
import { baseLogger } from "@/shared/logger.js";
import type {
  CommandMessageResponseDto,
  CommandSessionDto,
  CommandStatus,
  CommandStreamEvent,
  ConfirmCommandActionInput,
  ConfirmationResponseDto,
  CreateCommandSessionInput,
  SendCommandMessageInput,
} from "./command.dto.js";
import {
  hermesClient,
  HermesError,
  type HermesHistoryTurn,
  type HermesRawEvent,
} from "./hermes.client.js";
import { commandEventBus } from "./command.bus.js";
import { pendingConfirmations, type ConfirmationDecision } from "./command.confirmations.js";
import * as repo from "./command.repository.js";
import type { CommandEventRowWithSeq } from "./command.repository.js";

/**
 * CommandOrchestrator —— Hermes 指令中心的主流程编排。
 * 对应 Hermes_Command_Center_HTTP_直连可用版.md §8.2。
 *
 * 本轮重构把直接对接换成 Hermes 官方 Runs API：
 *
 *   1. sendMessage 异步启动 runCommand，立即返回 { status: "running", streamUrl }
 *   2. runCommand 拿到 run_id 后**只维持一条** /v1/runs/{id}/events SSE 流：
 *      - 收到 approval.request → 落 waiting_confirmation，挂起等前端决策
 *      - 前端 confirm → POST /v1/runs/{id}/approval (choice=once)
 *      - 前端 cancel  → POST /v1/runs/{id}/approval (choice=deny) +
 *                        可选地 POST /v1/runs/{id}/stop 兜底
 *      - Hermes 会在同一条 SSE 流里继续发剩余事件
 *   3. run.completed / run.failed / run.cancelled 到达 → finalize + 广播 end
 *
 * 关键不变式：
 *   - 所有 Hermes 输出都先回 Backend，再写库 / 广播 / 推前端
 *   - command 一旦进入 running/waiting_confirmation，runCommand 最终必然把它
 *     推进到 completed/failed/cancelled，不会悬空
 *   - message.delta 聚合：多条连续 delta 拼成一条 agent_message，在边界事件
 *     （tool.started / reasoning.available / approval.request / run.*) 前 flush
 */

// ---------- sessions ----------

export async function createSession(input: CreateCommandSessionInput): Promise<CommandSessionDto> {
  const row = await repo.insertSession({
    entry: input.entry ?? null,
    initialContext: input.initialContext ?? {},
    userId: null,
  });
  return {
    sessionId: row.id,
    entry: row.entry,
    createdAt: row.createdAt,
  };
}

export async function getSessionOrThrow(sessionId: string) {
  const row = await repo.getSessionById(sessionId);
  if (!row) throw new NotFoundError("CommandSession", sessionId);
  return row;
}

// ---------- commands ----------

export function buildStreamUrl(commandId: string): string {
  return `/api/command/commands/${commandId}/stream`;
}

export async function sendMessage(
  sessionId: string,
  input: SendCommandMessageInput,
  logger: Logger,
): Promise<CommandMessageResponseDto> {
  await getSessionOrThrow(sessionId);

  const command = await repo.insertCommand({
    sessionId,
    userId: null,
    userMessage: input.message,
    context: input.context ?? {},
  });

  const cmdLogger = logger.child({ commandId: command.id, sessionId });

  // 多轮连续对话：把同一个 session 里历史上已完成的 command 拼成 Hermes
  // conversation_history 一起发过去。Hermes `_create_agent` 每次 run 都会
  // 重建 Agent 实例，仅靠 session_id 无法让 LLM 看到前几轮——必须把
  // 历史显式喂进去（api_server.py::_handle_runs）。
  //
  // 这里只取 `completed` 的历史记录：`running` 还没有结果，`failed`/`cancelled`
  // 的 assistant 侧不代表真实回答，灌进去只会污染上下文。
  const history = await buildConversationHistory(sessionId, command.id, cmdLogger);
  cmdLogger.info(
    {
      messagePreview: input.message.slice(0, 200),
      historyTurns: history.length,
    },
    "Command accepted, dispatching asynchronously",
  );

  void runCommand({
    commandId: command.id,
    sessionId,
    userMessage: input.message,
    context: input.context ?? {},
    history,
    logger: cmdLogger,
  });

  return {
    commandId: command.id,
    status: "running",
    streamUrl: buildStreamUrl(command.id),
  };
}

/**
 * 从 DB 把同一 session 里历史对话重组成 Hermes conversation_history。
 *
 * 每条历史 command 贡献两个 turn：
 *   1. user:      userMessage
 *   2. assistant: 从 resultJson 里解出来的 output 字符串
 *
 * 跳过 assistant 内容为空（比如 output 是非字符串结构化数据）或状态非 completed 的记录——
 * LLM 吃到空 assistant 比吃不到这轮还糟糕。
 */
async function buildConversationHistory(
  sessionId: string,
  excludeCommandId: string,
  logger: Logger,
): Promise<HermesHistoryTurn[]> {
  const rows = await repo.listCommandsBySession(sessionId, excludeCommandId);
  const history: HermesHistoryTurn[] = [];
  for (const row of rows) {
    if (row.status !== "completed") continue;
    const assistantText = extractAssistantText(row.resultJson);
    if (!assistantText) continue;
    history.push({ role: "user", content: row.userMessage });
    history.push({ role: "assistant", content: assistantText });
  }
  if (history.length > 0) {
    logger.debug(
      { turns: history.length, commandCount: history.length / 2 },
      "Assembled conversation history for Hermes",
    );
  }
  return history;
}

/**
 * Hermes run.completed 的结果结构：`{ output, usage }`，output 正常情况下是
 * agent 的 final_response 字符串。runCommand 里把它原样塞进 resultJson：
 *
 *   repo.finalizeCommand(commandId, {
 *     status: "completed",
 *     result: { output: raw.data.output ?? null, usage: raw.data.usage ?? null },
 *   })
 *
 * 这里只取 output 字段做 assistant content，usage（token 计数）不喂给 LLM。
 */
function extractAssistantText(resultJson: string | null): string | null {
  if (!resultJson) return null;
  try {
    const parsed = JSON.parse(resultJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out = (parsed as { output?: unknown }).output;
      if (typeof out === "string" && out.trim().length > 0) return out;
    }
    if (typeof parsed === "string" && parsed.trim().length > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

// ---------- runCommand：单流消费，挂起/续跑走 approval 控制面 ----------

type RunCommandInput = {
  commandId: string;
  sessionId: string;
  userMessage: string;
  context: Record<string, unknown>;
  /** 已完成 command 的 user/assistant turn 列表，发给 Hermes 做多轮对话 prefix。 */
  history: HermesHistoryTurn[];
  logger: Logger;
};

/**
 * message.delta 聚合器。
 *
 * Hermes 一次回复可能产生几十个 token 级 delta，每个 delta 单独落库/广播太吵，
 * 前端也不好渲染。策略：拼到一个 buffer 里，遇到边界事件时一次性 flush 成
 * 一条 `agent_message`。边界包括：tool.started / reasoning.available /
 * approval.request / run.completed / run.failed / run.cancelled。
 *
 * 同时保留一点"软刷新"——buffer 过长（>2000 字）也主动 flush，
 * 避免长回答被压缩成一条巨大事件影响 SSE 消费。
 */
class DeltaAggregator {
  private buffer = "";
  private readonly maxChars = 2000;

  append(delta: string): CommandStreamEvent | null {
    if (!delta) return null;
    this.buffer += delta;
    if (this.buffer.length >= this.maxChars) {
      return this.flush();
    }
    return null;
  }

  flush(): CommandStreamEvent | null {
    if (!this.buffer) return null;
    const msg: CommandStreamEvent = {
      type: "agent_message",
      message: this.buffer,
    };
    this.buffer = "";
    return msg;
  }
}

async function runCommand(input: RunCommandInput): Promise<void> {
  const { commandId, sessionId, userMessage, context, history, logger } = input;

  const aggregator = new DeltaAggregator();
  let finalized = false;
  let runId: string | null = null;

  /**
   * 把聚合器里尚未发出的 delta flush 成 agent_message（如有）。
   * 每次在"边界"处调一下，保证顺序：先冲业务消息，再发边界事件。
   */
  const flushDeltas = async (): Promise<void> => {
    const ev = aggregator.flush();
    if (ev) await appendAndBroadcast(commandId, ev);
  };

  try {
    await repo.updateCommandStatus(commandId, "running");

    // Phase 1: 创建 run 拿到 run_id，落库供后续 approval / stop 使用
    const started = await hermesClient.streamMessage(
      {
        commandId,
        sessionId,
        message: userMessage,
        context,
        ...(history.length > 0 ? { history } : {}),
      },
      logger,
    );
    runId = started.runId;
    await repo.setCommandHermesRunId(commandId, runId);
    logger.info({ runId }, "Hermes run created, consuming events");

    // Phase 2: 消费事件流
    for await (const raw of started.events) {
      // ---- 终态事件：flush delta → 写终态 → break ----
      if (raw.event === "run.completed") {
        await flushDeltas();
        const final: CommandStreamEvent = {
          type: "final",
          result: {
            output: raw.data.output ?? null,
            usage: raw.data.usage ?? null,
          },
        };
        if (typeof raw.data.output === "string") final.message = raw.data.output;
        await appendAndBroadcast(commandId, final);
        await repo.finalizeCommand(commandId, {
          status: "completed",
          result: final.result,
        });
        finalized = true;
        break;
      }

      if (raw.event === "run.failed") {
        await flushDeltas();
        const msg = typeof raw.data.error === "string" ? raw.data.error : "Hermes Agent 执行失败。";
        const err: CommandStreamEvent = {
          type: "error",
          code: "HERMES_AGENT_ERROR",
          message: msg,
        };
        await appendAndBroadcast(commandId, err);
        await repo.finalizeCommand(commandId, {
          status: "failed",
          error: { code: "HERMES_AGENT_ERROR", message: msg },
        });
        finalized = true;
        break;
      }

      if (raw.event === "run.cancelled") {
        await flushDeltas();
        const done: CommandStreamEvent = {
          type: "final",
          message: "已取消本次操作。",
          result: { status: "cancelled" },
        };
        await appendAndBroadcast(commandId, done);
        await repo.finalizeCommand(commandId, { status: "cancelled" });
        finalized = true;
        break;
      }

      // ---- 中间事件：先按需 flush 再派发 ----
      const mapped = mapHermesMidEvent(raw);
      if (!mapped) continue;

      if (mapped.type !== "agent_message") {
        // 边界事件：先冲掉 delta buffer，再发它自己
        await flushDeltas();
      }

      if (mapped.type === "need_confirmation") {
        // 挂起，等前端决策。Hermes 侧 SSE 流不会因此关闭——它只是暂停推新事件
        // 直到我们 POST /approval。
        await repo.updateCommandStatus(commandId, "waiting_confirmation");
        await appendAndBroadcast(commandId, mapped);
        logger.info(
          { confirmationId: mapped.confirmationId },
          "Command paused waiting for confirmation",
        );

        const decision = await pendingConfirmations.waitForDecision(
          mapped.confirmationId,
          commandId,
        );
        logger.info(
          { confirmationId: mapped.confirmationId, action: decision.action },
          "Confirmation decision received",
        );

        // 决策 → Hermes approval API
        const choice: "once" | "deny" = decision.action === "confirm" ? "once" : "deny";
        try {
          await hermesClient.resolveApproval({ runId, choice }, logger);
        } catch (err) {
          logger.error({ err, runId, choice }, "Failed to resolve Hermes approval; run may stall");
          // approval 调用失败不是终态——Hermes 侧的 SSE 仍然挂着。
          // 兜底：发一个 error 事件并终止，避免悬挂
          const errEv: CommandStreamEvent = {
            type: "error",
            code: err instanceof HermesError ? err.code : "INTERNAL_ERROR",
            message: err instanceof Error ? err.message : "无法转发审批结果给 Hermes",
          };
          await appendAndBroadcast(commandId, errEv);
          await repo.finalizeCommand(commandId, {
            status: "failed",
            error: { code: errEv.code, message: errEv.message },
          });
          finalized = true;
          break;
        }

        // cancel 语义用 deny 就够了——Hermes 会自己推 run.failed 或 run.completed
        // 取决于 skill 实现。decision 之后回到 for-await 消费剩余事件。
        await repo.updateCommandStatus(commandId, "running");
        continue;
      }

      // 普通事件：thinking / agent_message(single delta) / tool_start / tool_result
      if (mapped.type === "agent_message") {
        // 来自 DeltaAggregator.flush 的聚合消息（我们不会自己构造单 delta 的
        // agent_message，全部走 aggregator），这里分支实际不会走到；保留以防未来扩展
        await appendAndBroadcast(commandId, mapped);
        continue;
      }

      await appendAndBroadcast(commandId, mapped);
    }

    if (!finalized) {
      // Hermes 事件流结束却没发任何终态事件——把 command 推成 failed 兜底
      await flushDeltas();
      const msg = "Hermes 流已结束但未返回 run.completed / failed / cancelled。";
      const err: CommandStreamEvent = {
        type: "error",
        code: "HERMES_AGENT_ERROR",
        message: msg,
      };
      await appendAndBroadcast(commandId, err);
      await repo.finalizeCommand(commandId, {
        status: "failed",
        error: { code: "HERMES_AGENT_ERROR", message: msg },
      });
      finalized = true;
    }

    logger.info({ runId }, "Command loop exited normally");
  } catch (err) {
    const mapped: CommandStreamEvent =
      err instanceof HermesError
        ? { type: "error", code: err.code, message: err.message }
        : {
            type: "error",
            code: "INTERNAL_ERROR",
            message: err instanceof Error ? err.message : "Unknown error",
          };

    try {
      // 兜底 flush，避免掉尾部文本
      const leftover = aggregator.flush();
      if (leftover) await appendAndBroadcast(commandId, leftover);

      await appendAndBroadcast(commandId, mapped);
      await repo.finalizeCommand(commandId, {
        status: "failed",
        error: {
          message: mapped.message,
          ...(mapped.code !== undefined ? { code: mapped.code } : {}),
        },
      });
      finalized = true;
    } catch (inner) {
      logger.error({ err: inner }, "Failed to persist error event during runCommand failure");
    }

    logger.warn({ err, code: mapped.code }, "Command failed inside runCommand");
  } finally {
    pendingConfirmations.cancelAllForCommand(commandId);
    commandEventBus.publishEnd(commandId);
    if (!finalized) {
      logger.warn("runCommand exiting without finalizing command status");
    }
  }

  // ===== helper: 把一条中间事件附加到 aggregator / 转成 CommandStreamEvent =====
  function mapHermesMidEvent(raw: HermesRawEvent): CommandStreamEvent | null {
    const d = raw.data;
    switch (raw.event) {
      case "message.delta": {
        const delta = typeof d.delta === "string" ? d.delta : "";
        const flushed = aggregator.append(delta);
        // append 只在缓冲超阈值时才返回，日常情况下返回 null，等边界事件 flush
        return flushed;
      }
      case "reasoning.available":
        return {
          type: "thinking",
          message: typeof d.text === "string" ? d.text : "",
        };
      case "tool.started":
        return {
          type: "tool_start",
          toolName: typeof d.tool === "string" ? d.tool : "",
          displayName: typeof d.tool === "string" ? d.tool : "",
        };
      case "tool.completed": {
        const out: CommandStreamEvent = {
          type: "tool_result",
          toolName: typeof d.tool === "string" ? d.tool : "",
          summary: buildToolSummary(d),
        };
        return out;
      }
      case "approval.request": {
        // Hermes approval payload 里没有一个稳定的"confirmationId"概念，
        // 我们用 run_id 作为稳定 id：同一个 run 同时只会有一个挂起的 approval。
        return {
          type: "need_confirmation",
          confirmationId: typeof d.run_id === "string" ? d.run_id : (runId ?? commandId),
          message: typeof d.message === "string" ? d.message : "需要用户确认才能继续。",
          payload: d,
        };
      }
      // 审批回执、ping 之类信息性事件不再转发给前端
      case "approval.responded":
      default:
        return null;
    }
  }
}

function buildToolSummary(d: Record<string, unknown>): string {
  const tool = typeof d.tool === "string" ? d.tool : "tool";
  const duration = typeof d.duration === "number" ? `${d.duration.toFixed(2)}s` : null;
  const hasError = d.error === true;
  if (hasError) return `${tool} 执行失败${duration ? `（${duration}）` : ""}`;
  return duration ? `${tool} 执行完成（${duration}）` : `${tool} 执行完成`;
}

// ---------- 事件落库 + 广播 ----------

async function appendAndBroadcast(
  commandId: string,
  event: CommandStreamEvent,
): Promise<CommandEventRowWithSeq> {
  const row = await repo.appendEvent(commandId, event);
  commandEventBus.publishEvent(commandId, row);
  return row;
}

// ---------- 事件回放 & 订阅（SSE route 用） ----------

export async function getCommandOrThrow(commandId: string) {
  const row = await repo.getCommandById(commandId);
  if (!row) throw new NotFoundError("Command", commandId);
  return row;
}

export async function replayEvents(
  commandId: string,
  lastEventId?: string,
): Promise<CommandEventRowWithSeq[]> {
  if (!lastEventId) return repo.listEventsByCommand(commandId);
  const cursor = await repo.getEventById(lastEventId);
  if (!cursor || cursor.commandId !== commandId) {
    baseLogger.warn(
      { commandId, lastEventId },
      "Invalid Last-Event-ID, falling back to full replay",
    );
    return repo.listEventsByCommand(commandId);
  }
  return repo.listEventsAfter(commandId, cursor.seq);
}

export function rowToStreamEvent(row: CommandEventRowWithSeq): CommandStreamEvent | null {
  try {
    return JSON.parse(row.payloadJson) as CommandStreamEvent;
  } catch {
    return null;
  }
}

export async function listEvents(commandId: string): Promise<CommandStreamEvent[]> {
  await getCommandOrThrow(commandId);
  const rows = await repo.listEventsByCommand(commandId);
  return rows.map(rowToStreamEvent).filter((e): e is CommandStreamEvent => e !== null);
}

// ---------- 前端确认回执 ----------

/**
 * POST /confirmations/:id 的服务层入口。幂等：如果 confirmationId 已失效，
 * 返回 accepted=false，不抛错——前端可以直接关卡片即可。
 */
export async function resolveConfirmation(
  confirmationId: string,
  input: ConfirmCommandActionInput,
  logger: Logger,
): Promise<ConfirmationResponseDto> {
  const decision: ConfirmationDecision =
    input.action === "confirm"
      ? input.payload !== undefined
        ? { action: "confirm", payload: input.payload }
        : { action: "confirm" }
      : input.payload !== undefined
        ? { action: "cancel", payload: input.payload }
        : { action: "cancel" };

  const result = pendingConfirmations.resolve(confirmationId, decision);
  if (!result) {
    logger.info(
      { confirmationId, action: input.action },
      "Confirmation arrived but no pending entry (likely expired or already resolved)",
    );
    return {
      confirmationId,
      commandId: "",
      action: input.action,
      accepted: false,
    };
  }
  logger.info(
    { confirmationId, commandId: result.commandId, action: input.action },
    "Confirmation delivered to runCommand",
  );
  return {
    confirmationId,
    commandId: result.commandId,
    action: input.action,
    accepted: true,
  };
}

export type { CommandStatus };
