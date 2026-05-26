import { z } from "zod";

import { AGENT_ROLES, PROVIDER_KINDS } from "./agents.dto.js";

/**
 * 落盘 schema：data/agents/<id>/agent.json
 *
 * 与 DTO 不同的是：apiKey 总是以 `apiKeyEnc` 字段保存（AES-256-GCM Base64），
 * 缺省字段在读取时由 `agentFileSchema.parse` 自动补默认值。
 *
 * 字段稳定性：这是真正的持久化契约，迁移升级时要兼容老文件。一旦发布出去，
 * 删字段 / 改 enum 必须给迁移路径。
 */

export const providerFileSchema = z.object({
  kind: z.enum(PROVIDER_KINDS).default("openai"),
  apiBase: z.string().url().default("https://api.openai.com/v1"),
  /** AES-256-GCM Base64 字符串。空字符串 / undefined → 视为未配置。 */
  apiKeyEnc: z.string().optional(),
});

export const agentFileSchema = z.object({
  id: z.string().regex(/^agt_[A-Za-z0-9]+$/),
  role: z.enum(AGENT_ROLES),
  displayName: z.string().min(1).max(120),
  model: z.string().min(1).max(120).default("openai/gpt-4o-mini"),
  temperature: z.number().min(0).max(2).default(0.4),
  maxTokens: z.number().int().min(64).max(64_000).default(8192),
  maxToolIterations: z.number().int().min(1).max(100).default(20),
  provider: providerFileSchema.default({
    kind: "openai",
    apiBase: "https://api.openai.com/v1",
  }),
});

export type AgentFile = z.infer<typeof agentFileSchema>;

/**
 * 内置三个 agent 的种子配置。首启动 / 卸载重装后会用它把 agents 目录初始化出来；
 * 注意这里 model / temperature 来源于 fastclaw/config/hermes-agents.json，保持一致。
 */
export const SEED_AGENTS: ReadonlyArray<
  Pick<
    AgentFile,
    "id" | "role" | "displayName" | "temperature" | "maxTokens" | "maxToolIterations"
  >
> = [
  {
    id: "agt_f908ad32af3120090a37",
    role: "paper-search",
    displayName: "论文搜索助手",
    temperature: 0.4,
    maxTokens: 8192,
    maxToolIterations: 20,
  },
  {
    id: "agt_18b2eb56cb44f511848e",
    role: "rag-paper-reader",
    displayName: "RAG 论文阅读助手",
    temperature: 0.3,
    maxTokens: 8192,
    maxToolIterations: 20,
  },
  {
    id: "agt_44d05b7677054cebfdad",
    role: "paper-deploy",
    displayName: "论文部署助手",
    temperature: 0.2,
    maxTokens: 8192,
    maxToolIterations: 30,
  },
];
