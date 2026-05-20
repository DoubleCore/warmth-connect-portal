import { streamSSE } from "hono/streaming";
import { createRouter } from "@/shared/context.js";
import { ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import { baseLogger } from "@/shared/logger.js";
import { fastclawChatSchema } from "./fastclaw.dto.js";
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
    let ended = false;

    const closeStream = async () => {
      if (ended) return;
      ended = true;
      try {
        await stream.writeSSE({ event: "done", data: "{}" });
      } catch {
        // client disconnected
      }
    };

    const onAbort = () => {
      logger.debug("FastClaw SSE client aborted");
      void closeStream();
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });

    try {
      for await (const chunk of chunks) {
        if (ended) break;

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
    } catch (err) {
      logger.error({ err }, "FastClaw stream error");
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          error: err instanceof Error ? err.message : "Stream error",
        }),
      });
    } finally {
      abortSignal.removeEventListener("abort", onAbort);
      await closeStream();
    }
  });
});

// ---------- 健康检查 ----------

fastclawRouter.get("/ping", async (c) => {
  const logger = c.get("logger") ?? baseLogger;
  const reachable = await service.ping(logger);
  return ok(c, { reachable });
});
