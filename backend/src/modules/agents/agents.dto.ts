import { z } from "zod";

/**
 * Agent 角色。和 FastClaw 端的 hermes-agents.json 字段一致。
 *
 * 当前固定三个 agent：
 *   - paper-search    论文搜索助手
 *   - rag-paper-reader RAG 论文阅读助手
 *   - paper-deploy    论文部署助手
 */
export const AGENT_ROLES = ["paper-search", "rag-paper-reader", "paper-deploy"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/**
 * Provider 类型。MVP 只支持 OpenAI 兼容的 HTTP 接口（OpenAI / DeepSeek / Ollama / 阿里 DashScope 兼容模式）。
 * 未来扩 anthropic 时再加分支即可。
 */
export const PROVIDER_KINDS = ["openai"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/**
 * Provider 配置（明文）。后端持久化时把 `apiKey` 加密成 `apiKeyEnc`。
 * 这里区分 "已有但保持不变" 与 "清空" 两种情况：
 *   - 不传 apiKey 字段 → 不变
 *   - 显式 apiKey: ""   → 清空（后续请求会 503）
 */
export const providerInputSchema = z.object({
  kind: z.enum(PROVIDER_KINDS).default("openai"),
  apiBase: z.string().url().default("https://api.openai.com/v1"),
  apiKey: z.string().optional(),
});
export type ProviderInput = z.infer<typeof providerInputSchema>;

/** PUT /api/agents/:id 的入参；任何字段都允许部分更新（patch 语义）。 */
export const updateAgentInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(64_000).optional(),
  maxToolIterations: z.number().int().min(1).max(100).optional(),
  provider: providerInputSchema.partial().optional(),
});
export type UpdateAgentInput = z.infer<typeof updateAgentInputSchema>;

/** 对外返回的 agent 元数据，绝不出现明文 apiKey。 */
export type AgentDto = {
  id: string;
  role: AgentRole;
  displayName: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxToolIterations: number;
  provider: {
    kind: ProviderKind;
    apiBase: string;
    /** 是否已经填了 API Key。明文绝不外泄。 */
    apiKeyConfigured: boolean;
  };
  /** 配置文件最后修改时间。便于前端做"已保存 X 秒前"的提示。 */
  updatedAt: string;
};

/** POST /api/agents/:id/test 的入参。可选传 message，否则服务端用一句固定的 ping prompt。 */
export const testAgentInputSchema = z.object({
  message: z.string().trim().min(1).max(2000).optional(),
});
export type TestAgentInput = z.infer<typeof testAgentInputSchema>;

export type TestAgentResult = {
  ok: boolean;
  /** Provider 实际返回的内容（截断到 500 字符），仅在成功时存在。 */
  reply?: string;
  /** 失败时的人类可读消息。 */
  error?: string;
  /** 总耗时（毫秒）。 */
  durationMs: number;
};
