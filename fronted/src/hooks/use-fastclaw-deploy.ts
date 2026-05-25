import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFastClawSession,
  getFastClawSessionHistory,
  openFastClawRunStream,
  sendFastClawMessage,
  startFastClawDeploy,
} from "@/api/fastclaw";
import { ApiError } from "@/lib/api-client";
import type { CommandStreamEvent, CommandStreamEventType } from "@/types/command";
import type { FastClawHistoryRunDto, FastClawRunStatus } from "@/types/fastclaw";

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
  restored: boolean;
  send: (message: string, options?: { systemPrompt?: string }) => void;
  startDeploy: (
    params: {
      reproductionId: string;
      paperId: string;
      deviceId: string;
    },
    preview?: string,
  ) => void;
  reset: () => void;
};

let msgSeq = 0;
function nextId(prefix = "fc"): string {
  return `${prefix}-${Date.now()}-${++msgSeq}`;
}

const STORAGE_PREFIX = "hermes.fastclaw-deploy.sessionId.v1.";
const TERMINAL_STATUSES: ReadonlyArray<FastClawRunStatus> = ["completed", "failed", "cancelled"];

function storageKey(persistKey: string): string {
  return `${STORAGE_PREFIX}${persistKey}`;
}

function readStoredSessionId(persistKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(persistKey));
  } catch {
    return null;
  }
}

function writeStoredSessionId(persistKey: string, sessionId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionId) window.localStorage.setItem(storageKey(persistKey), sessionId);
    else window.localStorage.removeItem(storageKey(persistKey));
  } catch {
    // localStorage can be unavailable in privacy modes.
  }
}

function isTerminal(status: FastClawRunStatus | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.includes(status);
}

function phaseFromStatus(status: FastClawRunStatus | undefined): DeployPhase {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "error";
    case "cancelled":
      return "completed";
    default:
      return "idle";
  }
}

function assistantTextFromEvents(events: CommandStreamEvent[]): string {
  let content = "";
  for (const event of events) {
    if (event.type === "agent_message" && event.message.trim()) content += event.message;
    if (event.type === "error") content += `\n\n错误：${event.message}`;
  }
  return content.trim();
}

function runsToMessages(runs: FastClawHistoryRunDto[]): DeployMessage[] {
  const messages: DeployMessage[] = [];
  for (const run of runs) {
    const createdAt = Date.parse(run.createdAt) || Date.now();
    messages.push({
      id: `${run.runId}:user`,
      role: "user",
      content: run.userMessage,
      createdAt,
    });

    const assistant = assistantTextFromEvents(run.events);
    if (assistant) {
      messages.push({
        id: `${run.runId}:assistant`,
        role: "assistant",
        content: assistant,
        createdAt,
      });
    }
  }
  return messages;
}

export function useFastClawDeploy(opts?: { persistKey?: string }): UseFastClawDeployReturn {
  const persistKey = opts?.persistKey;

  const [phase, setPhase] = useState<DeployPhase>("idle");
  const [messages, setMessages] = useState<DeployMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<boolean>(!persistKey);

  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const restoredKeyRef = useRef<string | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const activeAssistantContentRef = useRef("");

  const closeStream = useCallback(() => {
    const es = eventSourceRef.current;
    if (!es) return;
    eventSourceRef.current = null;
    try {
      es.close();
    } catch {
      // EventSource close is idempotent.
    }
    activeAssistantIdRef.current = null;
    activeAssistantContentRef.current = "";
  }, []);

  useEffect(() => {
    return () => closeStream();
  }, [closeStream]);

  const appendAssistantDelta = useCallback((runId: string, delta: string) => {
    if (!delta.trim()) return;
    activeAssistantContentRef.current += delta;

    if (activeAssistantIdRef.current) {
      const targetId = activeAssistantIdRef.current;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === targetId
            ? { ...message, content: activeAssistantContentRef.current }
            : message,
        ),
      );
      return;
    }

    const id = `${runId}:assistant:${nextId("live")}`;
    activeAssistantIdRef.current = id;
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: "assistant",
        content: activeAssistantContentRef.current,
        createdAt: Date.now(),
      },
    ]);
  }, []);

  const attachHandlers = useCallback(
    (es: EventSource, runId: string) => {
      const eventTypes: CommandStreamEventType[] = [
        "thinking",
        "agent_message",
        "tool_start",
        "tool_result",
        "need_confirmation",
        "final",
        "error",
      ];

      for (const type of eventTypes) {
        es.addEventListener(type, (raw: MessageEvent<string>) => {
          let parsed: CommandStreamEvent | null = null;
          try {
            parsed = JSON.parse(raw.data) as CommandStreamEvent;
          } catch {
            return;
          }

          if (parsed.type === "agent_message") {
            appendAssistantDelta(runId, parsed.message);
            return;
          }

          activeAssistantIdRef.current = null;
          activeAssistantContentRef.current = "";

          if (parsed.type === "error") {
            setError(parsed.message);
            setPhase("error");
            closeStream();
            return;
          }

          if (parsed.type === "final") {
            setPhase("completed");
            closeStream();
            return;
          }
        });
      }

      es.addEventListener("end", () => closeStream());
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) return;
        setError("FastClaw 部署流连接中断，后台任务仍会继续，可刷新后恢复。");
        setPhase("error");
        closeStream();
      };
    },
    [appendAssistantDelta, closeStream],
  );

  const openRunStream = useCallback(
    (runId: string) => {
      closeStream();
      activeAssistantIdRef.current = null;
      activeAssistantContentRef.current = "";
      const es = openFastClawRunStream(runId);
      eventSourceRef.current = es;
      attachHandlers(es, runId);
    },
    [attachHandlers, closeStream],
  );

  useEffect(() => {
    if (!persistKey) {
      restoredKeyRef.current = null;
      sessionIdRef.current = null;
      setRestored(true);
      return;
    }
    if (restoredKeyRef.current === persistKey) return;

    closeStream();
    setRestored(false);
    setError(null);
    restoredKeyRef.current = persistKey;

    const stored = readStoredSessionId(persistKey);
    if (!stored) {
      sessionIdRef.current = null;
      setMessages([]);
      setPhase("idle");
      setRestored(true);
      return;
    }

    let cancelled = false;
    sessionIdRef.current = stored;

    (async () => {
      try {
        const history = await getFastClawSessionHistory(stored);
        if (cancelled) return;

        const last = history.runs[history.runs.length - 1];
        const lastIsActive = last !== undefined && !isTerminal(last.status);
        const visibleRuns = lastIsActive ? history.runs.slice(0, -1) : history.runs;
        setMessages(runsToMessages(visibleRuns));

        if (lastIsActive && last) {
          setMessages((prev) => [
            ...prev,
            {
              id: `${last.runId}:user`,
              role: "user",
              content: last.userMessage,
              createdAt: Date.parse(last.createdAt) || Date.now(),
            },
          ]);
          setPhase("streaming");
          openRunStream(last.runId);
        } else {
          setPhase(phaseFromStatus(last?.status));
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          sessionIdRef.current = null;
          writeStoredSessionId(persistKey, null);
        }
        setMessages([]);
        setPhase("idle");
      } finally {
        if (!cancelled) setRestored(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [closeStream, openRunStream, persistKey]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const session = await createFastClawSession({
      entry: "deploy",
      agentRole: "deploy",
    });
    sessionIdRef.current = session.sessionId;
    if (persistKey) writeStoredSessionId(persistKey, session.sessionId);
    return session.sessionId;
  }, [persistKey]);

  const startDeploy = useCallback(
    (params: { reproductionId: string; paperId: string; deviceId: string }, preview?: string) => {
      setPhase("streaming");
      setError(null);
      const systemId = nextId("system");
      const previewId = nextId("preview");
      setMessages([
        {
          id: systemId,
          role: "system",
          content: "部署任务已启动，正在连接 FastClaw 论文部署助手...",
          createdAt: Date.now(),
        },
        ...(preview
          ? [
              {
                id: previewId,
                role: "user" as const,
                content: preview,
                createdAt: Date.now(),
              },
            ]
          : []),
      ]);

      void (async () => {
        try {
          const sessionId = await ensureSession();
          const response = await startFastClawDeploy(sessionId, params);
          if (!preview && response.message) {
            setMessages((prev) => [
              ...prev,
              {
                id: `${response.runId}:user`,
                role: "user",
                content: response.message ?? "开始部署任务",
                createdAt: Date.now(),
              },
            ]);
          }
          openRunStream(response.runId);
        } catch (err) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "无法启动 FastClaw 部署任务。";
          setError(message);
          setPhase("error");
        }
      })();
    },
    [ensureSession, openRunStream],
  );

  const send = useCallback(
    (message: string, options?: { systemPrompt?: string }) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      setPhase("streaming");
      setError(null);

      void (async () => {
        try {
          const sessionId = await ensureSession();
          const response = await sendFastClawMessage(sessionId, {
            message: trimmed,
            systemPrompt: options?.systemPrompt,
            agentRole: "deploy",
          });
          setMessages((prev) => [
            ...prev,
            {
              id: `${response.runId}:user`,
              role: "user",
              content: trimmed,
              createdAt: Date.now(),
            },
          ]);
          openRunStream(response.runId);
        } catch (err) {
          const msg =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "无法发送 FastClaw 部署追问。";
          setError(msg);
          setPhase("error");
        }
      })();
    },
    [ensureSession, openRunStream],
  );

  const reset = useCallback(() => {
    closeStream();
    setPhase("idle");
    setMessages([]);
    setError(null);
    sessionIdRef.current = null;
    if (persistKey) writeStoredSessionId(persistKey, null);
  }, [closeStream, persistKey]);

  return { phase, messages, error, restored, send, startDeploy, reset };
}
