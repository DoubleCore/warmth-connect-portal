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

/** 进程级单例。handler 里直接用 `hermesClient` 即可。 */
export const hermesClient: HermesHttpClient = createHermesHttpClient();
