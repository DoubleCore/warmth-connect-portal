import type { Logger } from "pino";
import { env } from "@/config/env.js";
import { AppError } from "@/shared/errors.js";

/**
 * HermesHttpClient —— Backend 与本机 Hermes Agent 之间的 HTTP 通道。
 *
 * 对接的是 Hermes 官方 API Server（`~/.hermes/.env` 里 API_SERVER_ENABLED=true 启用，
 * 默认 127.0.0.1:8642），也就是 OpenAI 兼容 + Runs 扩展接口集：
 *
 *   POST /v1/runs                     → 创建 run（`{run_id, status:"started"}`）
 *   GET  /v1/runs/{run_id}            → 拉取 run 快照（status/output/usage/...）
 *   GET  /v1/runs/{run_id}/events     → SSE 事件流
 *   POST /v1/runs/{run_id}/approval   → 审批挂起的 run（choice: once|session|always|deny）
 *   POST /v1/runs/{run_id}/stop       → 中断 run
 *   GET  /health                      → 健康检查
 *
 * 关键实现约束：
 *  1. 前端永远不直接连 Hermes，只有本模块会 fetch HERMES_BASE_URL。
 *  2. 所有 Hermes 错误在这里被包成 HermesError(AppError)，上层不需要再关心异常来源。
 *  3. Runs API 的 SSE 帧格式是"每帧只有 data: <json>，事件名在 JSON 的 event 字段里"。
 *     这和我们之前假想的 `event: xxx / data: {...}` 不一样；解析实现见 parseSseFrame。
 *
 * 背景文档：Hermes_Command_Center_HTTP_直连可用版.md §7 / §8.3；
 *           scripts/README.md 记录了抓包确认的事件清单。
 */

// ---------- 请求 / 响应契约（与 Hermes Runs API 对齐） ----------

/**
 * 一轮对话的 history 条目。对齐 Hermes `/v1/runs` 接受的
 * `conversation_history: [{role, content}, ...]`。
 */
export type HermesHistoryTurn = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type HermesMessageInput = {
  commandId: string;
  sessionId: string;
  message: string;
  context: Record<string, unknown>;
  /**
   * 可选的历史对话上下文。传入后 Hermes 会把它作为当前 run 的 prefix 喂给 LLM，
   * 实现"多轮连续对话"。由编排层（command.service.ts）按 sessionId 从 DB 拼装。
   */
  history?: HermesHistoryTurn[];
};

/**
 * 非流式 sendMessage 的返回。
 *
 * 实际落地：backend 发起 POST /v1/runs 拿到 run_id 之后消费事件流并聚合：
 *   - run.completed 的 output + usage 组成 result
 *   - run.failed / run.cancelled 直接落到 error / status
 *
 * 对前端而言结构保持和之前一致，不受 Hermes API 形态影响。
 */
export type HermesMessageResult = {
  commandId: string;
  /** runId 对应 Hermes 侧的 run_id，后续 stop/approval 都要用 */
  runId: string;
  status: "completed" | "failed" | "cancelled";
  message?: string;
  result?: unknown;
  error?: {
    code?: string;
    message: string;
  };
};

/**
 * 审批输入。Hermes Runs API 不支持 "cancel confirmation" 这个语义，
 * 对应到 Hermes 侧：
 *   - 前端 confirm → choice: "once"（或 "session" 让这次同工具免再问）
 *   - 前端 cancel  → choice: "deny"
 * 由上层编排把我们项目的 confirm/cancel 语义映射过来。
 */
export type HermesApprovalInput = {
  runId: string;
  choice: "once" | "session" | "always" | "deny";
  /** 等价于 API 里的 `all`/`resolve_all`：一次解决该 run 所有挂起项 */
  resolveAll?: boolean;
};

/**
 * Hermes /v1/runs/{id}/stop 的入参。纯 run_id，其他不需要。
 */
export type HermesCancelInput = {
  runId: string;
  reason?: string;
};

/**
 * Hermes Runs SSE 流里每一帧 event payload 的结构化表示。
 *
 * 这里的 `event` 就是 Hermes 自己在 payload 里写的事件名，上层映射器按名 switch：
 *   message.delta / reasoning.available /
 *   tool.started / tool.completed /
 *   approval.request / approval.responded /
 *   run.completed / run.failed / run.cancelled
 */
export type HermesRawEvent = {
  event: string;
  data: Record<string, unknown>;
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
  // Hermes 侧 API_SERVER_ENABLED=true 时要求 Bearer 鉴权（API_SERVER_KEY）。
  // 我们把它映射到 backend 的 HERMES_API_KEY。
  if (!env.HERMES_API_KEY) return {};
  return { Authorization: `Bearer ${env.HERMES_API_KEY}` };
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

function isAbortError(err: unknown, signal: AbortSignal): boolean {
  return (
    (err as { name?: string } | null)?.name === "AbortError" || signal.aborted
  );
}

export type HermesHttpClient = {
  /**
   * 非流式调用：创建 run、消费事件流到终态、聚合为 HermesMessageResult。
   * 不抛原始 fetch 异常——所有失败路径都以 HermesError 抛出。
   */
  sendMessage(input: HermesMessageInput, logger?: Logger): Promise<HermesMessageResult>;

  /**
   * 流式调用：创建 run，返回一个 `{ runId, events }`。
   *  - runId 用于后续 approval / stop 调用
   *  - events 是一个 AsyncIterable<HermesRawEvent>，消费完毕（Hermes 侧发出
   *    run.completed/failed/cancelled 后）自然结束
   *
   * 连接 / 读取错误统一抛 HermesError。
   * 超时只管"连接阶段"——握手建立后会解绑 AbortController，防止长 Agent 流被误杀。
   */
  streamMessage(
    input: HermesMessageInput,
    logger?: Logger,
  ): Promise<{ runId: string; events: AsyncIterable<HermesRawEvent> }>;

  /**
   * 回复一条挂起的 approval（对应 Hermes 的 waiting_for_approval 状态）。
   * Hermes 侧会继续在**同一个** /events 流里往下发剩余事件，所以这里只是
   * 一个控制面调用，不返回新的 stream。
   */
  resolveApproval(input: HermesApprovalInput, logger?: Logger): Promise<void>;

  /**
   * 尽力通知 Hermes 中断一个 run。任何失败都不抛，仅返回 false + 日志，
   * 因为 backend 通常已经把 cancelled 终态广播给前端了。
   */
  notifyCancel(input: HermesCancelInput, logger?: Logger): Promise<boolean>;

  /** 健康检查。返回 true 表示 Hermes 通。失败不抛，直接 false + 日志。 */
  ping(logger?: Logger): Promise<boolean>;
};

export function createHermesHttpClient(): HermesHttpClient {
  const baseUrl = env.HERMES_BASE_URL;
  const connectTimeoutMs = env.HERMES_TIMEOUT_MS;

  /**
   * 发起一次 POST，等待 JSON 响应。用于 /v1/runs、/v1/runs/{id}/approval、
   * /v1/runs/{id}/stop 这些短控制面调用。
   */
  async function postJson<TResp>(
    path: string,
    body: unknown,
    logger: Logger | undefined,
    timeoutOverrideMs?: number,
  ): Promise<TResp> {
    const url = joinUrl(baseUrl, path);
    const controller = new AbortController();
    const timeout = timeoutOverrideMs ?? connectTimeoutMs;
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
      if (isAbortError(err, controller.signal)) {
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
   * 打开 /v1/runs/{id}/events 的 SSE 流。解析每一帧成 HermesRawEvent。
   *
   * Hermes 侧实现（api_server.py）发的 payload 形如：
   *   data: {"event":"message.delta","run_id":"...","delta":"你好"}\n\n
   * 没有独立的 `event:` 行，所以事件名从 JSON 的 `event` 字段读取。
   */
  function openRunEventStream(
    runId: string,
    logger?: Logger,
  ): AsyncIterable<HermesRawEvent> {
    return (async function* () {
      const url = joinUrl(baseUrl, `/v1/runs/${runId}/events`);
      const connectController = new AbortController();
      const connectTimer = setTimeout(
        () => connectController.abort(),
        connectTimeoutMs,
      );

      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            ...buildAuthHeader(),
          },
          signal: connectController.signal,
        });
      } catch (err) {
        clearTimeout(connectTimer);
        if (isAbortError(err, connectController.signal)) {
          logger?.warn(
            { url, connectTimeoutMs },
            "Hermes SSE connect timed out",
          );
          throw new HermesError(
            "HERMES_TIMEOUT",
            "Hermes 流式接口连接超时。",
            504,
            { url, timeoutMs: connectTimeoutMs },
          );
        }
        logger?.error({ err, url }, "Hermes SSE connect failed");
        throw new HermesError(
          "HERMES_CONNECTION_FAILED",
          "后端无法连接 Hermes 服务，请确认 Hermes 是否已启动。",
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

  /**
   * 发起 POST /v1/runs 创建一个 run。返回 run_id 与初始 status。
   *
   * 请求体映射自我们的 HermesMessageInput：
   *   {
   *     input:                <用户这一轮的消息>,
   *     model:                "hermes-agent",
   *     session_id:           <我们项目里 command_sessions.id>,     // 见下方说明
   *     conversation_history: [{role, content}, ...] | undefined,   // 见下方说明
   *     metadata:             { commandId, sessionId, context }     // 便于 Hermes 侧日志溯源
   *   }
   *
   * 关于"多轮对话"：
   *   Hermes 的 `_create_agent` 在每个 run 启动时都会新建一个 Agent 实例，
   *   所以 LLM 本身默认没有跨 run 记忆。要实现连续对话必须同时给两样东西：
   *
   *     1. `session_id` —— Hermes 用它把多次 run 归属同一个会话／sandbox／approval scope。
   *        不传则 Hermes 用 run_id 当 session_id，导致每次 run 变成全新会话。
   *     2. `conversation_history` —— 真正喂给 LLM 的对话历史。Hermes `_handle_runs`
   *        会把它当作 prefix 注入 agent.run_conversation 的 conversation_history 参数。
   *
   *   只传 `session_id` 不够——LLM 仍然看不到前几轮。只传 history 也不够——
   *   工具审批／sandbox 状态仍会被视为新会话。
   *
   *   这里我们用项目 `command_sessions.id` 作为 Hermes 的 session_id。这样前端
   *   "同一次进入 Command Center = 同一条 Hermes 会话"的语义和 Hermes 内部
   *   sandbox 的生命周期对齐。
   *
   * metadata 里的 commandId / sessionId / context 是我们自己要的溯源信息，
   * Hermes 会忽略未知字段。
   */
  async function createRun(
    input: HermesMessageInput,
    logger?: Logger,
  ): Promise<{ runId: string }> {
    const body: Record<string, unknown> = {
      input: input.message,
      model: "hermes-agent",
      session_id: input.sessionId,
      metadata: {
        commandId: input.commandId,
        sessionId: input.sessionId,
        context: input.context,
      },
    };
    if (input.history && input.history.length > 0) {
      body.conversation_history = input.history;
    }
    const resp = await postJson<{
      run_id?: string;
      runId?: string;
      status?: string;
    }>("/v1/runs", body, logger);
    const runId = resp.run_id ?? resp.runId;
    if (!runId) {
      throw new HermesError(
        "HERMES_AGENT_ERROR",
        "Hermes 未返回 run_id。",
        502,
        { resp },
      );
    }
    return { runId };
  }

  return {
    async sendMessage(input, logger) {
      const { runId } = await createRun(input, logger);
      const stream = openRunEventStream(runId, logger);

      let message: string | undefined;
      let output: unknown = null;
      let usage: unknown = null;
      let status: "completed" | "failed" | "cancelled" | undefined;
      let errorMsg: string | undefined;

      for await (const raw of stream) {
        switch (raw.event) {
          case "run.completed": {
            const out = typeof raw.data.output === "string" ? raw.data.output : null;
            if (out !== null) message = out;
            output = raw.data.output ?? null;
            usage = raw.data.usage ?? null;
            status = "completed";
            break;
          }
          case "run.failed":
            status = "failed";
            errorMsg =
              typeof raw.data.error === "string"
                ? raw.data.error
                : "Hermes Agent 执行失败。";
            break;
          case "run.cancelled":
            status = "cancelled";
            break;
          default:
            // 非终态事件在非流式模式下直接忽略
            break;
        }
        if (status) break;
      }

      if (!status) {
        throw new HermesError(
          "HERMES_AGENT_ERROR",
          "Hermes 流已结束但未返回终态事件。",
          502,
          { runId },
        );
      }

      if (status === "failed") {
        throw new HermesError(
          "HERMES_AGENT_ERROR",
          errorMsg ?? "Hermes Agent 执行失败。",
          502,
          { runId },
        );
      }

      const result: HermesMessageResult = {
        commandId: input.commandId,
        runId,
        status,
        result: status === "completed" ? { output, usage } : null,
      };
      if (message !== undefined) result.message = message;
      return result;
    },

    async streamMessage(input, logger) {
      const { runId } = await createRun(input, logger);
      return { runId, events: openRunEventStream(runId, logger) };
    },

    async resolveApproval(input, logger) {
      const body: Record<string, unknown> = { choice: input.choice };
      if (input.resolveAll) body.all = true;
      await postJson<unknown>(
        `/v1/runs/${encodeURIComponent(input.runId)}/approval`,
        body,
        logger,
        // approval 是短控制面调用，用较短超时
        5_000,
      );
    },

    async notifyCancel(input, logger) {
      const url = joinUrl(
        baseUrl,
        `/v1/runs/${encodeURIComponent(input.runId)}/stop`,
      );
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3_000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildAuthHeader(),
          },
          body: JSON.stringify({}),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          logger?.warn(
            { url, status: res.status },
            "Hermes stop notification returned non-2xx",
          );
          return false;
        }
        return true;
      } catch (err) {
        clearTimeout(timer);
        logger?.warn({ err, url }, "Hermes stop notification failed");
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
 * 解析一个完整的 SSE 帧。Hermes Runs 流格式：
 *
 *   data: {"event":"...","run_id":"...","..."}
 *   (空行分隔下一帧)
 *
 * 没有 `event:` 行——事件名在 data payload 的 `event` 字段里。我们在这里把它
 * 提出来放进返回值的 `event` 字段，让上层按名 switch。
 *
 * 容错：
 *  - data 不是 JSON → 当作 `{ raw: string, event: "unknown" }`
 *  - payload 没有 event 字段 → 默认 "message"（和浏览器 EventSource 行为一致）
 *  - 纯注释帧（`:` 开头）→ 返回 null
 */
function parseSseFrame(raw: string): HermesRawEvent | null {
  const lines = raw.split("\n");
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue; // 空行或注释（心跳）
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") dataLines.push(value);
    // `event`/`id`/`retry` 等字段 Hermes 不发，忽略
  }

  if (dataLines.length === 0) return null;

  const dataText = dataLines.join("\n");
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataText || "null");
  } catch {
    return { event: "unknown", data: { raw: dataText } };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { event: "unknown", data: { value: parsed } };
  }

  const obj = parsed as Record<string, unknown>;
  const eventName = typeof obj.event === "string" ? obj.event : "message";
  return { event: eventName, data: obj };
}

/** 进程级单例。handler 里直接用 `hermesClient` 即可。 */
export const hermesClient: HermesHttpClient = createHermesHttpClient();
