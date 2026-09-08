# 已移除的 fastclaw 死代码归档

移除日期：2026-06-18。原因：零调用方的非流式 `/chat`、健康检查 `/ping` 整条链路，
以及未被引用的 `FastClawStreamEventDto` 类型。需要恢复时把对应片段贴回原位置即可。

实际真实流量只走 `/chat/stream`、`/deploy/stream`、`/analyze/stream`；存活探测由 `/health` 负责。

---

## #5 dto.ts — FastClawChatResponseDto + FastClawStreamEventDto

原 `backend/src/modules/fastclaw/fastclaw.dto.ts` 的「响应」区段：

```ts
// ---------- 响应 ----------

export type FastClawChatResponseDto = {
  /** 非流式时返回完整内容 */
  content?: string;
  /** 流式时返回 stream URL */
  streamUrl?: string;
  /** 请求追踪 ID */
  requestId: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type FastClawStreamEventDto =
  | { type: "delta"; content: string }
  | { type: "tool_start"; toolName: string; displayName: string; arguments?: string }
  | { type: "tool_result"; toolName: string; summary: string; result?: unknown }
  | { type: "progress"; phase: string; iteration?: number; max?: number }
  | { type: "done" }
  | { type: "error"; error: string };
```

注：`FastClawStreamEventDto` 从未被引用；`FastClawChatResponseDto` 仅被下面的 `chat()` 使用。

---

## #3 /chat 非流式链路

### routes.ts — POST /chat 处理器

```ts
// ---------- 非流式对话 ----------

fastclawRouter.post("/chat", zv("json", fastclawChatSchema), async (c) => {
  const body = c.req.valid("json");
  const logger = c.get("logger") ?? baseLogger;
  const requestId = c.get("requestId");

  const result = await service.chat({ ...body, stream: false }, requestId, logger);
  return ok(c, result);
});
```

### service.ts — chat()

```ts
/**
 * 非流式对话。直接返回完整回复。
 */
export async function chat(
  input: FastClawChatInput,
  requestId: string,
  logger: Logger,
): Promise<FastClawChatResponseDto> {
  ensureConfigured();

  const messages = buildMessages(input);
  const result = await fastclawClient.chat(messages, logger, {
    agentId: resolveAgentId(input),
    sessionKey: input.sessionKey,
  });

  return {
    content: result.content,
    requestId,
    usage: result.usage,
  };
}
```

### client.ts — FastClawChatResult 类型

```ts
export type FastClawChatResult = {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};
```

### client.ts — FastClawClient 接口里的 chat() 声明

```ts
  /** 非流式对话 */
  chat(
    messages: FastClawMessage[],
    logger?: Logger,
    options?: FastClawChatOptions,
  ): Promise<FastClawChatResult>;
```

### client.ts — ChatCompletionResp 类型

```ts
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
```

### client.ts — createFastClawClient 返回对象里的 chat 方法实现

```ts
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
```

---

## #4 /ping 健康检查链路

### routes.ts — GET /ping 处理器

```ts
// ---------- 健康检查 ----------

fastclawRouter.get("/ping", async (c) => {
  const logger = c.get("logger") ?? baseLogger;
  const reachable = await service.ping(logger);
  return ok(c, { reachable });
});
```

### service.ts — ping()

```ts
/**
 * 健康检查
 */
export async function ping(logger: Logger): Promise<boolean> {
  return fastclawClient.ping(logger);
}
```

### client.ts — FastClawClient 接口里的 ping() 声明

```ts
  /** 健康检查 */
  ping(logger?: Logger): Promise<boolean>;
```

### client.ts — createFastClawClient 返回对象里的 ping 方法实现

```ts
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
```
