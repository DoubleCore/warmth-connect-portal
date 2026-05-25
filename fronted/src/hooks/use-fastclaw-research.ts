import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFastClawSession,
  getFastClawSessionHistory,
  openFastClawRunStream,
  sendFastClawMessage,
} from "@/api/fastclaw";
import { ApiError } from "@/lib/api-client";
import type {
  CommandRuntimePhase,
  CommandStreamEvent,
  CommandStreamEventType,
} from "@/types/command";
import type { FastClawHistoryRunDto, FastClawRunStatus } from "@/types/fastclaw";

export type FastClawResearchTranscriptItem =
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

export type FastClawResearchConfirmation = {
  confirmationId: string;
  message: string;
  payload: unknown;
  transcriptId: string;
};

export type UseFastClawResearchReturn = {
  phase: CommandRuntimePhase;
  transcript: FastClawResearchTranscriptItem[];
  currentCommandId: string | null;
  pendingConfirmation: FastClawResearchConfirmation | null;
  error: { code?: string; message: string } | null;
  run: (message: string) => Promise<void>;
  respondConfirmation: (action?: "confirm" | "cancel") => Promise<void>;
  reset: () => void;
  newSession: () => void;
};

const STORAGE_KEY = "hermes.fastclaw-research.sessionId.v1";
const TERMINAL_STATUSES: ReadonlyArray<FastClawRunStatus> = ["completed", "failed", "cancelled"];

function readStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSessionId(sessionId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionId) window.localStorage.setItem(STORAGE_KEY, sessionId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage can be unavailable in privacy modes.
  }
}

function isTerminal(status: FastClawRunStatus | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.includes(status);
}

function phaseFromStatus(status: FastClawRunStatus | undefined): CommandRuntimePhase {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "idle";
  }
}

function makeTranscriptId(runId: string, type: string, seq: number): string {
  return `${runId}:${type}:${seq}`;
}

function compactRunEvents(
  runId: string,
  events: CommandStreamEvent[],
  seqStart: number,
  createdAt: number,
): { items: Extract<FastClawResearchTranscriptItem, { kind: "event" }>[]; seq: number } {
  const items: Extract<FastClawResearchTranscriptItem, { kind: "event" }>[] = [];
  let seq = seqStart;
  let agentBuffer = "";

  const flushAgent = () => {
    if (!agentBuffer) return;
    items.push({
      kind: "event",
      id: makeTranscriptId(runId, "agent_message", seq++),
      event: { type: "agent_message", message: agentBuffer },
      createdAt,
    });
    agentBuffer = "";
  };

  for (const event of events) {
    if (event.type === "agent_message") {
      if (!event.message.trim()) continue;
      agentBuffer += event.message;
      continue;
    }
    if (isStatusOnlyFinal(event)) continue;
    flushAgent();
    items.push({
      kind: "event",
      id: makeTranscriptId(runId, event.type, seq++),
      event,
      createdAt,
    });
  }
  flushAgent();

  return { items, seq };
}

function isStatusOnlyFinal(event: CommandStreamEvent): boolean {
  if (event.type !== "final" || event.message) return false;
  const result = event.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const entries = Object.entries(result as Record<string, unknown>);
  return entries.length === 1 && entries[0]?.[0] === "status";
}

function runsToTranscript(runs: FastClawHistoryRunDto[]): {
  items: FastClawResearchTranscriptItem[];
  seq: number;
} {
  const items: FastClawResearchTranscriptItem[] = [];
  let seq = 0;

  for (const run of runs) {
    const createdAt = Date.parse(run.createdAt) || Date.now();
    items.push({
      kind: "user",
      id: `${run.runId}:user`,
      message: run.userMessage,
      createdAt,
    });
    const compacted = compactRunEvents(run.runId, run.events, seq, createdAt);
    seq = compacted.seq;
    items.push(...compacted.items);
  }

  return { items, seq };
}

export function useFastClawResearch(): UseFastClawResearchReturn {
  const [phase, setPhase] = useState<CommandRuntimePhase>("idle");
  const [transcript, setTranscript] = useState<FastClawResearchTranscriptItem[]>([]);
  const [currentCommandId, setCurrentCommandId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<FastClawResearchConfirmation | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seqRef = useRef(0);
  const activeAgentEventIdRef = useRef<string | null>(null);
  const activeAgentContentRef = useRef("");

  const closeStream = useCallback(() => {
    const es = eventSourceRef.current;
    if (!es) return;
    eventSourceRef.current = null;
    try {
      es.close();
    } catch {
      // EventSource close is idempotent.
    }
    activeAgentEventIdRef.current = null;
    activeAgentContentRef.current = "";
  }, []);

  const appendEvent = useCallback((runId: string, event: CommandStreamEvent): string | null => {
    if (event.type === "agent_message") {
      if (!event.message.trim()) return null;
      activeAgentContentRef.current += event.message;
      if (activeAgentEventIdRef.current) {
        const targetId = activeAgentEventIdRef.current;
        setTranscript((prev) =>
          prev.map((item) =>
            item.kind === "event" && item.id === targetId
              ? {
                  ...item,
                  event: {
                    type: "agent_message",
                    message: activeAgentContentRef.current,
                  },
                }
              : item,
          ),
        );
        return targetId;
      }
      const id = makeTranscriptId(runId, event.type, seqRef.current++);
      activeAgentEventIdRef.current = id;
      setTranscript((prev) => [
        ...prev,
        {
          kind: "event",
          id,
          event: { type: "agent_message", message: activeAgentContentRef.current },
          createdAt: Date.now(),
        },
      ]);
      return id;
    }

    if (isStatusOnlyFinal(event)) return null;

    activeAgentEventIdRef.current = null;
    activeAgentContentRef.current = "";
    const id = makeTranscriptId(runId, event.type, seqRef.current++);
    setTranscript((prev) => [...prev, { kind: "event", id, event, createdAt: Date.now() }]);
    return id;
  }, []);

  const attachHandlers = useCallback(
    (es: EventSource, runId: string) => {
      const closeOnTerminal = () => closeStream();
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

          const transcriptId = appendEvent(runId, parsed);

          if (parsed.type === "need_confirmation") {
            setPendingConfirmation({
              confirmationId: parsed.confirmationId,
              message: parsed.message,
              payload: parsed.payload,
              transcriptId: transcriptId ?? `${runId}:confirmation`,
            });
            setPhase("awaiting_confirmation");
            return;
          }

          if (parsed.type === "final") {
            setPendingConfirmation(null);
            setPhase("completed");
            closeOnTerminal();
            return;
          }

          if (parsed.type === "error") {
            setPendingConfirmation(null);
            setError({
              message: parsed.message,
              ...(parsed.code !== undefined ? { code: parsed.code } : {}),
            });
            setPhase("failed");
            closeOnTerminal();
            return;
          }

          setPhase((current) => (current === "connecting" ? "streaming" : current));
        });
      }

      es.addEventListener("end", closeOnTerminal);
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) return;
        setError({
          code: "FASTCLAW_STREAM_CONNECTION_ERROR",
          message: "FastClaw 会话流连接中断，后台任务仍会继续，可刷新后恢复。",
        });
        setPhase((current) => (current === "completed" ? current : "failed"));
        setPendingConfirmation(null);
        closeStream();
      };
    },
    [appendEvent, closeStream],
  );

  const openRunStream = useCallback(
    (runId: string) => {
      closeStream();
      activeAgentEventIdRef.current = null;
      activeAgentContentRef.current = "";
      const es = openFastClawRunStream(runId);
      eventSourceRef.current = es;
      attachHandlers(es, runId);
    },
    [attachHandlers, closeStream],
  );

  useEffect(() => {
    return () => closeStream();
  }, [closeStream]);

  useEffect(() => {
    const stored = readStoredSessionId();
    if (!stored) return;

    let cancelled = false;
    sessionIdRef.current = stored;

    (async () => {
      try {
        const history = await getFastClawSessionHistory(stored);
        if (cancelled) return;

        const last = history.runs[history.runs.length - 1];
        const lastIsActive = last !== undefined && !isTerminal(last.status);
        const visibleRuns = lastIsActive ? history.runs.slice(0, -1) : history.runs;
        const { items, seq } = runsToTranscript(visibleRuns);
        seqRef.current = seq;
        setTranscript(items);
        setCurrentCommandId(last?.runId ?? null);
        setError(null);
        setPendingConfirmation(null);

        if (lastIsActive && last) {
          setTranscript((prev) => [
            ...prev,
            {
              kind: "user",
              id: `${last.runId}:user`,
              message: last.userMessage,
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
          writeStoredSessionId(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openRunStream]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const session = await createFastClawSession({
      entry: "research",
      agentRole: "search",
    });
    sessionIdRef.current = session.sessionId;
    writeStoredSessionId(session.sessionId);
    return session.sessionId;
  }, []);

  const reset = useCallback(() => {
    closeStream();
    setPhase("idle");
    setTranscript([]);
    setCurrentCommandId(null);
    setPendingConfirmation(null);
    setError(null);
    seqRef.current = 0;
  }, [closeStream]);

  const newSession = useCallback(() => {
    reset();
    sessionIdRef.current = null;
    writeStoredSessionId(null);
  }, [reset]);

  const respondConfirmation = useCallback(async () => {
    // FastClaw research does not currently use confirmation cards.
  }, []);

  const run = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      closeStream();
      setError(null);
      setPendingConfirmation(null);
      setPhase("connecting");

      try {
        const sessionId = await ensureSession();
        const response = await sendFastClawMessage(sessionId, {
          message: trimmed,
          agentRole: "search",
        });

        setCurrentCommandId(response.runId);
        setTranscript((prev) => [
          ...prev,
          {
            kind: "user",
            id: `${response.runId}:user`,
            message: trimmed,
            createdAt: Date.now(),
          },
        ]);
        setPhase("streaming");
        openRunStream(response.runId);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "无法连接 FastClaw 论文搜索助手。";
        const code = err instanceof ApiError ? err.code : "FASTCLAW_RESEARCH_DISPATCH_FAILED";
        setError({ code, message });
        setPhase("failed");
      }
    },
    [closeStream, ensureSession, openRunStream],
  );

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
