import { z } from "zod";

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
   * - "analyse"    → FASTCLAW_AGENT_PAPER_ANALYSE
   * - "researcher" → FASTCLAW_AGENT_RESEARCHER
   * 比直接让前端传 agt_xxx 更安全：能锁死同一个会话不会被偷换 agent。
   */
  agentRole: z.enum(["deploy", "analyse", "researcher"]).optional(),
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

export type FastClawStreamEventDto =
  | { type: "delta"; content: string }
  | { type: "tool_start"; toolName: string; displayName: string; arguments?: string }
  | { type: "tool_result"; toolName: string; summary: string; result?: unknown }
  | { type: "progress"; phase: string; iteration?: number; max?: number }
  | { type: "done" }
  | { type: "error"; error: string };

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

// ---------- Analyse (论文分析助手) ----------

export const fastclawAnalyzeSchema = z.object({
  /** 论文 ID */
  paperId: z.string().min(1),
  /**
   * 可选：FastClaw 端会话标识。不传则后端按 paperId 派生稳定 key，
   * 让同一篇论文的多次分析落在同一个会话窗口。
   */
  sessionKey: z.string().min(1).optional(),
});

export type FastClawAnalyzeInput = z.infer<typeof fastclawAnalyzeSchema>;
