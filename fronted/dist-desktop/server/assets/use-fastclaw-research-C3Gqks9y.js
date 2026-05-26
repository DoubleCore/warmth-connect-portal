import { useState, useRef, useCallback, useEffect } from "react";
import { g as getFastClawSessionHistory, o as openFastClawRunStream, c as createFastClawSession, s as sendFastClawMessage } from "./fastclaw-BIiEmd5C.js";
import { A as ApiError } from "./router-DbOKu9BE.js";
const DEFAULT_STORAGE_KEY = "hermes.fastclaw-research.sessionId.v1";
const DEFAULT_ENTRY = "research";
const DEFAULT_AGENT_ROLE = "search";
const DEFAULT_FALLBACK_ERROR = "无法连接 FastClaw 论文搜索助手。";
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];
function readStoredSessionId(storageKey) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
function writeStoredSessionId(storageKey, sessionId) {
  if (typeof window === "undefined") return;
  try {
    if (sessionId) window.localStorage.setItem(storageKey, sessionId);
    else window.localStorage.removeItem(storageKey);
  } catch {
  }
}
function isTerminal(status) {
  return status !== void 0 && TERMINAL_STATUSES.includes(status);
}
function phaseFromStatus(status) {
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
function makeTranscriptId(runId, type, seq) {
  return `${runId}:${type}:${seq}`;
}
function compactRunEvents(runId, events, seqStart, createdAt) {
  const items = [];
  let seq = seqStart;
  let agentBuffer = "";
  const flushAgent = () => {
    if (!agentBuffer) return;
    items.push({
      kind: "event",
      id: makeTranscriptId(runId, "agent_message", seq++),
      event: { type: "agent_message", message: agentBuffer },
      createdAt
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
      createdAt
    });
  }
  flushAgent();
  return { items, seq };
}
function isStatusOnlyFinal(event) {
  if (event.type !== "final" || event.message) return false;
  const result = event.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const entries = Object.entries(result);
  return entries.length === 1 && entries[0]?.[0] === "status";
}
function runsToTranscript(runs) {
  const items = [];
  let seq = 0;
  for (const run of runs) {
    const createdAt = Date.parse(run.createdAt) || Date.now();
    items.push({
      kind: "user",
      id: `${run.runId}:user`,
      message: run.userMessage,
      createdAt
    });
    const compacted = compactRunEvents(run.runId, run.events, seq, createdAt);
    seq = compacted.seq;
    items.push(...compacted.items);
  }
  return { items, seq };
}
function useFastClawResearch(opts = {}) {
  const storageKey = opts.storageKey ?? DEFAULT_STORAGE_KEY;
  const entry = opts.entry ?? DEFAULT_ENTRY;
  const agentRole = opts.agentRole ?? DEFAULT_AGENT_ROLE;
  const fallbackErrorMessage = opts.fallbackErrorMessage ?? DEFAULT_FALLBACK_ERROR;
  const [phase, setPhase] = useState("idle");
  const [transcript, setTranscript] = useState([]);
  const [currentCommandId, setCurrentCommandId] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [error, setError] = useState(null);
  const sessionIdRef = useRef(null);
  const eventSourceRef = useRef(null);
  const seqRef = useRef(0);
  const activeAgentEventIdRef = useRef(null);
  const activeAgentContentRef = useRef("");
  const closeStream = useCallback(() => {
    const es = eventSourceRef.current;
    if (!es) return;
    eventSourceRef.current = null;
    try {
      es.close();
    } catch {
    }
    activeAgentEventIdRef.current = null;
    activeAgentContentRef.current = "";
  }, []);
  const appendEvent = useCallback((runId, event) => {
    if (event.type === "agent_message") {
      if (!event.message.trim()) return null;
      activeAgentContentRef.current += event.message;
      if (activeAgentEventIdRef.current) {
        const targetId = activeAgentEventIdRef.current;
        setTranscript(
          (prev) => prev.map(
            (item) => item.kind === "event" && item.id === targetId ? {
              ...item,
              event: {
                type: "agent_message",
                message: activeAgentContentRef.current
              }
            } : item
          )
        );
        return targetId;
      }
      const id2 = makeTranscriptId(runId, event.type, seqRef.current++);
      activeAgentEventIdRef.current = id2;
      setTranscript((prev) => [
        ...prev,
        {
          kind: "event",
          id: id2,
          event: { type: "agent_message", message: activeAgentContentRef.current },
          createdAt: Date.now()
        }
      ]);
      return id2;
    }
    if (isStatusOnlyFinal(event)) return null;
    activeAgentEventIdRef.current = null;
    activeAgentContentRef.current = "";
    const id = makeTranscriptId(runId, event.type, seqRef.current++);
    setTranscript((prev) => [...prev, { kind: "event", id, event, createdAt: Date.now() }]);
    return id;
  }, []);
  const refreshSessionHistory = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      const history = await getFastClawSessionHistory(sessionId);
      const { items, seq } = runsToTranscript(history.runs);
      const last = history.runs[history.runs.length - 1];
      seqRef.current = seq;
      setTranscript(items);
      setCurrentCommandId(last?.runId ?? null);
      setPendingConfirmation(null);
      setError(null);
      setPhase(
        last === void 0 ? "idle" : isTerminal(last.status) ? phaseFromStatus(last.status) : "streaming"
      );
    } catch {
    }
  }, []);
  const refreshSessionHistorySoon = useCallback(
    (delayMs = 250) => {
      window.setTimeout(() => {
        void refreshSessionHistory();
      }, delayMs);
    },
    [refreshSessionHistory]
  );
  const attachHandlers = useCallback(
    (es, runId) => {
      const closeOnTerminal = () => {
        closeStream();
        refreshSessionHistorySoon();
      };
      const eventTypes = [
        "thinking",
        "agent_message",
        "tool_start",
        "tool_result",
        "need_confirmation",
        "final",
        "error"
      ];
      for (const type of eventTypes) {
        es.addEventListener(type, (raw) => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw.data);
          } catch {
            return;
          }
          const transcriptId = appendEvent(runId, parsed);
          if (parsed.type === "need_confirmation") {
            setPendingConfirmation({
              confirmationId: parsed.confirmationId,
              message: parsed.message,
              payload: parsed.payload,
              transcriptId: transcriptId ?? `${runId}:confirmation`
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
              ...parsed.code !== void 0 ? { code: parsed.code } : {}
            });
            setPhase("failed");
            closeOnTerminal();
            return;
          }
          setPhase((current) => current === "connecting" ? "streaming" : current);
        });
      }
      es.addEventListener("end", closeOnTerminal);
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) return;
        setError({
          code: "FASTCLAW_STREAM_CONNECTION_ERROR",
          message: "FastClaw 会话流连接中断，后台任务仍会继续，可刷新后恢复。"
        });
        setPhase((current) => current === "completed" ? current : "failed");
        setPendingConfirmation(null);
        closeStream();
        refreshSessionHistorySoon(1500);
      };
    },
    [appendEvent, closeStream, refreshSessionHistorySoon]
  );
  const openRunStream = useCallback(
    (runId) => {
      closeStream();
      activeAgentEventIdRef.current = null;
      activeAgentContentRef.current = "";
      const es = openFastClawRunStream(runId);
      eventSourceRef.current = es;
      attachHandlers(es, runId);
    },
    [attachHandlers, closeStream]
  );
  useEffect(() => {
    return () => closeStream();
  }, [closeStream]);
  useEffect(() => {
    const stored = readStoredSessionId(storageKey);
    if (!stored) return;
    let cancelled = false;
    sessionIdRef.current = stored;
    (async () => {
      try {
        const history = await getFastClawSessionHistory(stored);
        if (cancelled) return;
        const last = history.runs[history.runs.length - 1];
        const lastIsActive = last !== void 0 && !isTerminal(last.status);
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
              createdAt: Date.parse(last.createdAt) || Date.now()
            }
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
          writeStoredSessionId(storageKey, null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openRunStream, storageKey]);
  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const session = await createFastClawSession({
      entry,
      agentRole
    });
    sessionIdRef.current = session.sessionId;
    writeStoredSessionId(storageKey, session.sessionId);
    return session.sessionId;
  }, [agentRole, entry, storageKey]);
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
    writeStoredSessionId(storageKey, null);
  }, [reset, storageKey]);
  const respondConfirmation = useCallback(async () => {
  }, []);
  const run = useCallback(
    async (message) => {
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
          agentRole
        });
        setCurrentCommandId(response.runId);
        setTranscript((prev) => [
          ...prev,
          {
            kind: "user",
            id: `${response.runId}:user`,
            message: trimmed,
            createdAt: Date.now()
          }
        ]);
        setPhase("streaming");
        openRunStream(response.runId);
      } catch (err) {
        const message2 = err instanceof ApiError ? err.message : err instanceof Error ? err.message : fallbackErrorMessage;
        const code = err instanceof ApiError ? err.code : "FASTCLAW_RESEARCH_DISPATCH_FAILED";
        setError({ code, message: message2 });
        setPhase("failed");
      }
    },
    [agentRole, closeStream, ensureSession, fallbackErrorMessage, openRunStream]
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
    newSession
  };
}
export {
  useFastClawResearch as u
};
