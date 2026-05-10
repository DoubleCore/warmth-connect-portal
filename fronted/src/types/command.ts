/**
 * Hermes 指令中心（Command Center）前后端统一类型。
 * 严格对齐 backend/src/modules/command/command.dto.ts，改动时请同时同步。
 *
 * 设计依据：Hermes_Command_Center_HTTP_直连可用版.md §5 / §6 / §10
 */

// ---------- 会话与消息 ----------

export type CommandSessionDto = {
  sessionId: string;
  entry: string | null;
  createdAt: string;
};

export type CommandStatus =
  | "pending"
  | "running"
  | "waiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";

export type CommandMessageResponseDto = {
  commandId: string;
  status: CommandStatus;
  /** 流式模式下为 `/api/command/commands/:id/stream`；未来非流式场景可能为 null。 */
  streamUrl: string | null;
  message?: string;
  result?: unknown;
  error?: {
    code?: string;
    message: string;
  };
};

// ---------- 前端看到的统一事件 ----------

/**
 * Backend 推送给前端的统一事件。严格对齐 backend command.dto.ts.CommandStreamEvent。
 * Backend 侧还会在 SSE 层额外发 `ping`（心跳）和 `end`（结束）帧，这些在 hook 里单独处理，
 * 不放入业务事件流。
 */
export type CommandStreamEvent =
  | { type: "thinking"; message: string }
  | { type: "agent_message"; message: string }
  | { type: "tool_start"; toolName: string; displayName: string }
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
  | { type: "final"; message?: string; result: unknown }
  | { type: "error"; message: string; code?: string };

export type CommandStreamEventType = CommandStreamEvent["type"];

// ---------- 确认回执 ----------

export type ConfirmAction = "confirm" | "cancel";

export type ConfirmCommandActionInput = {
  action: ConfirmAction;
  payload?: Record<string, unknown>;
};

export type ConfirmationResponseDto = {
  confirmationId: string;
  commandId: string;
  action: ConfirmAction;
  accepted: boolean;
};

// ---------- 会话历史回放 ----------

/**
 * GET /api/command/sessions/:sessionId/history 的返回。
 * 与 backend/command.dto.ts::CommandSessionHistoryDto 一一对应。
 *
 * 用于刷新页面 / 重开浏览器后，根据 localStorage 缓存的 sessionId
 * 恢复 transcript——单一真相仍在后端 SQLite，前端只缓存 sessionId 字符串。
 */
export type CommandHistoryDto = {
  commandId: string;
  userMessage: string;
  status: CommandStatus;
  createdAt: string;
  updatedAt: string;
  events: CommandStreamEvent[];
};

export type CommandSessionHistoryDto = {
  sessionId: string;
  entry: string | null;
  createdAt: string;
  commands: CommandHistoryDto[];
};

// ---------- Hook 对外暴露的运行时状态 ----------

export type CommandRuntimePhase =
  | "idle" // 还没发送任何指令
  | "connecting" // 已 POST message，正在等 SSE 首帧
  | "streaming" // 正在消费事件流
  | "awaiting_confirmation" // 收到 need_confirmation，等待用户决策
  | "completed"
  | "failed"
  | "cancelled";
