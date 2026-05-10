import type { Logger } from "pino";
import { NotFoundError } from "@/shared/errors.js";
import type {
  CommandMessageResponseDto,
  CommandSessionDto,
  CommandStreamEvent,
  CreateCommandSessionInput,
  SendCommandMessageInput,
} from "./command.dto.js";
import { hermesClient, HermesError } from "./hermes.client.js";
import * as repo from "./command.repository.js";

/**
 * CommandOrchestrator —— Hermes 指令中心的主流程编排。
 * 对应 Hermes_Command_Center_HTTP_直连可用版.md §8.2。
 *
 * Phase 1（当前实现）：
 *   1. 前端 POST /messages 带 user message + context
 *   2. Backend 写入 command(pending -> running)
 *   3. HermesHttpClient 非流式调用 /agent/message
 *   4. 成功：写 final 事件 + finalizeCommand(completed)
 *      失败：写 error 事件 + finalizeCommand(failed)
 *   5. 同步返回前端完整结果（streamUrl 为 null）
 *
 * Phase 2 会在这里增加：
 *   - 异步 runInBackground + SSE 广播
 *   - streamMessage 解析中间事件（thinking / tool_start / tool_result）
 *   - need_confirmation 的挂起逻辑
 */

// ---------- sessions ----------

export async function createSession(
  input: CreateCommandSessionInput,
): Promise<CommandSessionDto> {
  const row = await repo.insertSession({
    entry: input.entry ?? null,
    initialContext: input.initialContext ?? {},
    userId: null, // Phase 1 没有鉴权，先留空
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
 * 发送一条自然语言指令。
 *
 * 非流式语义：这里会阻塞直到 Hermes 返回或超时。
 * - HermesError 会被转成 CommandStreamEvent(error) 记录 + finalizeCommand(failed)
 *   然后按 AppError 语义抛出，由全局错误中间件返回给前端。
 * - 非预期异常会被写成 INTERNAL_ERROR 事件后继续抛出，保证 command 不会留在 running 态。
 */
export async function sendMessage(
  sessionId: string,
  input: SendCommandMessageInput,
  logger: Logger,
): Promise<CommandMessageResponseDto> {
  // 会话必须存在——否则前端拿到的 commandId 没有绑定上下文，排查会很困难。
  await getSessionOrThrow(sessionId);

  const command = await repo.insertCommand({
    sessionId,
    userId: null, // Phase 1 没有鉴权
    userMessage: input.message,
    context: input.context ?? {},
  });

  await repo.updateCommandStatus(command.id, "running");

  const cmdLogger = logger.child({ commandId: command.id, sessionId });
  cmdLogger.info(
    { messagePreview: input.message.slice(0, 200) },
    "Command dispatched to Hermes",
  );

  try {
    const hermes = await hermesClient.sendMessage(
      {
        commandId: command.id,
        sessionId,
        message: input.message,
        context: input.context ?? {},
      },
      cmdLogger,
    );

    const finalEvent: CommandStreamEvent = {
      type: "final",
      ...(hermes.message !== undefined ? { message: hermes.message } : {}),
      result: hermes.result ?? null,
    };
    await repo.appendEvent(command.id, finalEvent);
    await repo.finalizeCommand(command.id, {
      status: "completed",
      result: hermes.result ?? null,
    });

    cmdLogger.info("Command completed");
    return {
      commandId: command.id,
      status: "completed",
      streamUrl: null, // Phase 1 非流式；Phase 2 返回 `/api/command/commands/${id}/stream`
      ...(hermes.message !== undefined ? { message: hermes.message } : {}),
      result: hermes.result ?? null,
    };
  } catch (err) {
    // 失败路径：落库 + 上抛。
    if (err instanceof HermesError) {
      const errorEvent: CommandStreamEvent = {
        type: "error",
        code: err.code,
        message: err.message,
      };
      await repo.appendEvent(command.id, errorEvent);
      await repo.finalizeCommand(command.id, {
        status: "failed",
        error: { code: err.code, message: err.message },
      });
      cmdLogger.warn({ code: err.code }, "Command failed due to Hermes error");
      throw err;
    }

    // 非预期异常也要兜底写库，否则 running 态会留存。
    const message = err instanceof Error ? err.message : "Unknown error";
    const errorEvent: CommandStreamEvent = {
      type: "error",
      code: "INTERNAL_ERROR",
      message,
    };
    await repo.appendEvent(command.id, errorEvent);
    await repo.finalizeCommand(command.id, {
      status: "failed",
      error: { code: "INTERNAL_ERROR", message },
    });
    cmdLogger.error({ err }, "Command failed with unexpected error");
    throw err;
  }
}

// ---------- 事件回放（Phase 2 SSE 重连会用到，Phase 1 先给 /events 调试用） ----------

export async function listEvents(commandId: string): Promise<CommandStreamEvent[]> {
  const command = await repo.getCommandById(commandId);
  if (!command) throw new NotFoundError("Command", commandId);
  const rows = await repo.listEventsByCommand(commandId);
  const events: CommandStreamEvent[] = [];
  for (const row of rows) {
    try {
      events.push(JSON.parse(row.payloadJson) as CommandStreamEvent);
    } catch {
      // 某条损坏不影响其他事件
    }
  }
  return events;
}
