import type { Logger } from "pino";
import { env } from "@/config/env.js";
import { AppError } from "@/shared/errors.js";

/**
 * HermesHttpClient —— Backend 与本机 Hermes Agent 之间的 HTTP 通道。
 * 对应 Hermes_Command_Center_HTTP_直连可用版.md §7 / §8.3。
 *
 * 设计约束：
 *  1. 前端永远不直接连 Hermes，只有本模块会 fetch HERMES_BASE_URL。
 *  2. 所有 Hermes 错误在这里被包成 AppError(HERMES_*)，上层不需要再关心异常来源。
 *  3. Phase 1 只实现非流式 sendMessage；streamMessage 占位，Phase 2 再实现。
 */

// ---------- 请求 / 响应契约（与 Hermes 侧对齐） ----------

export type HermesMessageInput = {
  commandId: string;
  sessionId: string;
  message: string;
  context: Record<string, unknown>;
};

/**
 * Hermes /agent/message/resume 输入（Phase 3）。
 * 当 Backend 收到前端对 need_confirmation 的回复后，
 * 以同一个 commandId 调用 resume 继续 Agent 执行。
 * Hermes 侧仍然返回 SSE 流。
 */
export type HermesResumeInput = {
  commandId: string;
  sessionId: string;
  confirmationId: string;
  action: "confirm" | "cancel";
  payload?: Record<string, unknown>;
};

/**
 * Hermes /agent/message/cancel 输入（Phase 3，fire-and-forget）。
 * 前端选 cancel 时 Backend 立刻落终态，这里只是"尽力通知"Hermes 释放资源，
 * 失败不影响 Backend 已返回给前端的结果。
 */
export type HermesCancelInput = {
  commandId: string;
  sessionId: string;
  reason?: string;
};

/**
 * Hermes /agent/message 非流式响应（设计文档 §7.2）
 *
 * 对 result 使用 unknown 是刻意的：前端对 result 结构是开放接收的，
 * Backend 原样透传即可，不在 Backend 硬编码 Hermes 的业务结构。
 */
export type HermesMessageResult = {
  commandId: string;
  status: "completed" | "failed";
  message?: string;
  result?: unknown;
  error?: {
    code?: string;
    message: string;
  };
};

/**
 * Hermes 流式接口（设计文档 §7.3）每一帧 SSE 事件的结构化表示。
 * 事件名按设计文档 §9 已定义：thinking / agent_message / tool_start /
 * tool_result / need_confirmation / final / error。data 部分是 JSON 对象。
 *
 * 对未知事件类型，client 仍然产出 `HermesRawEvent`，由上层 mapper 决定忽略还是透传。
 */
export type HermesRawEvent = {
  event: string;
  /** SSE data 字段解析后的 JSON；若 Hermes 发送非 JSON 数据则退化为 { raw: string } */
  data: Record<string, unknown>;
  /** SSE id 字段，可选（用于 Last-Event-ID 续传） */
  id?: string;
};

// ---------- 错误 ----------

/**
 * 统一错误码。与设计文档 §12 对齐：
 *  - HERMES_CONNECTION_FAILED  无法连上 Hermes
 *  - HERMES_TIMEOUT            调用超时
 *  - HERMES_AGENT_ERROR        Hermes 返回非 2xx 或 payload 表示失败
 */
export class HermesError extends AppError {
  constructor(
    code: "HERMES_CONNECTION_FAILED" | "HERMES_TIMEOUT" | "HERMES_AGENT_ERROR",
    message: string,
    statusCode = 502,
    details?: unknown,
  ) {
    super(message, statusCode, code, details);
    this.name = "HermesError";
  }
}

// ---------- 客户端实现 ----------

function buildAuthHeader(): Record<string, string> {
  // HERMES_API_KEY 目前是可选：Hermes 本机监听时一般不需要鉴权；
  // 开启时统一用 Bearer，避免 Hermes 侧再各自约定。
  if (!env.HERMES_API_KEY) return {};
  return { Authorization: `Bearer ${env.HERMES_API_KEY}` };
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

export type HermesHttpClient = {
  /**
   * 调用 Hermes 非流式接口。不会抛原始 fetch 异常——
   * 所有失败路径都会以 HermesError(AppError) 抛出。
   */
  sendMessage(input: HermesMessageInput, logger?: Logger): Promise<HermesMessageResult>;

  /**
   * 调用 Hermes 流式接口（设计文档 §7.3）。
   * 以 AsyncIterable 的形式产出一条条 SSE 事件；连接失败 / 超时 / 解析失败
   * 统一抛 HermesError。
   *
   * 注意：fetch 自身的超时针对"请求握手 + 首个字节"；长流过程中不会再触发
   * AbortController，避免把长 Agent 调用误杀。
   */
  streamMessage(
    input: HermesMessageInput,
    logger?: Logger,
  ): AsyncIterable<HermesRawEvent>;

  /**
   * 续跑一个因 need_confirmation 暂停的 command（Phase 3）。
   * Hermes 收到 resume 后重新以 SSE 推送剩余事件（包括可能的 final / error）。
   * 连接 / 读取错误同样抛 HermesError。
   */
  streamResume(
    input: HermesResumeInput,
    logger?: Logger,
  ): AsyncIterable<HermesRawEvent>;

  /**
   * 尽力通知 Hermes 取消某个 command（Phase 3）。
   * 用于前端 cancel 确认卡片时释放 Hermes 资源。
   * 任何失败都不抛，仅返回 false + 日志；因为 Backend 已经对前端返回了 cancelled 终态。
   */
  notifyCancel(input: HermesCancelInput, logger?: Logger): Promise<boolean>;

  /**
   * 健康检查。方便 /api/command/_debug/hermes-ping 或部署联调用。
   * 返回 true 表示 Hermes 通。任何失败都不抛，直接 false + 日志记录原因。
   */
  ping(logger?: Logger): Promise<boolean>;
};

export function createHermesHttpClient(): HermesHttpClient {
  const baseUrl = env.HERMES_BASE_URL;
  const timeoutMs = env.HERMES_TIMEOUT_MS;

  async function postJson<TResp>(
    path: string,
    body: unknown,
    logger?: Logger,
    timeoutOverrideMs?: number,
  ): Promise<TResp> {
    const url = joinUrl(baseUrl, path);
    const controller = new AbortController();
    const timeout = timeoutOverrideMs ?? timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeout);

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeader(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      const isAbort =
        (err as { name?: string } | null)?.name === "AbortError" ||
        controller.signal.aborted;
      if (isAbort) {
        logger?.warn({ url, durationMs, timeout }, "Hermes HTTP call timed out");
        throw new HermesError(
          "HERMES_TIMEOUT",
          "Hermes 执行超时，请稍后重试。",
          504,
          { url, timeoutMs: timeout },
        );
      }
      logger?.error({ err, url, durationMs }, "Hermes HTTP call failed");
      throw new HermesError(
        "HERMES_CONNECTION_FAILED",
        "后端无法连接 Hermes 服务，请确认 Hermes 是否已启动。",
        502,
        { url, cause: (err as Error)?.message },
      );
    }
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger?.warn(
        { url, status: response.status, body: text.slice(0, 1000) },
        "Hermes returned non-2xx",
      );
      throw new HermesError(
        "HERMES_AGENT_ERROR",
        `Hermes Agent 执行失败。HTTP ${response.status}`,
        502,
        { status: response.status, body: text.slice(0, 2000) },
      );
    }

    try {
      return (await response.json()) as TResp;
    } catch (err) {
      logger?.error({ err, url }, "Failed to parse Hermes JSON response");
      throw new HermesError(
        "HERMES_AGENT_ERROR",
        "Hermes 返回的响应不是合法 JSON。",
        502,
      );
    }
  }

  /**
   * 通用 SSE 流打开 + 解析。Phase 2 的 streamMessage 和 Phase 3 的 streamResume
   * 都走这里，差别只是 URL 和请求体。
   *
   * 超时只管"连接阶段"——握手建立后会解绑 AbortController，防止长 Agent 流被误杀。
   */
  function openSseStream(
    path: string,
    body: unknown,
    logger?: Logger,
  ): AsyncIterable<HermesRawEvent> {
    return (async function* () {
      const url = joinUrl(baseUrl, path);
      const connectController = new AbortController();
      const connectTimer = setTimeout(() => connectController.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...buildAuthHeader(),
          },
          body: JSON.stringify(body),
          signal: connectController.signal,
        });
      } catch (err) {
        clearTimeout(connectTimer);
        const isAbort =
          (err as { name?: string } | null)?.name === "AbortError" ||
          connectController.signal.aborted;
        if (isAbort) {
          logger?.warn({ url, timeoutMs }, "Hermes SSE connect timed out");
          throw new HermesError(
            "HERMES_TIMEOUT",
            "Hermes 流式接口连接超时。",
            504,
            { url, timeoutMs },
          );
        }
        logger?.error({ err, url }, "Hermes SSE connect failed");
        throw new HermesError(
          "HERMES_CONNECTION_FAILED",
          "后端无法连接 Hermes 服务,请确认 Hermes 是否已启动。",
          502,
          { url, cause: (err as Error)?.message },
        );
      }
      clearTimeout(connectTimer);

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        logger?.warn(
          { url, status: response.status, body: text.slice(0, 1000) },
          "Hermes SSE returned non-2xx",
        );
        throw new HermesError(
          "HERMES_AGENT_ERROR",
          `Hermes Agent 流式接口失败。HTTP ${response.status}`,
          502,
          { status: response.status, body: text.slice(0, 2000) },
        );
      }

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();

      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          const parts = normalized.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const frame of parts) {
            const parsed = parseSseFrame(frame);
            if (parsed) yield parsed;
          }
        }
        if (buffer.trim().length > 0) {
          const parsed = parseSseFrame(buffer);
          if (parsed) yield parsed;
        }
      } catch (err) {
        logger?.error({ err, url }, "Hermes SSE read error");
        throw new HermesError(
          "HERMES_AGENT_ERROR",
          "Hermes 流式响应读取失败。",
          502,
          { cause: (err as Error)?.message },
        );
      } finally {
        try {
          await reader.cancel();
        } catch {
          // reader 可能已经自动释放，忽略
        }
      }
    })();
  }

  return {
    async sendMessage(input, logger) {
      const result = await postJson<HermesMessageResult>(
        "/agent/message",
        input,
        logger,
      );

      // Hermes 明确返回 status=failed 的业务失败，同样走 HERMES_AGENT_ERROR，
      // 但把 Hermes 自己的 message 透出给前端（更利于排查）。
      if (result.status === "failed") {
        throw new HermesError(
          "HERMES_AGENT_ERROR",
          result.error?.message ?? result.message ?? "Hermes Agent 执行失败。",
          502,
          { hermesError: result.error, hermesMessage: result.message },
        );
      }

      return result;
    },

    streamMessage(input, logger) {
      return openSseStream("/agent/message/stream", input, logger);
    },

    streamResume(input, logger) {
      return openSseStream("/agent/message/resume", input, logger);
    },

    async notifyCancel(input, logger) {
      const url = joinUrl(baseUrl, "/agent/message/cancel");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildAuthHeader(),
          },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          logger?.warn(
            { url, status: res.status },
            "Hermes cancel notification returned non-2xx",
          );
          return false;
        }
        return true;
      } catch (err) {
        clearTimeout(timer);
        logger?.warn({ err, url }, "Hermes cancel notification failed");
        return false;
      }
    },

    async ping(logger) {
      const url = joinUrl(baseUrl, "/health");
      const controller = new AbortController();
      // ping 用较短超时，避免启动时挂住
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: buildAuthHeader(),
          signal: controller.signal,
        });
        clearTimeout(timer);
        return response.ok;
      } catch (err) {
        clearTimeout(timer);
        logger?.warn({ err, url }, "Hermes ping failed");
        return false;
      }
    },
  };
}

/**
 * 解析一个完整的 SSE 帧（不带结尾空行）。
 * 规范：https://html.spec.whatwg.org/multipage/server-sent-events.html
 *
 * 我们只关心四类字段：`event` / `id` / `data` / 注释（`:` 开头，忽略）。
 * 多个 data 行按规范用 `\n` 连接。
 *
 * 容错：
 *  - data 不是 JSON → 退化为 { raw: string }
 *  - 事件名缺失 → 默认为 "message"（与浏览器 EventSource 行为一致）
 */
function parseSseFrame(raw: string): HermesRawEvent | null {
  const lines = raw.split("\n");
  let event = "message";
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue; // 空行或注释
    // field[: value]，value 前的单个空格按规范去掉
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "id") id = value;
    else if (field === "data") dataLines.push(value);
    // 其他字段（retry 等）对我们没意义，忽略
  }

  if (dataLines.length === 0 && !id) return null;

  const dataText = dataLines.join("\n");
  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(dataText || "null");
    data =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { value: parsed };
  } catch {
    data = { raw: dataText };
  }

  const out: HermesRawEvent = { event, data };
  if (id !== undefined) out.id = id;
  return out;
}

/** 进程级单例。handler 里直接用 `hermesClient` 即可。 */
export const hermesClient: HermesHttpClient = createHermesHttpClient();
