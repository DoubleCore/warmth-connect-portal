/**
 * useFastClawResearch — 论文搜索页（/research）的 FastClaw 对话 hook
 *
 * 在共享核心 useFastclawStream 之上包一层 localStorage 持久化，模式与
 * use-fastclaw-deploy 一致，但更简单：
 *   - 论文搜索只有「一个」全局会话，故 persistKey 固定，不按实体派生
 *   - 锁死 agentRole = "researcher"，避免 env 改动把会话偷换成别的 agent
 *   - 刷新后自动恢复 items / sessionKey / history；streaming 态降级为 completed
 *
 * 状态机：idle → streaming → completed / error（由核心维护）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  useFastclawStream,
  type FastclawTranscriptItem,
  type FastclawStreamPhase,
  type FastclawHistoryTurn,
} from "@/hooks/use-fastclaw-stream";

export type UseFastClawResearchReturn = {
  phase: FastclawStreamPhase;
  items: FastclawTranscriptItem[];
  error: string | null;
  /** `true` 表示已完成 localStorage 恢复（无 persistKey 时直接为 true）。 */
  restored: boolean;
  historyRef: React.MutableRefObject<FastclawHistoryTurn[]>;
  /** 发起一轮搜索 / 追问 */
  send: (message: string, options?: { systemPrompt?: string }) => void;
  /** 重置对话并清掉持久化 */
  reset: () => void;
};

// v1：研究对话的结构化 transcript 缓存。
const STORAGE_KEY = "hermes.fastclaw-research.v1";

type StoredState = {
  version: 1;
  items: FastclawTranscriptItem[];
  sessionKey: string | null;
  history: FastclawHistoryTurn[];
};

function readStored(): StoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (parsed.version !== 1) return null;
    return {
      version: 1,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      sessionKey: typeof parsed.sessionKey === "string" ? parsed.sessionKey : null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return null;
  }
}

function writeStored(state: StoredState | null): void {
  if (typeof window === "undefined") return;
  try {
    if (state === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // quota / private mode — 忽略
  }
}

export function useFastClawResearch(): UseFastClawResearchReturn {
  const { phase, items, error, setItems, setPhase, setError, historyRef, start, reset } =
    useFastclawStream();

  const [restored, setRestored] = useState(false);
  const sessionKeyRef = useRef<string | null>(null);
  const didRestoreRef = useRef(false);

  // ---------- 恢复：挂载时从 localStorage 拉一次 ----------
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;

    const stored = readStored();
    if (stored) {
      setItems(stored.items);
      sessionKeyRef.current = stored.sessionKey;
      historyRef.current = stored.history;
      // 刷新前可能正在 streaming——恢复时降级成 completed，
      // 防止 UI 假装还在请求但实际没有 fetch。
      setPhase(stored.items.length > 0 ? "completed" : "idle");
    }
    setError(null);
    setRestored(true);
    // set* / historyRef 都是稳定引用，只需挂载时跑一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 持久化：items / phase 变化时回写 ----------
  useEffect(() => {
    if (!restored) return;

    if (items.length === 0) {
      writeStored(null);
      return;
    }

    writeStored({
      version: 1,
      items,
      sessionKey: sessionKeyRef.current,
      history: historyRef.current,
    });
    // phase 也作为依赖：streaming 完成时 historyRef 被 push 但 items 不变，
    // 借 phase 切换那一帧把最终 history 写回去。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, phase, restored]);

  const resetAll = useCallback(() => {
    reset();
    sessionKeyRef.current = null;
    writeStored(null);
  }, [reset]);

  const send = useCallback(
    (message: string, options?: { systemPrompt?: string }) => {
      const url = `${getApiBaseUrl()}/api/fastclaw/chat/stream`;
      // 首次发消息时派生一个稳定 sessionKey，让后续几轮落在同一个 FastClaw
      // 会话窗口里；reset() 才会清掉。
      if (!sessionKeyRef.current) {
        sessionKeyRef.current = `wcp-research-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      const body: Record<string, unknown> = {
        message,
        history: historyRef.current,
        stream: true,
        sessionKey: sessionKeyRef.current,
        // 锁死到 researcher agent。
        agentRole: "researcher",
      };
      if (options?.systemPrompt) body.systemPrompt = options.systemPrompt;
      void start(url, body, { userMsg: message });
    },
    [historyRef, start],
  );

  return { phase, items, error, restored, historyRef, send, reset: resetAll };
}
