import type { Logger } from "pino";
import {
  fastclawClient,
  type FastClawMessage,
  type FastClawStreamChunk,
} from "./fastclaw.client.js";
import { FastClawError } from "./fastclaw.client.js";
import type { FastClawChatInput, FastClawChatResponseDto } from "./fastclaw.dto.js";

/**
 * FastClaw 对话服务层。
 *
 * 轻量封装：把前端 input 映射成 FastClaw 消息格式，调客户端，返回结果。
 * 不做持久化——轻量对话不需要落库（如果后续需要，可以在这里加）。
 */

export function ensureConfigured(): void {
  if (!fastclawClient.isConfigured()) {
    throw new FastClawError(
      "FASTCLAW_NOT_CONFIGURED",
      "FastClaw 服务未配置，请检查 FASTCLAW_BASE_URL。",
      503,
    );
  }
}

function buildMessages(input: FastClawChatInput): FastClawMessage[] {
  const messages: FastClawMessage[] = [];

  if (input.systemPrompt) {
    messages.push({ role: "system", content: input.systemPrompt });
  }

  if (input.history) {
    for (const turn of input.history) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  messages.push({ role: "user", content: input.message });
  return messages;
}

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
    agentId: input.agentId,
  });

  return {
    content: result.content,
    requestId,
    usage: result.usage,
  };
}

/**
 * 流式对话。返回 AsyncIterable<FastClawStreamChunk>。
 * 路由层负责把它转成 SSE 推给前端。
 */
export async function chatStream(
  input: FastClawChatInput,
  logger: Logger,
): Promise<AsyncIterable<FastClawStreamChunk>> {
  ensureConfigured();

  const messages = buildMessages(input);
  return fastclawClient.chatStream(messages, logger, {
    agentId: input.agentId,
  });
}

/**
 * 健康检查
 */
export async function ping(logger: Logger): Promise<boolean> {
  return fastclawClient.ping(logger);
}
