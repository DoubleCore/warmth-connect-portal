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
  /** 可选：指定 agent ID */
  agentId: z.string().optional(),
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
