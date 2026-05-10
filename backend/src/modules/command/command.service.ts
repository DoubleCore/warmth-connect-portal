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
  type HermesRawEvent,
} from "./hermes.client.js";
import { commandEventBus } from "./command.bus.js";
import {
  pendingConfirmations,
  type ConfirmationDecision,
} from "./command.confirmations.js";
import * as repo from "./command.repository.js";
import type { CommandEventRowWithSeq } from "./command.repository.js";

/**
 * CommandOrchestrator —— Hermes 指令中心的主流程编排。
 * 对应 Hermes_Command_Center_HTTP_直连可用版.md §8.2。
 *
 * Phase 3（当前实现）：
 *   1. sendMessage 异步启动 runCommand，立即返回 { status: "running", streamUrl }
 *   2. runCommand 用"可暂停续跑循环"消费 Hermes SSE：
 *      - 收到 need_confirmation → 落 waiting_confirmation + 关闭当前流，挂起等决策
 *      - confirm → streamResume 打开新流继续循环
 *      - cancel → 本地落 cancelled，fire-and-forget 通知 Hermes
 *   3. final/error 到达 → finalize 对应终态 + 广播 end
 *
 * 关键不变式：
 *   - 所有 Hermes 输出都先回 Backend，再写库 / 广播 / 推前端
 *   - command 一旦进入 running/waiting_confirmation，
 *     runCommand 最终必然把它推进到 completed/failed/cancelled，不会悬空
 */

// ---------- sessions ----------

export async function createSession(
  input: CreateCommandSessionInput,
): Promise<CommandSessionDto> {
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
  cmdLogger.info(
    { messagePreview: input.message.slice(0, 200) },
    "Command accepted, dispatching asynchronously",
  );

  void runCommand({
    commandId: command.id,
    sessionId,
    userMessage: input.message,
    context: input.context ?? {},
    logger: cmdLogger,
  });

  return {
    commandId: command.id,
    status: "running",
    streamUrl: buildStreamUrl(command.id),
  };
}

// ---------- 后台可暂停续跑的 runCommand ----------

type RunCommandInput = {
  commandId: string;
  sessionId: string;
  userMessage: string;
  context: Record<string, unknown>;
  logger: Logger;
};

async function runCommand(input: RunCommandInput): Promise<void> {
  const { commandId, sessionId, userMessage, context, logger } = input;
  let finalized = false;

  // 当前正在消费的 Hermes 流。初次来自 streamMessage，resume 后换成 streamResume 产出。
  let currentStream: AsyncIterable<HermesRawEvent> | null = null;

  try {
    await repo.updateCommandStatus(commandId, "running");
    currentStream = hermesClient.streamMessage(
      { commandId, sessionId, message: userMessage, context },
      logger,
    );

    resumeLoop: while (currentStream) {
      const stream = currentStream;
      currentStream = null;
      let paused = false;

      for await (const rawEvent of stream) {
        const mapped = mapHermesEvent(rawEvent);
        if (!mapped) continue;

        await appendAndBroadcast(commandId, mapped);

        if (mapped.type === "need_confirmation") {
          await repo.updateCommandStatus(commandId, "waiting_confirmation");
          logger.info(
            { confirmationId: mapped.confirmationId },
            "Command paused waiting for confirmation",
          );
          paused = true;
          // break 会触发生成器的 finally（reader.cancel），Hermes 侧连接随之关闭
          break;
        }

        if (mapped.type === "final") {
          await repo.finalizeCommand(commandId, {
            status: "completed",
            result: mapped.result ?? null,
          });
          finalized = true;
          break resumeLoop;
        }

        if (mapped.type === "error") {
          await repo.finalizeCommand(commandId, {
            status: "failed",
            error: {
              message: mapped.message,
              ...(mapped.code !== undefined ? { code: mapped.code } : {}),
            },
          });
          finalized = true;
          break resumeLoop;
        }
      }

      if (!paused) {
        if (!finalized) {
          const missingFinal: CommandStreamEvent = {
            type: "error",
            code: "HERMES_AGENT_ERROR",
            message: "Hermes 流已结束但未返回 final 事件。",
          };
          await appendAndBroadcast(commandId, missingFinal);
          await repo.finalizeCommand(commandId, {
            status: "failed",
            error: {
              code: "HERMES_AGENT_ERROR",
              message: missingFinal.message,
            },
          });
          finalized = true;
        }
        break;
      }

      // paused=true：等前端对最近一条 need_confirmation 的决策
      const pending = await findLatestConfirmationEvent(commandId);
      if (!pending) {
        logger.error(
          "Paused but no need_confirmation event found, failing command",
        );
        const missing: CommandStreamEvent = {
          type: "error",
          code: "INTERNAL_ERROR",
          message: "挂起后无法定位 confirmation，流程异常。",
        };
        await appendAndBroadcast(commandId, missing);
        await repo.finalizeCommand(commandId, {
          status: "failed",
          error: { code: "INTERNAL_ERROR", message: missing.message },
        });
        finalized = true;
        break;
      }

      const decision = await pendingConfirmations.waitForDecision(
        pending.confirmationId,
        commandId,
      );
      logger.info(
        { confirmationId: pending.confirmationId, action: decision.action },
        "Confirmation decision received",
      );

      if (decision.action === "cancel") {
        const cancelFinal: CommandStreamEvent = {
          type: "final",
          message: "已取消本次操作。",
          result: {
            status: "cancelled",
            confirmationId: pending.confirmationId,
          },
        };
        await appendAndBroadcast(commandId, cancelFinal);
        await repo.finalizeCommand(commandId, { status: "cancelled" });
        finalized = true;
        // fire-and-forget：即使 Hermes 那边失败也不影响前端 cancelled 结果
        void hermesClient
          .notifyCancel(
            { commandId, sessionId, reason: "user_cancelled_confirmation" },
            logger,
          )
          .catch(() => {
            /* client 内部已吞异常，这里是双保险 */
          });
        break;
      }

      // confirm：打开 resume 流继续
      await repo.updateCommandStatus(commandId, "running");
      currentStream = hermesClient.streamResume(
        {
          commandId,
          sessionId,
          confirmationId: pending.confirmationId,
          action: "confirm",
          ...(decision.payload !== undefined
            ? { payload: decision.payload }
            : {}),
        },
        logger,
      );
    }

    logger.info("Command loop exited");
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
      logger.error(
        { err: inner },
        "Failed to persist error event during runCommand failure",
      );
    }

    logger.warn({ err, code: mapped.code }, "Command failed inside runCommand");
  } finally {
    // 清理可能残留的挂起确认项
    pendingConfirmations.cancelAllForCommand(commandId);
    commandEventBus.publishEnd(commandId);
    if (!finalized) {
      logger.warn("runCommand exiting without finalizing command status");
    }
  }
}

/**
 * 倒序扫 command_events，找最近一条 need_confirmation 的 payload，拿 confirmationId。
 * need_confirmation 在本 command 的生命周期里通常只有 1~2 条，直接全扫就够。
 */
async function findLatestConfirmationEvent(
  commandId: string,
): Promise<{ confirmationId: string } | null> {
  const rows = await repo.listEventsByCommand(commandId);
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || row.eventType !== "need_confirmation") continue;
    const parsed = rowToStreamEvent(row);
    if (
      parsed &&
      parsed.type === "need_confirmation" &&
      parsed.confirmationId
    ) {
      return { confirmationId: parsed.confirmationId };
    }
  }
  return null;
}

// ---------- Hermes raw event → CommandStreamEvent 映射 ----------

function mapHermesEvent(raw: HermesRawEvent): CommandStreamEvent | null {
  const d = raw.data;
  switch (raw.event) {
    case "thinking":
      return { type: "thinking", message: pickString(d.message, "") };
    case "agent_message":
      return { type: "agent_message", message: pickString(d.message, "") };
    case "tool_start":
      return {
        type: "tool_start",
        toolName: pickString(d.toolName, ""),
        displayName: pickString(d.displayName, pickString(d.toolName, "")),
      };
    case "tool_result": {
      const out: CommandStreamEvent = {
        type: "tool_result",
        toolName: pickString(d.toolName, ""),
        summary: pickString(d.summary, ""),
      };
      if (d.result !== undefined) out.result = d.result;
      return out;
    }
    case "need_confirmation":
      return {
        type: "need_confirmation",
        confirmationId: pickString(d.confirmationId, ""),
        message: pickString(d.message, ""),
        payload: d.payload ?? null,
      };
    case "final": {
      const out: CommandStreamEvent = {
        type: "final",
        result: d.result ?? null,
      };
      if (typeof d.message === "string") out.message = d.message;
      return out;
    }
    case "error": {
      const out: CommandStreamEvent = {
        type: "error",
        message: pickString(d.message, "Hermes Agent 执行失败。"),
      };
      if (typeof d.code === "string") out.code = d.code;
      return out;
    }
    default:
      return null;
  }
}

function pickString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
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

export function rowToStreamEvent(
  row: CommandEventRowWithSeq,
): CommandStreamEvent | null {
  try {
    return JSON.parse(row.payloadJson) as CommandStreamEvent;
  } catch {
    return null;
  }
}

export async function listEvents(
  commandId: string,
): Promise<CommandStreamEvent[]> {
  await getCommandOrThrow(commandId);
  const rows = await repo.listEventsByCommand(commandId);
  return rows
    .map(rowToStreamEvent)
    .filter((e): e is CommandStreamEvent => e !== null);
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
