/**
 * 与 backend `modules/agents` 的 DTO 对齐。
 *
 * NOTE: 后端只暴露三个固定 agent（论文搜索、RAG 阅读、论文部署），
 * 因此前端用 `AgentRole` 而不是单纯字符串来确保类型安全。
 */

export type AgentRole = "paper-search" | "rag-paper-reader" | "paper-deploy";

export type ProviderKind = "openai";

export type Agent = {
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
    apiKeyConfigured: boolean;
  };
  /** 配置文件最后修改时间（ISO）。 */
  updatedAt: string;
};

/**
 * 任何字段都允许 partial 更新。`provider.apiKey` 字段语义：
 *   - 不传        → 保留现有密钥不变
 *   - 显式空串 "" → 清空密钥
 *   - 非空字符串  → 后端加密落盘
 */
export type UpdateAgentInput = {
  displayName?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxToolIterations?: number;
  provider?: {
    kind?: ProviderKind;
    apiBase?: string;
    apiKey?: string;
  };
};

export type TestAgentResult = {
  ok: boolean;
  reply?: string;
  error?: string;
  durationMs: number;
};
