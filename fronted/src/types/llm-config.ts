/**
 * 用户自定义 LLM 配置（驱动 FastClaw 的 research/deploy/analyse agent）。
 * 与后端 backend/src/modules/llm-config/llm-config.dto.ts 对齐。
 */

export type ApiType = "anthropic-messages" | "openai";

export type LlmConfig = {
  configured: boolean;
  apiBase: string | null;
  /** 脱敏后的 key，如 "sk-…AbCd"；后端从不回传明文。 */
  apiKeyMasked: string | null;
  apiType: ApiType | null;
  model: string | null;
};

export type UpdateLlmConfigInput = {
  apiBase: string;
  /** 空字符串 = 不修改已有 key（仅改地址/类型/模型时）。 */
  apiKey: string;
  apiType: ApiType;
  model: string;
};

export type UpdateLlmConfigResult = {
  config: LlmConfig;
  needsRestart: boolean;
};
