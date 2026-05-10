import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import {
  createCommandSession,
  getCommandSessionHistory,
  openCommandStream,
  postCommandConfirmation,
  sendCommandMessage,
} from "@/api/command";
import type {
  CommandHistoryDto,
  CommandRuntimePhase,
  CommandStatus,
  CommandStreamEvent,
  CommandStreamEventType,
  ConfirmAction,
} from "@/types/command";

/**
 * useCommandStream —— Command Center 的大脑。
 *
 * 状态机（phase）：
 *   idle
 *     └─ run(message) ──▶ connecting
 *                          │
 *                          └─ 首帧到 ──▶ streaming
 *                                         │
 *                                         ├─ need_confirmation ──▶ awaiting_confirmation
 *                                         │                         │
 *                                         │                         ├─ confirm ──▶ streaming
 *                                         │                         └─ cancel  ──▶ (Backend 推 final(cancelled))
 *                                         ├─ final (cancelled)  ──▶ cancelled
 *                                         ├─ final (completed)  ──▶ completed
 *                                         └─ error              ──▶ failed
 *
 * 设计约束：
 *   - 一次只跑一条 command（MVP 足够）。再次 run 会把旧流关掉、把旧事件清空。
 *   - 会话 sessionId 按需创建并缓存在 ref 里，避免每次 run 都多一个 POST /sessions 的往返。
 *   - EventSource 的 "end" 是 Backend 自定义事件，意味着流正常终结；用它来关连接。
 *     若连接发生真错误而 Backend 未来得及写 error/end，浏览器的 onerror 会兜底把 phase 置 "failed"。
 */

export type CommandTranscriptItem =
  | {
      kind: "user";
      id: string;
      message: string;
      createdAt: number;
    }
  | {
      kind: "event";
      id: string;
      event: CommandStreamEvent;
      createdAt: number;
    };

export type ActiveConfirmation = {
  confirmationId: string;
  message: string;
  payload: unknown;
  /** 对应 need_confirmation 事件对外暴露的 transcript id，方便 UI 打标 */
  transcriptId: string;
};

export type UseCommandStreamReturn = {
  phase: CommandRuntimePhase;
  transcript: CommandTranscriptItem[];
  /** Backend 返回的最近一次 command id，方便日志 / 调试 */
  currentCommandId: string | null;
  /** 当前等待用户响应的确认卡片；awaiting_confirmation 阶段才有值 */
  pendingConfirmation: ActiveConfirmation | null;
  /** 最近一次错误；failed 阶段才有值 */
  error: { code?: string; message: string } | null;

  /** 发送一条自然语言指令；若已有进行中的 command 会替换为新的。 */
  run: (message: string, context?: Record<string, unknown>) => Promise<void>;
  /** 回应当前挂起的确认卡片。 */
  respondConfirmation: (action: ConfirmAction, payload?: Record<string, unknown>) => Promise<void>;
  /** 清空 transcript（保留 sessionId），回到 idle。 */
  reset: () => void;
  /**
   * 新建一条独立会话：在 reset 的基础上**同时**清掉 sessionId，让下一次 `run()`
   * 重新向 Backend 注册 `POST /api/command/sessions`，走一条全新的 Hermes
   * 会话上下文（后端不再把历史 turn 灌进去）。
   *
   * 适用场景：
   *   - 已完成的研究会话，用户想开新话题，避免旧回答影响 LLM 推理
   *   - 当前会话出错/上下文跑偏，用户想"重来"
   */
  newSession: () => void;
};

const TERMINAL_PHASES: ReadonlyArray<CommandRuntimePhase> = ["completed", "failed", "cancelled"];

/** 把服务器的字符串 id 配上事件位置做成稳定的 React key。 */
function makeTranscriptId(commandId: string, kind: string, seq: number): string {
  return `${commandId}:${kind}:${seq}`;
}

/**
 * localStorage key：按 entry 分 namespace，避免不同入口共享 sessionId。
 * 比如 home 页面和 settings 飞书卡片是两条独立的会话轨迹。
 */
function sessionStorageKey(entry: string | undefined): string {
  return `hermes.command.sessionId.${entry ?? "__default__"}`;
}

/** 安全地读 localStorage——SSR 环境 / 隐私模式 / 被禁用时都优雅回退成 null。 */
function readStoredSessionId(entry: string | undefined): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(sessionStorageKey(entry));
  } catch {
    return null;
  }
}

function writeStoredSessionId(entry: string | undefined, sessionId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const key = sessionStorageKey(entry);
    if (sessionId) window.localStorage.setItem(key, sessionId);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * 把后端 `CommandSessionHistoryDto` 重新拍平成前端 `transcript`。
 *
 * 规则：
 *   - 每条 command 先 push 一个 user bubble
 *   - 再依次 push 它的全部 event bubble（保持后端落库顺序）
 *   - seq 用一个单调计数器保证 React key 不冲突
 *
 * 对于历史 command，我们**不会**过滤 thinking/tool_* 这些中间态事件——前端 UI
 * 本来就按事件流渲染，过滤反而会让新旧展示不一致。
 */
function historyToTranscript(commands: CommandHistoryDto[]): {
  items: CommandTranscriptItem[];
  seq: number;
} {
  const items: CommandTranscriptItem[] = [];
  let seq = 0;
  for (const cmd of commands) {
    items.push({
      kind: "user",
      id: `${cmd.commandId}:user`,
      message: cmd.userMessage,
      createdAt: Date.parse(cmd.createdAt) || Date.now(),
    });
    for (const ev of cmd.events) {
      items.push({
        kind: "event",
        id: makeTranscriptId(cmd.commandId, ev.type, seq++),
        event: ev,
        createdAt: Date.parse(cmd.createdAt) || Date.now(),
      });
    }
  }
  return { items, seq };
}

/**
 * 从最后一条 command 的 status 推断一个合适的 phase。
 * 只影响"刷新后的初始 phase"：如果历史最后一条没跑完（running / waiting_confirmation），
 * 说明用户在流进行中断开过连接——退化成 `idle`，让用户手动重发，
 * 而不是 UI 上假装仍在 streaming（我们没有现成的 SSE 流重连到历史 command 上）。
 */
function phaseFromLastCommand(status: CommandStatus | undefined): CommandRuntimePhase {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case undefined:
      return "idle";
    default:
      return "idle";
  }
}

export function useCommandStream(options?: {
  /** 进入页面时带的入口标签，写入 command_sessions.entry，便于埋点区分 */
  entry?: string;
  /** 每次 run 附带的默认上下文。可在 run() 调用时被合并覆盖。 */
  baseContext?: Record<string, unknown>;
}): UseCommandStreamReturn {
  const [phase, setPhase] = useState<CommandRuntimePhase>("idle");
  const [transcript, setTranscript] = useState<CommandTranscriptItem[]>([]);
  const [currentCommandId, setCurrentCommandId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<ActiveConfirmation | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);

  // sessionId 懒创建并缓存
  const sessionIdRef = useRef<string | null>(null);
  // 当前 EventSource 指针。run / unmount 时需要主动关
  const eventSourceRef = useRef<EventSource | null>(null);
  // 事件流内递增 seq，仅用于生成 React key
  const seqRef = useRef(0);

  const closeStream = useCallback(() => {
    const es = eventSourceRef.current;
    if (!es) return;
    eventSourceRef.current = null;
    try {
      es.close();
    } catch {
      /* EventSource 关多次无害 */
    }
  }, []);

  // 卸载时清连接
  useEffect(() => {
    return () => closeStream();
  }, [closeStream]);

  // ---------- 刷新恢复 ----------
  // 挂载时如果 localStorage 里存着 sessionId，就去后端拉整段历史回填 transcript。
  // 后端单一真相，localStorage 只缓存 sessionId 字符串；命中 404 就丢掉失效 id。
  const entry = options?.entry;
  useEffect(() => {
    const stored = readStoredSessionId(entry);
    if (!stored) return;

    let cancelled = false;
    sessionIdRef.current = stored;
    (async () => {
      try {
        const history = await getCommandSessionHistory(stored);
        if (cancelled) return;
        const { items, seq } = historyToTranscript(history.commands);
        seqRef.current = seq;
        setTranscript(items);
        const last = history.commands[history.commands.length - 1];
        setCurrentCommandId(last?.commandId ?? null);
        setPhase(phaseFromLastCommand(last?.status));
      } catch (err) {
        if (cancelled) return;
        // 失效的 sessionId：丢掉，让下一次 run() 创建新会话
        if (err instanceof ApiError && err.status === 404) {
          sessionIdRef.current = null;
          writeStoredSessionId(entry, null);
          return;
        }
        // 其他错误（离线 / 5xx）：保留 sessionId 但不报红，让用户仍可以发消息
      }
    })();

    return () => {
      cancelled = true;
    };
    // entry 是 hook 的入参；切换 entry 等价于挂载新的 hook 实例，所以
    // 这里显式把它列为唯一依赖，无需 exhaustive-deps 关心其他变量。
  }, [entry]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const created = await createCommandSession({
      entry: options?.entry,
      initialContext: options?.baseContext,
    });
    sessionIdRef.current = created.sessionId;
    writeStoredSessionId(options?.entry, created.sessionId);
    return created.sessionId;
  }, [options?.entry, options?.baseContext]);

  const appendEvent = useCallback((commandId: string, ev: CommandStreamEvent) => {
    const seq = seqRef.current++;
    const id = makeTranscriptId(commandId, ev.type, seq);
    setTranscript((prev) => [...prev, { kind: "event", id, event: ev, createdAt: Date.now() }]);
    return id;
  }, []);

  const attachHandlers = useCallback(
    (es: EventSource, commandId: string) => {
      // 心跳与结束事件不进 transcript
      const handleTerminalEvent = () => {
        closeStream();
      };

      // 业务事件：与 CommandStreamEvent.type 名一一对应
      const bizTypes: CommandStreamEventType[] = [
        "thinking",
        "agent_message",
        "tool_start",
        "tool_result",
        "need_confirmation",
        "final",
        "error",
      ];

      for (const type of bizTypes) {
        es.addEventListener(type, (raw: MessageEvent<string>) => {
          let parsed: CommandStreamEvent | null = null;
          try {
            parsed = JSON.parse(raw.data) as CommandStreamEvent;
          } catch {
            // Backend 不会发非 JSON 的 event，保险起见静默丢弃
            return;
          }
          const transcriptId = appendEvent(commandId, parsed);

          if (parsed.type === "need_confirmation") {
            setPendingConfirmation({
              confirmationId: parsed.confirmationId,
              message: parsed.message,
              payload: parsed.payload,
              transcriptId,
            });
            setPhase("awaiting_confirmation");
          } else if (parsed.type === "final") {
            const result = parsed.result as { status?: string } | null | undefined;
            // Backend 在用户 cancel 时把 result.status 设为 "cancelled"；其他 final 视为 completed
            setPhase(result?.status === "cancelled" ? "cancelled" : "completed");
            setPendingConfirmation(null);
            handleTerminalEvent();
          } else if (parsed.type === "error") {
            const err: { code?: string; message: string } = {
              message: parsed.message,
            };
            if (parsed.code !== undefined) err.code = parsed.code;
            setError(err);
            setPhase("failed");
            setPendingConfirmation(null);
            handleTerminalEvent();
          } else {
            // 首帧业务事件到达时，若还在 connecting，切到 streaming
            setPhase((current) => (current === "connecting" ? "streaming" : current));
          }
        });
      }

      // `end`：Backend 告知"不会再有事件了"。正常路径下与前面的 final/error 一起发，
      // 作为彻底关闭 SSE 的信号
      es.addEventListener("end", handleTerminalEvent);

      // 浏览器原生 onerror：连接层错误。若此时还没进入终态，视为网络异常。
      es.onerror = () => {
        // EventSource 会在 CLOSED 状态下反复 fire onerror，只处理活跃连接
        if (es.readyState === EventSource.CLOSED) return;
        setError(
          (prev) =>
            prev ?? {
              code: "STREAM_CONNECTION_ERROR",
              message: "与后端的指令流连接中断。",
            },
        );
        setPhase((current) => (TERMINAL_PHASES.includes(current) ? current : "failed"));
        setPendingConfirmation(null);
        closeStream();
      };
    },
    [appendEvent, closeStream],
  );

  const run = useCallback(
    async (message: string, context?: Record<string, unknown>) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      // 开始新一轮追问：关掉旧 SSE 连接，清掉上一轮残留的错误 / 确认卡片，
      // 但**保留 transcript**——这样多轮对话能在 /research 面板里连续累积，
      // 用户能看到"问过什么 + 回答过什么"的完整历史。
      //
      // 清空历史的入口集中在：
      //   - reset()      ：保留 sessionId、清 transcript
      //   - newSession() ：清 sessionId + 清 transcript（右上角"新建会话"按钮）
      closeStream();
      setError(null);
      setPendingConfirmation(null);
      setCurrentCommandId(null);
      setPhase("connecting");

      try {
        const sessionId = await ensureSession();
        const resp = await sendCommandMessage(sessionId, {
          message: trimmed,
          context: { ...(options?.baseContext ?? {}), ...(context ?? {}) },
        });

        setCurrentCommandId(resp.commandId);
        // 用户自己的消息先放进 transcript，方便 UI 渲染对话流
        setTranscript((prev) => [
          ...prev,
          {
            kind: "user",
            id: `${resp.commandId}:user`,
            message: trimmed,
            createdAt: Date.now(),
          },
        ]);

        // 非流式兜底（streamUrl 为 null）：直接按 Backend 返回的结果收尾
        if (!resp.streamUrl) {
          const fallback: CommandStreamEvent =
            resp.status === "failed"
              ? {
                  type: "error",
                  message: resp.error?.message ?? "command failed",
                  ...(resp.error?.code !== undefined ? { code: resp.error.code } : {}),
                }
              : {
                  type: "final",
                  ...(resp.message !== undefined ? { message: resp.message } : {}),
                  result: resp.result ?? null,
                };
          appendEvent(resp.commandId, fallback);
          if (fallback.type === "final") {
            setPhase("completed");
          } else {
            const err: { code?: string; message: string } = {
              message: fallback.message,
            };
            if (fallback.code !== undefined) err.code = fallback.code;
            setError(err);
            setPhase("failed");
          }
          return;
        }

        const es = openCommandStream(resp.commandId);
        eventSourceRef.current = es;
        attachHandlers(es, resp.commandId);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error";
        const code = err instanceof ApiError ? err.code : "COMMAND_DISPATCH_FAILED";
        setError({ code, message });
        setPhase("failed");
      }
    },
    [appendEvent, attachHandlers, closeStream, ensureSession, options?.baseContext],
  );

  const respondConfirmation = useCallback(
    async (action: ConfirmAction, payload?: Record<string, unknown>) => {
      const current = pendingConfirmation;
      if (!current) return;
      // 用户已点击，UI 侧立刻回到 streaming 状态（即便 Backend resume 还在路上）
      // ，保证按钮不会在网络慢的时候让用户疑惑
      setPhase("streaming");
      setPendingConfirmation(null);
      try {
        await postCommandConfirmation(
          current.confirmationId,
          payload !== undefined ? { action, payload } : { action },
        );
      } catch (err) {
        // 确认 POST 失败不代表 Backend 没挂起；但前端要提示用户重试
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error";
        const code = err instanceof ApiError ? err.code : "CONFIRMATION_POST_FAILED";
        setError({ code, message });
        setPhase("failed");
      }
    },
    [pendingConfirmation],
  );

  const reset = useCallback(() => {
    closeStream();
    setTranscript([]);
    setCurrentCommandId(null);
    setPendingConfirmation(null);
    setError(null);
    setPhase("idle");
    seqRef.current = 0;
    // 注意：不清 sessionIdRef，保持会话连续
  }, [closeStream]);

  /**
   * 等价于 reset() + 丢弃 sessionId。
   * 下一次 run() 会重新 POST /api/command/sessions 创建新会话，
   * Backend 侧的 conversation_history 也就从空开始。
   * 同时清掉 localStorage 缓存，避免刷新后又把旧会话拉回来。
   */
  const newSession = useCallback(() => {
    closeStream();
    setTranscript([]);
    setCurrentCommandId(null);
    setPendingConfirmation(null);
    setError(null);
    setPhase("idle");
    seqRef.current = 0;
    sessionIdRef.current = null;
    writeStoredSessionId(options?.entry, null);
  }, [closeStream, options?.entry]);

  return {
    phase,
    transcript,
    currentCommandId,
    pendingConfirmation,
    error,
    run,
    respondConfirmation,
    reset,
    newSession,
  };
}
