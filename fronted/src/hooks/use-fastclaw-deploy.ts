/**
 * useFastClawDeploy — Manager 页面的 FastClaw 部署对话 hook
 *
 * 比 useCommandStream 轻量得多：
 *   - 不走 Hermes Runs API，直接对接 FastClaw SSE
 *   - 不需要 approval/confirmation 流程
 *   - 支持追问（把历史 messages 带上）
 *
 * 状态机：idle → streaming → completed / error
 *
 * 持久化：传入 `persistKey`（manager 里就是 reproductionId）后，
 * messages / sessionKey / history 会写到 localStorage。刷新后 hook 自动恢复，
 * 避免重复触发部署初始化、保留之前的进度。详见下方 readStored / writeStored。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api-client";

export type DeployMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
};

export type DeployPhase = "idle" | "streaming" | "completed" | "error";

export type UseFastClawDeployReturn = {
  phase: DeployPhase;
  messages: DeployMessage[];
  error: string | null;
  /**
   * `true` 表示 hook 已经完成 localStorage 恢复（或没有 persistKey 时直接为 true）。
   * Manager 页面的 auto-fire 必须等这个标志为 true 再判断要不要发起部署，
   * 否则会在 restore 之前看到空 messages 误以为「全新会话」而重发指令。
   */
  restored: boolean;
  /** 发起部署（首次调用）或追问 */
  send: (message: string, options?: { systemPrompt?: string }) => void;
  /**
   * 自动触发部署流。`preview` 是给用户看的"我在请求什么"摘要，
   * 会作为 user 气泡渲染出来——不会发给后端，纯 UI 用，避免用户盯着空白等。
   */
  startDeploy: (
    params: {
      reproductionId: string;
      paperId: string;
      deviceId: string;
    },
    preview?: string,
  ) => void;
  /** 重置对话 */
  reset: () => void;
};

let msgSeq = 0;
function nextId(): string {
  return `fc-${Date.now()}-${++msgSeq}`;
}

// ---------- 持久化 ----------

const STORAGE_PREFIX = "hermes.fastclaw-deploy.v1.";

type StoredState = {
  version: 1;
  messages: DeployMessage[];
  sessionKey: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

function storageKey(persistKey: string): string {
  return `${STORAGE_PREFIX}${persistKey}`;
}

function readStored(persistKey: string): StoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(persistKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (parsed.version !== 1) return null;
    return {
      version: 1,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      sessionKey: typeof parsed.sessionKey === "string" ? parsed.sessionKey : null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return null;
  }
}

function writeStored(persistKey: string, state: StoredState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (state === null) {
      window.localStorage.removeItem(storageKey(persistKey));
    } else {
      window.localStorage.setItem(storageKey(persistKey), JSON.stringify(state));
    }
  } catch {
    // quota / private mode — 忽略
  }
}

export function useFastClawDeploy(opts?: {
  persistKey?: string;
}): UseFastClawDeployReturn {
  const persistKey = opts?.persistKey;

  const [phase, setPhase] = useState<DeployPhase>("idle");
  const [messages, setMessages] = useState<DeployMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 没有 persistKey 时不需要恢复，直接置 true。
  const [restored, setRestored] = useState<boolean>(!persistKey);

  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  /**
   * FastClaw 端会话标识。和后端 chat/completions 的 X-Fastclaw-Session-Key
   * 一一对应——同一个 sessionKey 让 FastClaw 把所有请求归并到同一个会话窗口，
   * 避免每条消息都新开 chat。startDeploy 时按 reproductionId 派生稳定 key，
   * 后续 send 自动复用，reset 时清空。
   */
  const sessionKeyRef = useRef<string | null>(null);
  // 标记当前 hook 已经恢复完毕的 persistKey；切 key 时重新跑 restore。
  const restoredKeyRef = useRef<string | null>(null);

  // ---------- 恢复：persistKey 变化时从 localStorage 拉一次 ----------
  useEffect(() => {
    if (!persistKey) {
      // 没 persistKey 就清空（key 从有切到无）。
      restoredKeyRef.current = null;
      setRestored(true);
      return;
    }
    if (restoredKeyRef.current === persistKey) return;

    // 切 reproductionId 时先把当前流断掉，避免旧请求把新 key 的状态污染了。
    abortRef.current?.abort();
    abortRef.current = null;

    const stored = readStored(persistKey);
    if (stored) {
      setMessages(stored.messages);
      sessionKeyRef.current = stored.sessionKey;
      historyRef.current = stored.history;
      // 刷新前可能正在 streaming——恢复时统一降级成 completed，
      // 防止 UI 假装还在请求但实际并没有 fetch。
      setPhase(stored.messages.length > 0 ? "completed" : "idle");
    } else {
      setMessages([]);
      sessionKeyRef.current = null;
      historyRef.current = [];
      setPhase("idle");
    }
    setError(null);
    restoredKeyRef.current = persistKey;
    setRestored(true);
  }, [persistKey]);

  // ---------- 持久化：messages / phase 变化时回写 ----------
  useEffect(() => {
    if (!persistKey) return;
    if (!restored) return;
    if (restoredKeyRef.current !== persistKey) return; // restore 还没追上 key 变化

    if (messages.length === 0) {
      writeStored(persistKey, null);
      return;
    }

    writeStored(persistKey, {
      version: 1,
      messages,
      sessionKey: sessionKeyRef.current,
      history: historyRef.current,
    });
    // phase 也作为依赖：streaming 完成时 historyRef 会被 push，但 messages 不变；
    // 必须借 phase 切换那一帧把最终的 history 写回去。
  }, [persistKey, restored, messages, phase]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setMessages([]);
    setError(null);
    historyRef.current = [];
    sessionKeyRef.current = null;
    if (persistKey) {
      writeStored(persistKey, null);
    }
  }, [persistKey]);

  /**
   * 通用 SSE 消费：POST 到指定 URL，读取 delta/done/error 事件
   */
  const consumeStream = useCallback(
    async (url: string, body: Record<string, unknown>, userMsg?: string) => {
      // 如果有用户消息，先加到 transcript
      if (userMsg) {
        const userBubble: DeployMessage = {
          id: nextId(),
          role: "user",
          content: userMsg,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, userBubble]);
        historyRef.current.push({ role: "user", content: userMsg });
      }

      setPhase("streaming");
      setError(null);

      const assistantId = nextId();
      // 先加一个空的 assistant bubble，后续 append content
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              const eventType = line.slice(7).trim();
              if (eventType === "done") {
                setPhase("completed");
                historyRef.current.push({ role: "assistant", content: fullContent });
                return;
              }
              if (eventType === "error") {
                // next data line will have the error
                continue;
              }
            }
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr) as { content?: string; error?: string };
                if (data.error) {
                  setError(data.error);
                  setPhase("error");
                  return;
                }
                if (data.content) {
                  fullContent += data.content;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: fullContent } : m,
                    ),
                  );
                }
              } catch {
                // skip unparseable lines
              }
            }
          }
        }

        // Stream ended without explicit done event
        if (fullContent) {
          historyRef.current.push({ role: "assistant", content: fullContent });
        }
        setPhase("completed");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        setPhase("error");
      }
    },
    [],
  );

  /**
   * 自动触发部署 — 调用 /api/fastclaw/deploy/stream
   */
  const startDeploy = useCallback(
    (
      params: { reproductionId: string; paperId: string; deviceId: string },
      preview?: string,
    ) => {
      const url = `${getApiBaseUrl()}/api/fastclaw/deploy/stream`;
      // 按 reproductionId 派生稳定 sessionKey：同一条复现记录里多次部署 / 追问
      // 走同一个 FastClaw 会话窗口；reset() 才会清掉。
      const sessionKey =
        sessionKeyRef.current ?? `wcp-deploy-${params.reproductionId}`;
      sessionKeyRef.current = sessionKey;

      // 首屏给用户看的"我在做什么"——一个 system 通告 + 可选的 user 摘要气泡，
      // 让他们立刻知道部署初始化指令已经发出去了，不会盯着空白等。
      const initialMessages: DeployMessage[] = [
        {
          id: nextId(),
          role: "system",
          content: "\u{1F680} 部署任务已启动，正在连接 FastClaw 论文部署助手…",
          createdAt: Date.now(),
        },
      ];
      if (preview) {
        const userBubble: DeployMessage = {
          id: nextId(),
          role: "user",
          content: preview,
          createdAt: Date.now(),
        };
        initialMessages.push(userBubble);
        // 历史里也补一条 user，让后续追问保持上下文连贯。
        historyRef.current.push({ role: "user", content: preview });
      }
      setMessages(initialMessages);

      void consumeStream(url, { ...params, sessionKey });
    },
    [consumeStream],
  );

  /**
   * 追问 — 调用 /api/fastclaw/chat/stream（带历史）
   *
   * 注意：默认走 deploy agent（manager 页面的语境就是部署）；如果未来要让
   * 别的页面复用这个 hook，再把 agentRole 提到 hook 参数上。
   */
  const send = useCallback(
    (message: string, options?: { systemPrompt?: string }) => {
      const url = `${getApiBaseUrl()}/api/fastclaw/chat/stream`;
      // 复用部署阶段的 sessionKey；如果还没初始化（用户直接打字），
      // 临时生成一个会话标识，至少保证之后几轮聊天落在同一个窗口里。
      if (!sessionKeyRef.current) {
        sessionKeyRef.current = `wcp-chat-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
      }
      const body: Record<string, unknown> = {
        message,
        history: historyRef.current,
        stream: true,
        sessionKey: sessionKeyRef.current,
        // 锁死到 deploy agent，避免 env.FASTCLAW_AGENT_ID 改了把追问偷换成别的 agent。
        agentRole: "deploy",
      };
      if (options?.systemPrompt) body.systemPrompt = options.systemPrompt;
      void consumeStream(url, body, message);
    },
    [consumeStream],
  );

  return { phase, messages, error, restored, send, startDeploy, reset };
}
