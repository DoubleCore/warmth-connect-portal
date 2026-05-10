import type { Logger } from "pino";
import { NotFoundError } from "@/shared/errors.js";
import { baseLogger } from "@/shared/logger.js";
import type {
  CommandMessageResponseDto,
  CommandSessionDto,
  CommandStatus,
  CommandStreamEvent,
  CreateCommandSessionInput,
  SendCommandMessageInput,
} from "./command.dto.js";
import {
  hermesClient,
  HermesError,
  type HermesRawEvent,
} from "./hermes.client.js";
import { commandEventBus } from "./command.bus.js";
import * as repo from "./command.repository.js";
import type { CommandEventRowWithSeq } from "./command.repository.js";

/**
 * CommandOrchestrator —— Hermes 指令中心的主流程编排。
 * 对应 Hermes_Command_Center_HTTP_直连可用版.md §8.2。
 *
 * Phase 2（当前实现，流式）：
 *   1. 前端 POST /messages → Backend 立刻写入 command(pending)，返回
 *      { commandId, status: "running", streamUrl }
 *   2. runCommand 异步启动：HermesHttpClient 流式调用 /agent/message/stream
 *   3. 每一帧 Hermes 原始事件 → mapper 转成 CommandStreamEvent
 *      → 写库 → commandEventBus 广播给 SSE 订阅者
 *   4. 终态（final / error）到达后写 finalizeCommand + publishEnd
 *
 * 关键不变式：
 *   - 所有 Hermes 输出都先回到 Backend，再广播 / 写库
 *   - command 一旦落入 "running" 态，runCommand 必须把它推进到终态
 *     （completed / failed / cancelled），不会留悬空
 */

// ---------- sessions ----------

export async function createSession(
  input: CreateCommandSessionInput,
): Promise<CommandSessionDto> {
  const row = await repo.insertSession({
    entry: input.entry ?? null,
    initialContext: input.initialContext ?? {},
    userId: null, // Phase 2 仍未接鉴权
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

/**
 * SSE 模式下 Backend 提供的订阅接口。给 route 层用。
 */
export function buildStreamUrl(commandId: string): string {
  return `/api/command/commands/${commandId}/stream`;
}

/**
 * 发送一条指令。非阻塞：
 *  - 同步完成：写入 commands(pending) + 启动后台 runCommand
 *  - 同步返回：{ commandId, status: "running", streamUrl }
 *
 * 任何 Hermes 失败会在后台 runCommand 里被捕获并落到 command_events(error) +
 * finalizeCommand("failed")，SSE 订阅者能完整看到 error + end。
 */
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

  // 后台启动；不 await，避免阻塞 HTTP 响应。
  // logger 要单独抓取，因为请求上下文在响应返回后就不再可用，
  // 所以这里 child 一次绑定 commandId/sessionId，后续全程用它。
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

// ---------- 后台流式 runCommand ----------

type RunCommandInput = {
  commandId: string;
  sessionId: string;
  userMessage: string;
  context: Record<string, unknown>;
  logger: Logger;
};

/**
 * 后台执行：打开 Hermes 流，解析每帧事件，写库 + 广播。
 * 保证无论走到哪一步，最终都会走 finalize + publishEnd，SSE 订阅者不会悬挂。
 */
async function runCommand(input: RunCommandInput): Promise<void> {
  const { commandId, sessionId, userMessage, context, logger } = input;
  let finalized = false;

  try {
    await repo.updateCommandStatus(commandId, "running");

    const stream = hermesClient.streamMessage(
      { commandId, sessionId, message: userMessage, context },
      logger,
    );

    for await (const rawEvent of stream) {
      const mapped = mapHermesEvent(rawEvent);
      if (!mapped) continue; // 未知事件类型，静默丢弃

      await appendAndBroadcast(commandId, mapped);

      if (mapped.type === "final") {
        await repo.finalizeCommand(commandId, {
          status: "completed",
          result: mapped.result ?? null,
        });
        finalized = true;
        break; // Hermes 到 final 就应该结束流；即使 Hermes 继续发也不再处理
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
        break;
      }
      // TODO(Phase 3): need_confirmation 时进入 waiting_confirmation 态，
      // 在收到 POST /confirmations 之前暂停消费流。MVP 先原样透传给前端。
    }

    // Hermes 流正常结束但没发 final —— 视为 failed，避免前端无限等。
    if (!finalized) {
      const missingFinal: CommandStreamEvent = {
        type: "error",
        code: "HERMES_AGENT_ERROR",
        message: "Hermes 流已结束但未返回 final 事件。",
      };
      await appendAndBroadcast(commandId, missingFinal);
      await repo.finalizeCommand(commandId, {
        status: "failed",
        error: { code: "HERMES_AGENT_ERROR", message: missingFinal.message },
      });
      finalized = true;
    }

    logger.info("Command completed");
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
      // 写库失败：只能记日志，SSE 端会收到 end 超时或连接关闭
      logger.error(
        { err: inner },
        "Failed to persist error event during runCommand failure",
      );
    }

    logger.warn(
      { err, code: mapped.code },
      "Command failed inside runCommand",
    );
  } finally {
    // 不论是正常结束还是异常，都要广播 end，让 SSE 订阅者关掉连接
    commandEventBus.publishEnd(commandId);
    if (!finalized) {
      // 理论上走不到这里（前面的 catch 也会 finalize）；作为最后保险
      logger.warn("runCommand exiting without finalizing command status");
    }
  }
}

// ---------- Hermes raw event → CommandStreamEvent 映射 ----------

/**
 * 映射规则对应设计文档 §9。
 * - 未知事件返回 null（上层忽略）
 * - Hermes data 字段类型宽松处理：字段缺失就给默认值，避免前端 TS 报错
 */
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
      const out: CommandStreamEvent = { type: "final", result: d.result ?? null };
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

/**
 * 初始回放：把历史事件按时间序吐出。
 * Last-Event-ID 场景下返回"某 id 之后"的事件。
 */
export async function replayEvents(
  commandId: string,
  lastEventId?: string,
): Promise<CommandEventRowWithSeq[]> {
  if (!lastEventId) return repo.listEventsByCommand(commandId);
  const cursor = await repo.getEventById(lastEventId);
  if (!cursor || cursor.commandId !== commandId) {
    // 无效 cursor：保守地回放全部，避免前端看不到任何事件
    baseLogger.warn(
      { commandId, lastEventId },
      "Invalid Last-Event-ID, falling back to full replay",
    );
    return repo.listEventsByCommand(commandId);
  }
  return repo.listEventsAfter(commandId, cursor.seq);
}

/** 把 CommandEventRow 的 payload 还原成 CommandStreamEvent */
export function rowToStreamEvent(
  row: CommandEventRowWithSeq,
): CommandStreamEvent | null {
  try {
    return JSON.parse(row.payloadJson) as CommandStreamEvent;
  } catch {
    return null;
  }
}

/** 兼容 Phase 1 的 listEvents，保留为 route 层的调试接口 */
export async function listEvents(commandId: string): Promise<CommandStreamEvent[]> {
  await getCommandOrThrow(commandId);
  const rows = await repo.listEventsByCommand(commandId);
  return rows
    .map(rowToStreamEvent)
    .filter((e): e is CommandStreamEvent => e !== null);
}

export type { CommandStatus };
