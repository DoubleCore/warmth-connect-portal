/**
 * Stream event contract shared between Backend and Frontend for FastClaw runs.
 *
 * 历史背景：这套类型最初服务于 Hermes 指令中心。claw-only 分支拆掉了
 * Hermes 那一层，但 FastClaw run 的事件仍然沿用同一个 shape（见
 * `backend/src/modules/fastclaw/fastclaw.dto.ts::CommandStreamEvent`），
 * 改动时请同步两边。
 */

/**
 * Backend → Frontend 的统一事件。Backend 侧还会在 SSE 层额外发 `ping`（心跳）
 * 和 `end`（结束）帧，这些在 hook 里单独处理，不放入业务事件流。
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

/**
 * Hook 对外暴露的运行时状态机。沿用 Hermes 时期的命名以避免大面积改动；
 * `awaiting_confirmation` 在当前 FastClaw 路径下不会出现，但保留给将来扩展。
 */
export type CommandRuntimePhase =
  | "idle"
  | "connecting"
  | "streaming"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "cancelled";
