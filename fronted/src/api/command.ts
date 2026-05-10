import { apiFetch, apiUrl } from "@/lib/api-client";
import type {
  CommandMessageResponseDto,
  CommandSessionDto,
  ConfirmCommandActionInput,
  ConfirmationResponseDto,
} from "@/types/command";

/**
 * 前端 <-> 后端 Command Center API 胶水层。
 *
 * 与后端路由（backend/src/modules/command/command.routes.ts）一一对应：
 *   POST /api/command/sessions
 *   POST /api/command/sessions/:sessionId/messages
 *   GET  /api/command/commands/:commandId/stream      ← 用 EventSource 订阅，不走 apiFetch
 *   POST /api/command/confirmations/:confirmationId
 */

// ---------- REST ----------

/** 新建会话。在进入 Command Center 页面 / 首次发送指令时调一次即可。 */
export async function createCommandSession(input?: {
  entry?: string;
  initialContext?: Record<string, unknown>;
}): Promise<CommandSessionDto> {
  return apiFetch<CommandSessionDto>("/api/command/sessions", {
    method: "POST",
    json: {
      entry: input?.entry,
      initialContext: input?.initialContext ?? {},
    },
  });
}

/**
 * 发送一条自然语言指令。
 * 非阻塞：Backend 立即返回 `{ commandId, status: "running", streamUrl }`，
 * 真正的执行过程通过 EventSource 推送。
 */
export async function sendCommandMessage(
  sessionId: string,
  input: { message: string; context?: Record<string, unknown> },
): Promise<CommandMessageResponseDto> {
  return apiFetch<CommandMessageResponseDto>(
    `/api/command/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      json: {
        message: input.message,
        context: input.context ?? {},
      },
    },
  );
}

/** 对 need_confirmation 卡片返回 confirm / cancel。幂等：失效的 confirmationId 返回 accepted=false 而非 4xx。 */
export async function postCommandConfirmation(
  confirmationId: string,
  input: ConfirmCommandActionInput,
): Promise<ConfirmationResponseDto> {
  return apiFetch<ConfirmationResponseDto>(
    `/api/command/confirmations/${encodeURIComponent(confirmationId)}`,
    {
      method: "POST",
      json: input,
    },
  );
}

// ---------- SSE ----------

/**
 * 打开 Backend 的 SSE 流。
 *
 * 为什么不用 fetch + ReadableStream：浏览器原生 EventSource 已经处理好：
 *   - 自动重连（断线后 ~3s 尝试重连，并携带 Last-Event-ID）
 *   - 心跳注释帧被自动忽略
 *   - 消息缓冲与帧边界判断
 * 后端 `/stream` 就是为此而设计的 GET SSE 端点，所以前端也该用 EventSource。
 *
 * 缺点：EventSource 不支持自定义 header / cookie 跨域时需要 `withCredentials`；
 * 我们的 API 用 CORS 允许的同源或 origin 列表，当前没认证头需求。
 */
export function openCommandStream(commandId: string): EventSource {
  const url = apiUrl(`/api/command/commands/${encodeURIComponent(commandId)}/stream`);
  // withCredentials=false：匹配 backend 当前 CORS 行为（origin="*" 时 credentials 会被拒）
  return new EventSource(url, { withCredentials: false });
}

/** 事件回放（polling fallback / 调试用；常规流不需要）。 */
export async function listCommandEvents(commandId: string): Promise<{
  commandId: string;
  events: unknown[];
}> {
  return apiFetch(`/api/command/commands/${encodeURIComponent(commandId)}/events`);
}
