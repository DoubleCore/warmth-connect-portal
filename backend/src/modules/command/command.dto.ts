import { z } from "zod";

/**
 * 前端接口 DTO 与类型
 * 对应 Hermes_Command_Center_HTTP_直连可用版.md §5 / §6
 *
 * 本文件只描述"前端 <-> Backend"的契约；与 Hermes 对齐的类型放在 hermes.client.ts。
 */

// ---------- 会话 ----------

export const createCommandSessionSchema = z
  .object({
    entry: z.string().trim().min(1).optional(),
    // 任意页面上下文快照。保持松类型，由前端决定放什么。
    initialContext: z.record(z.unknown()).default({}),
  })
  .default({ initialContext: {} });

export type CreateCommandSessionInput = z.infer<typeof createCommandSessionSchema>;

export type CommandSessionDto = {
  sessionId: string;
  entry: string | null;
  createdAt: string;
};

// ---------- 消息 ----------

export const sendCommandMessageSchema = z.object({
  message: z.string().trim().min(1, "message cannot be empty"),
  context: z.record(z.unknown()).default({}),
});
export type SendCommandMessageInput = z.infer<typeof sendCommandMessageSchema>;

/** 设计文档 §11.1 commands.status */
export const commandStatusEnum = z.enum([
  "pending",
  "running",
  "waiting_confirmation",
  "completed",
  "failed",
  "cancelled",
]);
export type CommandStatus = z.infer<typeof commandStatusEnum>;

/**
 * 非流式链路下，POST /sessions/:id/messages 直接返回完整结果。
 * 第二阶段加入 SSE 后，会改为立即返回 { commandId, status: "running", streamUrl }。
 *
 * 这里保留 streamUrl 字段（Phase 1 为 null），前端可以根据它是否存在决定
 * 走非流式等待响应还是打开 EventSource。
 */
export type CommandMessageResponseDto = {
  commandId: string;
  status: CommandStatus;
  streamUrl: string | null;
  /** Phase 1：同步返回 Hermes final 事件的消息与 result；Phase 2 可能为 undefined */
  message?: string;
  result?: unknown;
  error?: {
    code?: string;
    message: string;
  };
};

// ---------- 前端统一事件 ----------

/**
 * CommandStreamEvent：Backend -> Frontend 统一事件类型。
 * 与设计文档 §6 严格对齐。
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

// ---------- 确认（Phase 3） ----------

/**
 * 前端对确认卡片的响应。对应设计文档 §10：
 *   { "action": "confirm" } 或 { "action": "cancel" }
 *
 * payload 是可选的扩展字段：前端可以带上表单补充的参数（例如"本次仅对该设备生效"），
 * Backend 原样透传给 Hermes resume 接口。
 */
export const confirmCommandActionSchema = z.object({
  action: z.enum(["confirm", "cancel"]),
  payload: z.record(z.unknown()).optional(),
});
export type ConfirmCommandActionInput = z.infer<typeof confirmCommandActionSchema>;

export type ConfirmationResponseDto = {
  confirmationId: string;
  commandId: string;
  action: "confirm" | "cancel";
  /** true 表示 Backend 成功把决策递给了挂起的 runCommand */
  accepted: boolean;
};

// ---------- 会话历史回放 ----------

/**
 * 单条 command 在 /api/command/sessions/:id/history 里的表现。
 * 用户原始提问 + 按时间顺序的所有事件，用于前端 `transcript` 的重建。
 */
export type CommandHistoryDto = {
  commandId: string;
  userMessage: string;
  status: CommandStatus;
  createdAt: string;
  updatedAt: string;
  /** 该 command 下的所有事件，按落库顺序 */
  events: CommandStreamEvent[];
};

export type CommandSessionHistoryDto = {
  sessionId: string;
  entry: string | null;
  createdAt: string;
  commands: CommandHistoryDto[];
};
