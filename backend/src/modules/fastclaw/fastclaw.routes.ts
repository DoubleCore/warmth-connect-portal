import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import type { Logger } from "pino";
import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import { baseLogger } from "@/shared/logger.js";
import {
  createFastClawSessionSchema,
  fastclawChatSchema,
  fastclawDeploySchema,
  sendFastClawMessageSchema,
} from "./fastclaw.dto.js";
import type { FastClawStreamChunk } from "./fastclaw.client.js";
import { fastclawRunEventBus, type FastClawBusEvent } from "./fastclaw.bus.js";
import * as service from "./fastclaw.service.js";

/**
 * 挂在 /api/fastclaw 上。
 *
 * 路由：
 *   POST /api/fastclaw/chat          非流式对话（返回完整 JSON）
 *   POST /api/fastclaw/chat/stream   流式对话（SSE）
 *   GET  /api/fastclaw/ping          FastClaw 健康检查
 */
export const fastclawRouter = createRouter();

// ---------- Persistent sessions / runs ----------

fastclawRouter.post("/sessions", zv("json", createFastClawSessionSchema), async (c) => {
  const body = c.req.valid("json");
  const session = await service.createSession(body);
  return created(c, session);
});

fastclawRouter.get("/sessions/:sessionId/history", async (c) => {
  const sessionId = c.req.param("sessionId");
  const history = await service.getSessionHistory(sessionId);
  return ok(c, history);
});

fastclawRouter.post(
  "/sessions/:sessionId/messages",
  zv("json", sendFastClawMessageSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = c.req.valid("json");
    const logger = c.get("logger") ?? baseLogger;
    const result = await service.sendPersistentMessage(sessionId, body, logger);
    return ok(c, result);
  },
);

fastclawRouter.post("/sessions/:sessionId/deploy", zv("json", fastclawDeploySchema), async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = c.req.valid("json");
  const logger = c.get("logger") ?? baseLogger;
  const result = await service.startPersistentDeploy(sessionId, body, logger);
  return ok(c, result);
});

fastclawRouter.get("/runs/:runId/events", async (c) => {
  const runId = c.req.param("runId");
  const events = await service.listEvents(runId);
  return ok(c, { runId, events });
});

fastclawRouter.get("/runs/:runId/stream", async (c) => {
  const runId = c.req.param("runId");
  const logger = (c.get("logger") ?? baseLogger).child({ runId, route: "fastclaw-run-sse" });
  await service.getRunOrThrow(runId);
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
        // client disconnected
      }
    };

    const onAbort = () => {
      logger.debug("FastClaw run SSE client aborted");
      void closeStream();
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });

    try {
      const replayRows = await service.replayEvents(runId, lastEventId);
      for (const row of replayRows) {
        const event = service.rowToStreamEvent(row);
        if (!event) continue;
        await stream.writeSSE({
          id: row.id,
          event: event.type,
          data: JSON.stringify(event),
        });
      }

      const terminal: ReadonlyArray<string> = ["completed", "failed", "cancelled"];
      const latestRun = await service.getRunOrThrow(runId);
      if (terminal.includes(latestRun.status)) {
        await closeStream();
        return;
      }

      heartbeat = setInterval(() => {
        stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {
          // The abort handler closes the stream.
        });
      }, 15_000);

      await new Promise<void>((resolve) => {
        unsubscribe = fastclawRunEventBus.subscribe(runId, (event: FastClawBusEvent) => {
          if (event.kind === "end") {
            resolve();
            return;
          }
          const streamEvent = service.rowToStreamEvent(event.row);
          if (!streamEvent) return;
          stream
            .writeSSE({
              id: event.row.id,
              event: streamEvent.type,
              data: JSON.stringify(streamEvent),
            })
            .catch(() => resolve());
        });

        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
    } finally {
      abortSignal.removeEventListener("abort", onAbort);
      await closeStream();
    }
  });
});

type StreamState = {
  ended: boolean;
};

async function closeSseStream(stream: SSEStreamingApi, state: StreamState): Promise<void> {
  if (state.ended) return;
  state.ended = true;
  try {
    await stream.writeSSE({ event: "done", data: "{}" });
  } catch {
    // client disconnected
  }
}

async function pipeFastClawChunksToSse(
  stream: SSEStreamingApi,
  chunks: AsyncIterable<FastClawStreamChunk>,
  state: StreamState,
): Promise<void> {
  for await (const chunk of chunks) {
    if (state.ended) break;

    // [DONE] 标记
    if (chunk.finishReason === "stop" && chunk.content === "") {
      break;
    }

    if (chunk.content) {
      await stream.writeSSE({
        event: "delta",
        data: JSON.stringify({ content: chunk.content }),
      });
    }

    if (chunk.finishReason) {
      break;
    }
  }
}

function attachClientAbortHandler(
  signal: AbortSignal,
  stream: SSEStreamingApi,
  state: StreamState,
  logger: Logger,
): () => void {
  const onAbort = () => {
    logger.debug("FastClaw SSE client aborted");
    void closeSseStream(stream, state);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

// ---------- 非流式对话 ----------

fastclawRouter.post("/chat", zv("json", fastclawChatSchema), async (c) => {
  const body = c.req.valid("json");
  const logger = c.get("logger") ?? baseLogger;
  const requestId = c.get("requestId");

  const result = await service.chat({ ...body, stream: false }, requestId, logger);
  return ok(c, result);
});

// ---------- 流式对话 (SSE) ----------

fastclawRouter.post("/chat/stream", zv("json", fastclawChatSchema), async (c) => {
  const body = c.req.valid("json");
  const logger = (c.get("logger") ?? baseLogger).child({ route: "fastclaw-stream" });

  // 先确认服务可用
  service.ensureConfigured();

  const chunks = await service.chatStream(body, logger);

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const state: StreamState = { ended: false };
    const detachAbortHandler = attachClientAbortHandler(abortSignal, stream, state, logger);

    try {
      await pipeFastClawChunksToSse(stream, chunks, state);
    } catch (err) {
      logger.error({ err }, "FastClaw stream error");
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          error: err instanceof Error ? err.message : "Stream error",
        }),
      });
    } finally {
      detachAbortHandler();
      await closeSseStream(stream, state);
    }
  });
});

// ---------- 健康检查 ----------

fastclawRouter.get("/ping", async (c) => {
  const logger = c.get("logger") ?? baseLogger;
  const reachable = await service.ping(logger);
  return ok(c, { reachable });
});

// ---------- 部署对话 ----------

fastclawRouter.post("/deploy/stream", zv("json", fastclawDeploySchema), async (c) => {
  const body = c.req.valid("json");
  const logger = (c.get("logger") ?? baseLogger).child({ route: "fastclaw-deploy" });

  service.ensureConfigured();

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const state: StreamState = { ended: false };
    const detachAbortHandler = attachClientAbortHandler(abortSignal, stream, state, logger);

    try {
      // 先推一条状态，让用户知道请求已接收；后续内容直接来自 FastClaw 部署 agent。
      await stream.writeSSE({
        event: "delta",
        data: JSON.stringify({ content: "🔄 正在连接 FastClaw 部署 agent，准备执行部署流程…\n\n" }),
      });

      const chunks = await service.deployChatStream(body, logger);
      await pipeFastClawChunksToSse(stream, chunks, state);
    } catch (err) {
      logger.error({ err }, "FastClaw deploy error");
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          error: err instanceof Error ? err.message : "Deploy error",
        }),
      });
    } finally {
      detachAbortHandler();
      await closeSseStream(stream, state);
    }
  });
});
