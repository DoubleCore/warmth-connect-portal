import type { Logger } from "pino";
import { env } from "@/config/env.js";
import { AppError } from "@/shared/errors.js";

/**
 * LLMClient —— 任意 OpenAI 兼容后端的轻封装。
 *
 * 只提供两件事，对应 Design_SQLite_Abstract_RAG.md §7 / §11：
 *   1. `embedText(text)`  → 调 /embeddings，拿 number[] 向量
 *   2. `chatComplete(messages)` → 调 /chat/completions，拿回答文本
 *
 * 和 Hermes 客户端刻意解耦：
 *   · Hermes 管的是 agent 编排（工具、审批、sandbox），长链路、审批半同步
 *   · 这里是一次性 Q&A，短链路、无状态、失败就直接抛
 *
 * 设计取舍：
 *   · 不跨模块引 openai SDK——只两个 endpoint，手写 fetch 依赖更轻，
 *     而且未配置 API_KEY 时绝对不会尝试打网络
 *   · 未配置（LLM_API_KEY 为空）时 `isConfigured()` 返回 false，上层可降级到
 *     503 LLM_NOT_CONFIGURED；不要在这里抛错，让路由层保留友好的错误信封
 *   · 超时沿用 LLM_TIMEOUT_MS，默认 60s。embedding 比 chat 快很多，两者共享
 *     没有实际问题——这个值主要防止对方连接挂死
 */

// ---------- 错误 ----------

export class LLMError extends AppError {
    constructor(
        code: "LLM_NOT_CONFIGURED" | "LLM_TIMEOUT" | "LLM_CONNECTION_FAILED" | "LLM_UPSTREAM_ERROR",
        message: string,
        statusCode = 502,
        details?: unknown,
    ) {
        super(message, statusCode, code, details);
        this.name = "LLMError";
    }
}

// ---------- 契约 ----------

export type ChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export type ChatCompleteOptions = {
    temperature?: number;
    maxTokens?: number;
};

export type LLMClient = {
    /** 纯检测：上层在跑 RAG query 之前判断是否已配好 key。 */
    isConfigured(): boolean;
    embedText(text: string, logger?: Logger): Promise<number[]>;
    chatComplete(
        messages: ChatMessage[],
        logger?: Logger,
        options?: ChatCompleteOptions,
    ): Promise<string>;
};

// ---------- 实现 ----------

function joinUrl(base: string, path: string): string {
    const b = base.replace(/\/+$/, "");
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${b}${p}`;
}

function isAbortError(err: unknown, signal: AbortSignal): boolean {
    return (err as { name?: string } | null)?.name === "AbortError" || signal.aborted;
}

/**
 * 一次 POST /v1/xxx 调用。封装超时 / 错误码映射 / JSON parse。
 */
async function callJson<TReq, TResp>(
    path: string,
    body: TReq,
    logger: Logger | undefined,
): Promise<TResp> {
    if (!env.LLM_API_KEY) {
        throw new LLMError(
            "LLM_NOT_CONFIGURED",
            "LLM_API_KEY 未配置，无法调用大模型接口。",
            503,
        );
    }

    const url = joinUrl(env.LLM_API_BASE_URL, path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);
    const started = Date.now();

    let res: Response;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.LLM_API_KEY}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (err) {
        clearTimeout(timer);
        const durationMs = Date.now() - started;
        if (isAbortError(err, controller.signal)) {
            logger?.warn({ url, durationMs, timeout: env.LLM_TIMEOUT_MS }, "LLM call timed out");
            throw new LLMError("LLM_TIMEOUT", "LLM 调用超时，请稍后重试。", 504, {
                url,
                timeoutMs: env.LLM_TIMEOUT_MS,
            });
        }
        logger?.error({ err, url, durationMs }, "LLM call failed at transport level");
        throw new LLMError(
            "LLM_CONNECTION_FAILED",
            "无法连接到 LLM 服务，请检查 LLM_API_BASE_URL 配置。",
            502,
            { url, cause: (err as Error)?.message },
        );
    }
    clearTimeout(timer);

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger?.warn(
            { url, status: res.status, body: text.slice(0, 1000) },
            "LLM returned non-2xx",
        );
        throw new LLMError(
            "LLM_UPSTREAM_ERROR",
            `LLM 服务返回 HTTP ${res.status}。`,
            502,
            { status: res.status, body: text.slice(0, 2000) },
        );
    }

    try {
        return (await res.json()) as TResp;
    } catch (err) {
        logger?.error({ err, url }, "Failed to parse LLM JSON response");
        throw new LLMError("LLM_UPSTREAM_ERROR", "LLM 返回的响应不是合法 JSON。", 502);
    }
}

// ---------- OpenAI 兼容响应形状 ----------

type EmbeddingResp = {
    data?: Array<{ embedding?: number[] }>;
};

type ChatResp = {
    choices?: Array<{
        message?: { content?: string };
    }>;
};

// ---------- 工厂 + 单例 ----------

export function createLLMClient(): LLMClient {
    return {
        isConfigured(): boolean {
            return Boolean(env.LLM_API_KEY);
        },

        async embedText(text, logger) {
            // OpenAI embedding API 在传空字符串时会 400；这里提前兜住。
            const input = text?.trim();
            if (!input) {
                throw new LLMError("LLM_UPSTREAM_ERROR", "Embedding input is empty.", 400);
            }
            const resp = await callJson<
                { model: string; input: string },
                EmbeddingResp
            >(
                "/embeddings",
                { model: env.LLM_EMBEDDING_MODEL, input },
                logger,
            );
            const vec = resp.data?.[0]?.embedding;
            if (!Array.isArray(vec) || vec.length === 0) {
                throw new LLMError("LLM_UPSTREAM_ERROR", "Embedding 返回为空。", 502, {
                    model: env.LLM_EMBEDDING_MODEL,
                });
            }
            return vec;
        },

        async chatComplete(messages, logger, options) {
            if (messages.length === 0) {
                throw new LLMError("LLM_UPSTREAM_ERROR", "Chat messages 不能为空。", 400);
            }
            const body: Record<string, unknown> = {
                model: env.LLM_CHAT_MODEL,
                messages,
                temperature: options?.temperature ?? 0.2,
            };
            if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
            const resp = await callJson<typeof body, ChatResp>("/chat/completions", body, logger);
            const content = resp.choices?.[0]?.message?.content;
            if (typeof content !== "string" || content.trim().length === 0) {
                throw new LLMError("LLM_UPSTREAM_ERROR", "Chat completion 返回为空。", 502, {
                    model: env.LLM_CHAT_MODEL,
                });
            }
            return content;
        },
    };
}

/** 进程级单例。上层直接 `import { llmClient }`。 */
export const llmClient: LLMClient = createLLMClient();
