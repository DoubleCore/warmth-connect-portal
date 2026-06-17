import type { Logger } from "pino";
import { env } from "@/config/env.js";
import { AppError } from "@/shared/errors.js";

/**
 * FastClawClient —— 对接本机 FastClaw Agent 运行时的 HTTP 通道。
 *
 * FastClaw 暴露 OpenAI 兼容的 /v1/chat/completions 接口（streaming 可选）。
 * 和 Hermes 不同的是：
 *   - 没有 Runs / Approval 两阶段流程
 *   - 直接走标准 OpenAI SSE streaming（`data: {"choices":[...]}\n\n`）
 *   - Agent 选择通过 X-Fastclaw-Agent-Id 请求头传入 agent ID
 *   - 多轮由 FastClaw 内部 session 管理
 *
 * 本客户端定位：轻量对话通道，不做工具审批、不做 sandbox 编排。
 * 重型编排继续走 Hermes command 模块。
 */

// ---------- 错误 ----------

export class FastClawError extends AppError {
  constructor(
    code:
      | "FASTCLAW_NOT_CONFIGURED"
      | "FASTCLAW_CONNECTION_FAILED"
      | "FASTCLAW_TIMEOUT"
      | "FASTCLAW_UPSTREAM_ERROR",
    message: string,
    statusCode = 502,
    details?: unknown,
  ) {
    super(message, statusCode, code, details);
    this.name = "FastClawError";
  }
}

// ---------- 类型契约 ----------

export type FastClawMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type FastClawChatOptions = {
  /** 覆写 Agent ID，不传则用 env.FASTCLAW_AGENT_ID */
  agentId?: string;
  temperature?: number;
  maxTokens?: number;
  /** 是否流式返回 */
  stream?: boolean;
  /**
   * FastClaw 端会话标识。透传成 `X-Fastclaw-Session-Key` 请求头，
   * 让 FastClaw 把多次 chat/completions 归并到同一个会话窗口（
   * 见 fastclaw/internal/api/openai.go::HandleChatCompletions）。
   * 不传时 FastClaw 会以纳秒戳生成新 key，每次都开新会话。
   */
  sessionKey?: string;
};

/**
 * SSE 流中每一帧解析后的结构。
 * 对齐 OpenAI streaming 格式：
 *   data: {"id":"...","choices":[{"delta":{"content":"..."},"finish_reason":null}]}
 *
 * `event` 是 Web Chat 事件流（webChatStream）独有的结构化工具事件载荷：
 *   - OpenAI 兼容的 chatStream 永远不填 event，下游按纯 delta 处理（行为不变）。
 *   - webChatStream 把 FastClaw 的 tool_call / tool_result / subagent_progress
 *     原样保留成结构化字段，让路由层能映射成独立 SSE 事件、前端能渲染成工具卡片，
 *     而不是早先那样拍扁成 `🔧 名字` 文本混进 content。
 */
export type FastClawStreamEvent =
  | { kind: "tool_call"; name: string; arguments?: string }
  | { kind: "tool_result"; name: string; result?: unknown }
  | { kind: "progress"; phase: string; iteration?: number; max?: number };

export type FastClawStreamChunk = {
  id: string;
  content: string;
  finishReason: string | null;
  event?: FastClawStreamEvent;
};

export type FastClawChatResult = {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type FastClawClient = {
  /** 是否已配置（有 BASE_URL 即视为可用，KEY 可选） */
  isConfigured(): boolean;

  /** 非流式对话 */
  chat(
    messages: FastClawMessage[],
    logger?: Logger,
    options?: FastClawChatOptions,
  ): Promise<FastClawChatResult>;

  /** 流式对话，返回 AsyncIterable 逐 chunk 消费 */
  chatStream(
    messages: FastClawMessage[],
    logger?: Logger,
    options?: FastClawChatOptions,
  ): Promise<AsyncIterable<FastClawStreamChunk>>;

  /** FastClaw Web Chat 事件流，适合需要工具过程可视化的长任务 */
  webChatStream(
    message: string,
    logger?: Logger,
    options?: FastClawChatOptions,
  ): Promise<AsyncIterable<FastClawStreamChunk>>;

  /** 健康检查 */
  ping(logger?: Logger): Promise<boolean>;
};

// ---------- 内部工具函数 ----------

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function isAbortError(err: unknown, signal: AbortSignal): boolean {
  return (err as { name?: string } | null)?.name === "AbortError" || signal.aborted;
}

function buildHeaders(opts?: { sessionKey?: string; agentId?: string }): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.FASTCLAW_API_KEY) {
    headers["Authorization"] = `Bearer ${env.FASTCLAW_API_KEY}`;
  }
  if (opts?.sessionKey) {
    // FastClaw 用这个头把多次请求归并到同一个会话窗口。
    headers["X-Fastclaw-Session-Key"] = opts.sessionKey;
  }
  if (opts?.agentId) {
    // FastClaw HandleChatCompletions 实际只看这个头（或 body.agent_id）来选 agent，
    // 不解析 OpenAI 的 model 字段。
    headers["X-Fastclaw-Agent-Id"] = opts.agentId;
  }
  return headers;
}

function resolveAgentId(options?: FastClawChatOptions): string | undefined {
  return options?.agentId ?? env.FASTCLAW_AGENT_ID ?? undefined;
}

function resolveModel(options?: FastClawChatOptions): string {
  // OpenAI 兼容协议要求 model 字段非空。FastClaw 不用这个字段做 agent 路由；
  // 实际路由依赖 X-Fastclaw-Agent-Id 头。
  return resolveAgentId(options) ?? "default";
}

// ---------- OpenAI 兼容响应形状 ----------

type ChatCompletionResp = {
  id?: string;
  choices?: Array<{
    message?: { content?: string; role?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type WebChatStreamEvent = {
  type:
    | "content"
    | "content_delta"
    | "tool_call"
    | "tool_result"
    | "steer"
    | "error"
    | "done"
    | "turn_pending"
    | "subagent_progress";
  data?: {
    content?: string;
    delta?: string;
    id?: string;
    name?: string;
    arguments?: string;
    result?: unknown;
    message?: string;
    iteration?: number;
    max?: number;
    phase?: string;
    tools?: string[];
  };
};

// ---------- 实现 ----------

export function createFastClawClient(): FastClawClient {
  const baseUrl = env.FASTCLAW_BASE_URL;
  const timeoutMs = env.FASTCLAW_TIMEOUT_MS;

  return {
    isConfigured(): boolean {
      return Boolean(baseUrl);
    },

    async chat(messages, logger, options) {
      if (messages.length === 0) {
        throw new FastClawError("FASTCLAW_UPSTREAM_ERROR", "消息列表不能为空。", 400);
      }

      const url = joinUrl(baseUrl, "/v1/chat/completions");
      const body: Record<string, unknown> = {
        model: resolveModel(options),
        messages,
        stream: false,
      };
      if (options?.temperature !== undefined) body.temperature = options.temperature;
      if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = Date.now();

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: buildHeaders({
            sessionKey: options?.sessionKey,
            agentId: resolveAgentId(options),
          }),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        const durationMs = Date.now() - started;
        if (isAbortError(err, controller.signal)) {
          logger?.warn({ url, durationMs, timeoutMs }, "FastClaw call timed out");
          throw new FastClawError("FASTCLAW_TIMEOUT", "FastClaw 调用超时，请稍后重试。", 504);
        }
        logger?.error({ err, url, durationMs }, "FastClaw call failed");
        throw new FastClawError(
          "FASTCLAW_CONNECTION_FAILED",
          "无法连接 FastClaw 服务，请确认是否已启动。",
          502,
          { url, cause: (err as Error)?.message },
        );
      }
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger?.warn({ url, status: res.status, body: text.slice(0, 1000) }, "FastClaw non-2xx");
        throw new FastClawError(
          "FASTCLAW_UPSTREAM_ERROR",
          `FastClaw 返回 HTTP ${res.status}。`,
          502,
          { status: res.status, body: text.slice(0, 2000) },
        );
      }

      let data: ChatCompletionResp;
      try {
        data = (await res.json()) as ChatCompletionResp;
      } catch {
        throw new FastClawError("FASTCLAW_UPSTREAM_ERROR", "FastClaw 响应不是合法 JSON。", 502);
      }

      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new FastClawError("FASTCLAW_UPSTREAM_ERROR", "FastClaw 返回内容为空。", 502);
      }

      return {
        content,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    },

    async chatStream(messages, logger, options) {
      if (messages.length === 0) {
        throw new FastClawError("FASTCLAW_UPSTREAM_ERROR", "消息列表不能为空。", 400);
      }

      const url = joinUrl(baseUrl, "/v1/chat/completions");
      const body: Record<string, unknown> = {
        model: resolveModel(options),
        messages,
        stream: true,
      };
      if (options?.temperature !== undefined) body.temperature = options.temperature;
      if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;

      const controller = new AbortController();
      const connectTimer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: buildHeaders({
            sessionKey: options?.sessionKey,
            agentId: resolveAgentId(options),
          }),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(connectTimer);
        if (isAbortError(err, controller.signal)) {
          logger?.warn({ url, timeoutMs }, "FastClaw stream connect timed out");
          throw new FastClawError("FASTCLAW_TIMEOUT", "FastClaw 流式连接超时。", 504);
        }
        logger?.error({ err, url }, "FastClaw stream connect failed");
        throw new FastClawError(
          "FASTCLAW_CONNECTION_FAILED",
          "无法连接 FastClaw 服务，请确认是否已启动。",
          502,
          { url, cause: (err as Error)?.message },
        );
      }
      clearTimeout(connectTimer);

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        logger?.warn(
          { url, status: res.status, body: text.slice(0, 500) },
          "FastClaw stream non-2xx",
        );
        throw new FastClawError(
          "FASTCLAW_UPSTREAM_ERROR",
          `FastClaw 流式接口返回 HTTP ${res.status}。`,
          502,
        );
      }

      // 返回 AsyncIterable，解析 OpenAI SSE 格式
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();

      return readSseFrames(
        reader,
        (frame) => {
          const chunk = parseStreamFrame(frame);
          return chunk ? [chunk] : [];
        },
        logger,
        "chat",
      );
    },

    async webChatStream(message, logger, options) {
      const agentId = resolveAgentId(options);
      const sessionId = options?.sessionKey;
      if (!agentId) {
        throw new FastClawError("FASTCLAW_NOT_CONFIGURED", "FastClaw 部署 Agent 未配置。", 503);
      }
      if (!sessionId) {
        throw new FastClawError("FASTCLAW_UPSTREAM_ERROR", "FastClaw sessionKey 不能为空。", 400);
      }

      const url = joinUrl(baseUrl, "/api/chat/stream");
      const controller = new AbortController();
      const connectTimer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: buildHeaders({ sessionKey: sessionId, agentId }),
          body: JSON.stringify({
            agentId,
            sessionId,
            message,
            imageUrls: [],
          }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(connectTimer);
        if (isAbortError(err, controller.signal)) {
          logger?.warn({ url, timeoutMs }, "FastClaw web chat stream connect timed out");
          throw new FastClawError("FASTCLAW_TIMEOUT", "FastClaw Web Chat 流式连接超时。", 504);
        }
        logger?.error({ err, url }, "FastClaw web chat stream connect failed");
        throw new FastClawError(
          "FASTCLAW_CONNECTION_FAILED",
          "无法连接 FastClaw Web Chat 服务，请确认是否已启动。",
          502,
          { url, cause: (err as Error)?.message },
        );
      }
      clearTimeout(connectTimer);

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        logger?.warn(
          { url, status: res.status, body: text.slice(0, 1000) },
          "FastClaw web chat stream non-2xx",
        );
        throw new FastClawError(
          "FASTCLAW_UPSTREAM_ERROR",
          `FastClaw Web Chat 流式接口返回 HTTP ${res.status}。`,
          502,
          { status: res.status, body: text.slice(0, 2000) },
        );
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();

      let sawContentDelta = false;
      return readSseFrames(
        reader,
        (frame) => {
          const result = parseWebChatStreamFrame(frame, { sawContentDelta });
          if (result.sawContentDelta) sawContentDelta = true;
          return result.items;
        },
        logger,
        "web-chat",
      );
    },

    async ping(logger) {
      // FastClaw 暴露 /health 做存活探测。
      const url = joinUrl(baseUrl, "/health");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: buildHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timer);
        return res.ok;
      } catch (err) {
        clearTimeout(timer);
        logger?.warn({ err, url }, "FastClaw ping failed");
        return false;
      }
    },
  };
}

// ---------- SSE 流读取共用逻辑 ----------

async function* readSseFrames<T>(
  reader: ReadableStreamDefaultReader<string>,
  parseFrame: (frame: string) => T[],
  logger: Logger | undefined,
  label: string,
): AsyncGenerator<T> {
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
        for (const chunk of parseFrame(frame)) {
          yield chunk;
        }
      }
    }
    if (buffer.trim().length > 0) {
      for (const chunk of parseFrame(buffer)) {
        yield chunk;
      }
    }
  } catch (err) {
    logger?.error({ err }, `FastClaw ${label} stream read error`);
    throw new FastClawError("FASTCLAW_UPSTREAM_ERROR", `FastClaw ${label} 流式读取失败。`, 502);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}

/**
 * 解析 OpenAI 标准 SSE 帧。格式：
 *   data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}
 *   data: [DONE]
 */
function parseStreamFrame(raw: string): FastClawStreamChunk | null {
  const lines = raw.split("\n");
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      dataLines.push(line.slice(6));
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5));
    }
  }

  if (dataLines.length === 0) return null;

  const dataText = dataLines.join("");
  if (dataText.trim() === "[DONE]") {
    return { id: "", content: "", finishReason: "stop" };
  }

  try {
    const parsed = JSON.parse(dataText) as {
      id?: string;
      choices?: Array<{
        delta?: { content?: string; role?: string };
        finish_reason?: string | null;
      }>;
    };

    const choice = parsed.choices?.[0];
    if (!choice) return null;

    return {
      id: parsed.id ?? "",
      content: choice.delta?.content ?? "",
      finishReason: choice.finish_reason ?? null,
    };
  } catch {
    return null;
  }
}

function parseWebChatStreamFrame(
  raw: string,
  state: { sawContentDelta: boolean },
): { items: FastClawStreamChunk[]; sawContentDelta: boolean } {
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("data: ")) {
      dataLines.push(line.slice(6));
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5));
    }
  }
  if (dataLines.length === 0) {
    return { items: [], sawContentDelta: false };
  }

  let evt: WebChatStreamEvent;
  try {
    evt = JSON.parse(dataLines.join("")) as WebChatStreamEvent;
  } catch {
    return { items: [], sawContentDelta: false };
  }

  const item = (
    content: string,
    finishReason: string | null = null,
    event?: FastClawStreamEvent,
  ): FastClawStreamChunk => ({
    id: evt.data?.id ?? "",
    content,
    finishReason,
    ...(event ? { event } : {}),
  });

  switch (evt.type) {
    case "content_delta": {
      const delta = evt.data?.delta ?? "";
      // 空 delta（keepalive 帧）不产出 item，也不能 latch sawContentDelta，
      // 否则后面的最终 content 事件会被 !sawContentDelta 守卫错误吞掉。
      if (!delta) return { items: [], sawContentDelta: false };
      return { items: [item(delta)], sawContentDelta: true };
    }
    case "content": {
      const content = evt.data?.content ?? "";
      // content 是完整最终文本；如果前面已经实时吐过 delta，就不要再重复输出一遍。
      return {
        items: !state.sawContentDelta && content ? [item(content)] : [],
        sawContentDelta: false,
      };
    }
    case "tool_call": {
      // 结构化保留工具调用：content 留空，事件载荷交给路由层映射成 tool_start。
      const name = evt.data?.name || "tool";
      const event: FastClawStreamEvent = { kind: "tool_call", name };
      if (evt.data?.arguments) event.arguments = evt.data.arguments;
      return { items: [item("", null, event)], sawContentDelta: false };
    }
    case "tool_result": {
      const name = evt.data?.name || "tool";
      const event: FastClawStreamEvent = { kind: "tool_result", name };
      if (evt.data?.result !== undefined) event.result = evt.data.result;
      return { items: [item("", null, event)], sawContentDelta: false };
    }
    case "subagent_progress": {
      const phase = evt.data?.phase ?? "running";
      const event: FastClawStreamEvent = { kind: "progress", phase };
      if (typeof evt.data?.iteration === "number") event.iteration = evt.data.iteration;
      if (typeof evt.data?.max === "number") event.max = evt.data.max;
      return { items: [item("", null, event)], sawContentDelta: false };
    }
    case "steer": {
      // 叙事性引导文本，作为内联 delta 保留（非致命、不结束流）。
      const message = evt.data?.message;
      return { items: message ? [item(`\n\n↪ ${message}\n\n`)] : [], sawContentDelta: false };
    }
    case "error": {
      // 流内 error 事件：FastClaw 把它当作可继续的告警而非终止信号，
      // 这里保留成内联文本 delta，真正的连接级失败由 readSseFrames 抛 FastClawError。
      const message = evt.data?.message ?? "FastClaw Web Chat stream error";
      return { items: [item(`\n\n⚠️ ${message}\n\n`)], sawContentDelta: false };
    }
    case "done":
      return { items: [item("", "stop")], sawContentDelta: false };
    case "turn_pending":
    default:
      return { items: [], sawContentDelta: false };
  }
}

/**
 * 把工具结果等任意值转成可读字符串。供路由层为 tool_result 事件构造 summary 复用。
 */
export function stringifyEventValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** 进程级单例 */
export const fastclawClient: FastClawClient = createFastClawClient();
