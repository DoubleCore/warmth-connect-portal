import { streamSSE } from "hono/streaming";
import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import { baseLogger } from "@/shared/logger.js";
import {
  confirmCommandActionSchema,
  createCommandSessionSchema,
  sendCommandMessageSchema,
} from "./command.dto.js";
import * as service from "./command.service.js";
import { commandEventBus, type BusEvent } from "./command.bus.js";
import { hermesClient } from "./hermes.client.js";

/**
 * 挂在 /api/command 上。
 * 对应 Hermes_Command_Center_HTTP_直连可用版.md §5。
 *
 * Phase 3 路由（当前实现）：
 *   POST /api/command/sessions                          创建会话
 *   POST /api/command/sessions/:sessionId/messages      发送指令（立即返回 streamUrl）
 *   GET  /api/command/commands/:commandId/stream        SSE 推送 Agent 过程 + 最终结果
 *   GET  /api/command/commands/:commandId/events        事件回放（调试 / 兜底轮询）
 *   POST /api/command/confirmations/:confirmationId     确认卡片回执（confirm / cancel）
 *   GET  /api/command/_debug/hermes-ping                快速确认 Backend 能否连通 Hermes
 */
export const commandRouter = createRouter();

// ---------- sessions ----------

commandRouter.post("/sessions", zv("json", createCommandSessionSchema), async (c) => {
  const body = c.req.valid("json");
  const session = await service.createSession(body);
  return created(c, session);
});

// ---------- messages（Phase 1 非流式） ----------

commandRouter.post(
  "/sessions/:sessionId/messages",
  zv("json", sendCommandMessageSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = c.req.valid("json");
    const logger = c.get("logger") ?? baseLogger;
    const result = await service.sendMessage(sessionId, body, logger);
    return ok(c, result);
  },
);

// ---------- events（调试 + SSE 重连兜底） ----------

commandRouter.get("/commands/:commandId/events", async (c) => {
  const commandId = c.req.param("commandId");
  const events = await service.listEvents(commandId);
  return ok(c, { commandId, events });
});

// ---------- SSE 流 ----------

/**
 * 设计文档 §5.3 / §14 第二阶段。
 *
 * 行为：
 *   1. 先把历史事件按时间序回放（若带 Last-Event-ID 则只回放之后的）
 *   2. 再订阅 commandEventBus，边来边推
 *   3. 若 command 已终态，回放完立刻 end / close
 *   4. 心跳：每 15s 发一个注释帧（`: ping`），避免中间代理把连接切断
 *   5. 客户端断开（c.req.raw.signal aborted）时清理订阅 + 关闭流
 */
commandRouter.get("/commands/:commandId/stream", async (c) => {
  const commandId = c.req.param("commandId");
  const logger = (c.get("logger") ?? baseLogger).child({ commandId, route: "sse" });

  // 先确认 command 存在，否则 404 更直观。
  const command = await service.getCommandOrThrow(commandId);

  const lastEventId = c.req.header("last-event-id") ?? undefined;

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let ended = false;
    let heartbeat: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;

    const closeStream = async () => {
      if (ended) return;
      ended = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      try {
        await stream.writeSSE({ event: "end", data: "{}" });
      } catch {
        // 客户端已断，忽略
      }
    };

    // 客户端主动断开：清理订阅 + 结束生成
    const onAbort = () => {
      logger.debug("SSE client aborted");
      void closeStream();
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });

    try {
      // 1) 回放历史
      const replayRows = await service.replayEvents(commandId, lastEventId);
      for (const row of replayRows) {
        const ev = service.rowToStreamEvent(row);
        if (!ev) continue;
        await stream.writeSSE({
          id: row.id,
          event: ev.type,
          data: JSON.stringify(ev),
        });
      }

      // 2) 若 command 已终态，回放完就结束
      const terminal: ReadonlyArray<string> = ["completed", "failed", "cancelled"];
      if (terminal.includes(command.status)) {
        logger.debug({ status: command.status }, "SSE replay-only (command already terminal)");
        await closeStream();
        return;
      }

      // 3) 心跳：每 15 秒一个注释帧。stream.writeSSE 不支持纯注释，
      //    用低噪音 `event: ping` + 空 data 即可。
      heartbeat = setInterval(() => {
        stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {
          // 写失败说明客户端已断，让 abort handler 收尾
        });
      }, 15_000);

      // 4) 订阅 bus
      await new Promise<void>((resolve) => {
        // 订阅函数：收到事件就写 SSE；收到 end 就结束 promise
        unsubscribe = commandEventBus.subscribe(commandId, (ev: BusEvent) => {
          if (ev.kind === "end") {
            resolve();
            return;
          }
          const streamEvent = service.rowToStreamEvent(ev.row);
          if (!streamEvent) return;
          stream
            .writeSSE({
              id: ev.row.id,
              event: streamEvent.type,
              data: JSON.stringify(streamEvent),
            })
            .catch(() => {
              // 客户端断开：让外层 onAbort 收拾残局
              resolve();
            });
        });

        // 订阅期间客户端断开同样要 resolve，避免卡住
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
    } finally {
      abortSignal.removeEventListener("abort", onAbort);
      await closeStream();
    }
  });
});

// ---------- 调试：联调 Hermes 是否可达 ----------

commandRouter.get("/_debug/hermes-ping", async (c) => {
  const logger = c.get("logger") ?? baseLogger;
  const reachable = await hermesClient.ping(logger);
  return ok(c, { reachable });
});

// ---------- 确认卡片（Phase 3） ----------

/**
 * 对应设计文档 §10：
 *   POST /api/command/confirmations/:confirmationId
 *   body: { action: "confirm" | "cancel", payload?: {...} }
 *
 * 行为：
 *   - 把决策递给挂起的 runCommand（若该 confirmationId 仍在等）
 *   - 若已失效 / 已被处理 / 已过期 → 200 + accepted=false（保持幂等）
 */
commandRouter.post(
  "/confirmations/:confirmationId",
  zv("json", confirmCommandActionSchema),
  async (c) => {
    const confirmationId = c.req.param("confirmationId");
    const body = c.req.valid("json");
    const logger = c.get("logger") ?? baseLogger;
    const result = await service.resolveConfirmation(confirmationId, body, logger);
    return ok(c, result);
  },
);
