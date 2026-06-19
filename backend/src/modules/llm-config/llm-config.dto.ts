import { z } from "zod";

/**
 * 用户自定义 LLM 配置（驱动 FastClaw 的 research/deploy/analyse agent）。
 *
 * 写入目标是 FastClaw 自己的 `fastclaw.db` 的 `configs` 表（明文存储）：
 *   - provider 行（kind=provider, name=anthropic）：apiBase / apiKey / apiType
 *   - 每个 agent 的 `agents.defaults` 行：model = "<provider>/<modelId>"
 * 详见 llm-config.repository.ts。
 */

export const apiTypeEnum = z.enum(["anthropic-messages", "openai"]);
export type ApiType = z.infer<typeof apiTypeEnum>;

export const updateLlmConfigSchema = z.object({
  /** LLM 服务的 API 基址，如 https://api.anthropic.com 或自建代理。 */
  apiBase: z.string().trim().url(),
  /** API Key。空字符串视为“清空/不修改”，由 service 层处理。 */
  apiKey: z.string().trim(),
  /** 协议类型：anthropic-messages 或 openai 兼容。 */
  apiType: apiTypeEnum,
  /** 模型 id（不带 provider 前缀），如 claude-opus-4-7 或 gpt-4o。 */
  model: z.string().trim().min(1).max(200),
});
export type UpdateLlmConfigInput = z.infer<typeof updateLlmConfigSchema>;

/**
 * 读接口返回。apiKey 永远脱敏（masked），绝不回传明文。
 * configured=false 表示 FastClaw db 不可用或尚未配置 provider。
 */
export type LlmConfigDto = {
  configured: boolean;
  apiBase: string | null;
  /** 脱敏后的 key，如 "sk-…AbCd"；从未配置则为 null。 */
  apiKeyMasked: string | null;
  apiType: ApiType | null;
  model: string | null;
};
