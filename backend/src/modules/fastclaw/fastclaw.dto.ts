import { z } from "zod";

export const fastclawAgentRoleSchema = z.enum([
  "deploy",
  "analyse",
  "researcher",
  "reader",
  "search",
]);
export type FastClawAgentRole = z.infer<typeof fastclawAgentRoleSchema>;

// ---------- 请求 ----------

export const fastclawChatSchema = z.object({
  message: z.string().min(1, "消息不能为空"),
  /** 可选：前几轮对话历史（前端管理） */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .optional(),
  /** 可选：system prompt 覆写 */
  systemPrompt: z.string().optional(),
  /** 可选：指定 agent ID（直接传 agt_xxx；优先级高于 agentRole） */
  agentId: z.string().optional(),
  /**
   * 可选：按用途选 agent，后端按白名单映射到对应 env 变量。
   * - "deploy"     → FASTCLAW_AGENT_DEPLOY
   * - "analyse"/"reader" → FASTCLAW_AGENT_PAPER_ANALYSE（RAG 论文阅读助手）
   * - "researcher"/"search" → FASTCLAW_AGENT_RESEARCHER（论文搜索助手）
   * 比直接让前端传 agt_xxx 更安全：能锁死同一个会话不会被偷换 agent。
   */
  agentRole: fastclawAgentRoleSchema.optional(),
  /**
   * 可选：FastClaw 端会话标识（透传成 X-Fastclaw-Session-Key）。
   * 同一个 sessionKey 让 FastClaw 把多次请求归并到同一个会话窗口。
   * 不传则 FastClaw 每次都会开新会话。
   */
  sessionKey: z.string().min(1).optional(),
  /** 是否流式（默认 true） */
  stream: z.boolean().optional().default(true),
});

export type FastClawChatInput = z.infer<typeof fastclawChatSchema>;

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

export type FastClawStreamEventDto = {
  type: "delta" | "done" | "error";
  content?: string;
  error?: string;
};

// ---------- Deploy (论文部署助手) ----------

export const fastclawDeploySchema = z.object({
  /** reproduction record ID */
  reproductionId: z.string().min(1),
  /** 论文 ID */
  paperId: z.string().min(1),
  /** 设备 ID (host_credentials 关联) */
  deviceId: z.string().min(1),
  /**
   * 可选：FastClaw 端会话标识。前端首次部署时生成并缓存，
   * 后续追问 chat 用同一个 sessionKey 让 FastClaw 保持上下文。
   */
  sessionKey: z.string().min(1).optional(),
});

export type FastClawDeployInput = z.infer<typeof fastclawDeploySchema>;

// ---------- Persistent FastClaw sessions ----------

export const createFastClawSessionSchema = z
  .object({
    entry: z.string().trim().min(1).optional(),
    initialContext: z.record(z.unknown()).default({}),
    agentRole: fastclawAgentRoleSchema.optional(),
    agentId: z.string().trim().min(1).optional(),
  })
  .default({ initialContext: {} });

export type CreateFastClawSessionInput = z.infer<typeof createFastClawSessionSchema>;

export const sendFastClawMessageSchema = z.object({
  message: z.string().trim().min(1, "message cannot be empty"),
  context: z.record(z.unknown()).default({}),
  systemPrompt: z.string().optional(),
  agentRole: fastclawAgentRoleSchema.optional(),
  agentId: z.string().trim().min(1).optional(),
});

export type SendFastClawMessageInput = z.infer<typeof sendFastClawMessageSchema>;

export const fastclawRunStatusEnum = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type FastClawRunStatus = z.infer<typeof fastclawRunStatusEnum>;

export type FastClawSessionDto = {
  sessionId: string;
  entry: string | null;
  agentRole: FastClawAgentRole | null;
  agentId: string | null;
  createdAt: string;
};

export type FastClawRunResponseDto = {
  runId: string;
  status: FastClawRunStatus;
  streamUrl: string | null;
  message?: string;
  result?: unknown;
  error?: {
    code?: string;
    message: string;
  };
};

export type FastClawHistoryRunDto = {
  runId: string;
  userMessage: string;
  status: FastClawRunStatus;
  agentRole: FastClawAgentRole | null;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
  events: CommandStreamEvent[];
};

export type FastClawSessionHistoryDto = {
  sessionId: string;
  entry: string | null;
  agentRole: FastClawAgentRole | null;
  agentId: string | null;
  createdAt: string;
  runs: FastClawHistoryRunDto[];
};

// ---------- Stream events (Backend → Frontend) ----------

/**
 * 统一的事件流契约，前端 SSE 消费方按 `type` 分发。
 *
 * 历史背景：这套形状原本来自 Hermes 指令中心（command 模块），claw-only 分支
 * 拆掉那一层之后把它内联到 FastClaw 模块自己持有。前端类型保持同名以减少改动
 * 面，但语义上现在它就是 FastClaw run 的事件流。
 */
export type CommandStreamEvent =
  | {
      type: "thinking";
      message: string;
    }
  | {
      type: "agent_message";
      message: string;
    }
  | {
      type: "tool_start";
      toolName: string;
      displayName: string;
    }
  | {
      type: "tool_result";
      toolName: string;
      summary: string;
      result?: unknown;
    }
  | {
      type: "need_confirmation";
      confirmationId: string;
      message: string;
      payload: unknown;
    }
  | {
      type: "final";
      message?: string;
      result: unknown;
    }
  | {
      type: "error";
      message: string;
      code?: string;
    };
