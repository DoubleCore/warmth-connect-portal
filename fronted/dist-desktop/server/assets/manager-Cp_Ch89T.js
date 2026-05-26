import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, AlertTriangle, TerminalSquare, History, Send, Cpu, Gauge, ActivitySquare, Clock, User } from "lucide-react";
import { S as Shell, c as cn } from "./Shell-D8Pakp7k.js";
import { g as getFastClawSessionHistory, o as openFastClawRunStream, c as createFastClawSession, a as startFastClawDeploy, s as sendFastClawMessage, C as ChatMarkdown } from "./fastclaw-BIiEmd5C.js";
import { A as ApiError, f as apiFetch, u as useI18n, j as Route, b as listReproductionRecords } from "./router-DbOKu9BE.js";
import { l as listDevices } from "./devices-BDVJaLc_.js";
import "clsx";
import "tailwind-merge";
import "react-markdown";
import "remark-gfm";
import "zod";
let msgSeq = 0;
function nextId(prefix = "fc") {
  return `${prefix}-${Date.now()}-${++msgSeq}`;
}
const STORAGE_PREFIX = "hermes.fastclaw-deploy.sessionId.v1.";
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];
function storageKey(persistKey) {
  return `${STORAGE_PREFIX}${persistKey}`;
}
function readStoredSessionId(persistKey) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(persistKey));
  } catch {
    return null;
  }
}
function writeStoredSessionId(persistKey, sessionId) {
  if (typeof window === "undefined") return;
  try {
    if (sessionId) window.localStorage.setItem(storageKey(persistKey), sessionId);
    else window.localStorage.removeItem(storageKey(persistKey));
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
      return "error";
    case "cancelled":
      return "completed";
    default:
      return "idle";
  }
}
function assistantTextFromEvents(events) {
  let content = "";
  for (const event of events) {
    if (event.type === "agent_message" && event.message.trim()) content += event.message;
    if (event.type === "error") content += `

错误：${event.message}`;
  }
  return content.trim();
}
function runsToMessages(runs) {
  const messages = [];
  for (const run of runs) {
    const createdAt = Date.parse(run.createdAt) || Date.now();
    messages.push({
      id: `${run.runId}:user`,
      role: "user",
      content: run.userMessage,
      createdAt
    });
    const assistant = assistantTextFromEvents(run.events);
    if (assistant) {
      messages.push({
        id: `${run.runId}:assistant`,
        role: "assistant",
        content: assistant,
        createdAt
      });
    }
  }
  return messages;
}
function useFastClawDeploy(opts) {
  const persistKey = opts?.persistKey;
  const [phase, setPhase] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [restored, setRestored] = useState(!persistKey);
  const sessionIdRef = useRef(null);
  const eventSourceRef = useRef(null);
  const restoredKeyRef = useRef(null);
  const activeAssistantIdRef = useRef(null);
  const activeAssistantContentRef = useRef("");
  const closeStream = useCallback(() => {
    const es = eventSourceRef.current;
    if (!es) return;
    eventSourceRef.current = null;
    try {
      es.close();
    } catch {
    }
    activeAssistantIdRef.current = null;
    activeAssistantContentRef.current = "";
  }, []);
  useEffect(() => {
    return () => closeStream();
  }, [closeStream]);
  const appendAssistantDelta = useCallback((runId, delta) => {
    if (!delta.trim()) return;
    activeAssistantContentRef.current += delta;
    if (activeAssistantIdRef.current) {
      const targetId = activeAssistantIdRef.current;
      setMessages(
        (prev) => prev.map(
          (message) => message.id === targetId ? { ...message, content: activeAssistantContentRef.current } : message
        )
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
        createdAt: Date.now()
      }
    ]);
  }, []);
  const refreshSessionHistory = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      const history = await getFastClawSessionHistory(sessionId);
      const last = history.runs[history.runs.length - 1];
      setMessages(runsToMessages(history.runs));
      setError(null);
      setPhase(
        last === void 0 ? "idle" : isTerminal(last.status) ? phaseFromStatus(last.status) : "streaming"
      );
      setRestored(true);
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
            refreshSessionHistorySoon();
            return;
          }
          if (parsed.type === "final") {
            setPhase("completed");
            closeStream();
            refreshSessionHistorySoon();
            return;
          }
        });
      }
      es.addEventListener("end", () => {
        closeStream();
        refreshSessionHistorySoon();
      });
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) return;
        setError("FastClaw 部署流连接中断，后台任务仍会继续，可刷新后恢复。");
        setPhase("error");
        closeStream();
        refreshSessionHistorySoon(1500);
      };
    },
    [appendAssistantDelta, closeStream, refreshSessionHistorySoon]
  );
  const openRunStream = useCallback(
    (runId) => {
      closeStream();
      activeAssistantIdRef.current = null;
      activeAssistantContentRef.current = "";
      const es = openFastClawRunStream(runId);
      eventSourceRef.current = es;
      attachHandlers(es, runId);
    },
    [attachHandlers, closeStream]
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
        const lastIsActive = last !== void 0 && !isTerminal(last.status);
        const visibleRuns = lastIsActive ? history.runs.slice(0, -1) : history.runs;
        setMessages(runsToMessages(visibleRuns));
        if (lastIsActive && last) {
          setMessages((prev) => [
            ...prev,
            {
              id: `${last.runId}:user`,
              role: "user",
              content: last.userMessage,
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
  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const session = await createFastClawSession({
      entry: "deploy",
      agentRole: "deploy"
    });
    sessionIdRef.current = session.sessionId;
    if (persistKey) writeStoredSessionId(persistKey, session.sessionId);
    return session.sessionId;
  }, [persistKey]);
  const startDeploy = useCallback(
    (params, preview) => {
      setPhase("streaming");
      setError(null);
      const systemId = nextId("system");
      const previewId = nextId("preview");
      setMessages([
        {
          id: systemId,
          role: "system",
          content: "部署任务已启动，正在连接 FastClaw 论文部署助手...",
          createdAt: Date.now()
        },
        ...preview ? [
          {
            id: previewId,
            role: "user",
            content: preview,
            createdAt: Date.now()
          }
        ] : []
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
                createdAt: Date.now()
              }
            ]);
          }
          openRunStream(response.runId);
        } catch (err) {
          const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "无法启动 FastClaw 部署任务。";
          setError(message);
          setPhase("error");
        }
      })();
    },
    [ensureSession, openRunStream]
  );
  const send = useCallback(
    (message, options) => {
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
            agentRole: "deploy"
          });
          setMessages((prev) => [
            ...prev,
            {
              id: `${response.runId}:user`,
              role: "user",
              content: trimmed,
              createdAt: Date.now()
            }
          ]);
          openRunStream(response.runId);
        } catch (err) {
          const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "无法发送 FastClaw 部署追问。";
          setError(msg);
          setPhase("error");
        }
      })();
    },
    [ensureSession, openRunStream]
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
async function getHostDetail(deviceId) {
  return apiFetch(
    `/api/host-tracking/hosts/${encodeURIComponent(deviceId)}`
  );
}
async function getHostMetricsHistory(deviceId, options) {
  return apiFetch(
    `/api/host-tracking/hosts/${encodeURIComponent(deviceId)}/metrics`,
    { query: { limit: options?.limit, since: options?.since } }
  );
}
function ManagerPage() {
  const {
    t
  } = useI18n();
  const {
    runId
  } = Route.useSearch();
  const recordsQuery = useQuery({
    queryKey: ["reproduction-records"],
    queryFn: listReproductionRecords
  });
  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices
  });
  const records = recordsQuery.data?.items ?? [];
  const active = records.find((r) => r.id === runId) ?? records.find((r) => r.status === "running") ?? records[0];
  if (recordsQuery.isLoading) {
    return /* @__PURE__ */ jsx(Shell, { active: "None", children: /* @__PURE__ */ jsx("div", { className: "grid h-[calc(100vh-69px)] place-items-center text-sm text-muted-foreground", children: /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }),
      t("manager.loading")
    ] }) }) });
  }
  if (!active) {
    return /* @__PURE__ */ jsx(Shell, { active: "None", children: /* @__PURE__ */ jsx(ManagerShell, { children: /* @__PURE__ */ jsx(EmptyState, {}) }) });
  }
  const totalNodes = Math.max(1, (devicesQuery.data?.items ?? []).length || 4);
  return /* @__PURE__ */ jsx(Shell, { active: "None", children: /* @__PURE__ */ jsx(ManagerShell, { header: /* @__PURE__ */ jsx(ManagerHeader, { active, runsList: records }), children: /* @__PURE__ */ jsxs("div", { className: "grid min-h-0 flex-1 gap-6 px-6 pb-6 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]", children: [
    /* @__PURE__ */ jsx(CommandInterfacePanel, { active, totalNodes }),
    /* @__PURE__ */ jsx(TelemetryPanel, { active, totalNodes })
  ] }) }) });
}
function ManagerShell({
  header,
  children
}) {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsxs("div", { className: "flex h-[calc(100vh-69px)] flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-4 border-b border-border px-6 py-3", children: [
      /* @__PURE__ */ jsxs(Link, { to: "/workspace", className: "inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground", children: [
        /* @__PURE__ */ jsx(ArrowLeft, { className: "h-3.5 w-3.5", "aria-hidden": true }),
        t("manager.backToDevices")
      ] }),
      header ? /* @__PURE__ */ jsx("div", { className: "flex-1", children: header }) : null
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex min-h-0 flex-1 flex-col", children })
  ] });
}
function ManagerHeader({
  active,
  runsList
}) {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxs("h1", { className: "text-lg font-semibold tracking-tight", children: [
        t("manager.titlePrefix"),
        ": ",
        active.paper.title
      ] }),
      /* @__PURE__ */ jsx(StatusBadge, { status: active.status })
    ] }),
    /* @__PURE__ */ jsx("select", { className: "rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40", defaultValue: active.id, onChange: (e) => {
      const next = e.target.value;
      const url = new URL(window.location.href);
      url.searchParams.set("runId", next);
      window.history.replaceState({}, "", url.toString());
      window.location.reload();
    }, "aria-label": t("manager.switchRun"), children: runsList.map((r) => /* @__PURE__ */ jsxs("option", { value: r.id, children: [
      r.paper.title,
      " · ",
      r.status
    ] }, r.id)) })
  ] });
}
function CommandInterfacePanel({
  active,
  totalNodes
}) {
  const {
    t
  } = useI18n();
  const [draft, setDraft] = useState("");
  const deploy = useFastClawDeploy({
    persistKey: active.id
  });
  const scrollRef = useRef(null);
  const firedKeyRef = useRef(null);
  useEffect(() => {
    if (!deploy.restored) return;
    if (!active || active.status !== "running") return;
    if (!active.device) return;
    if (deploy.messages.length > 0) {
      firedKeyRef.current = active.id;
      return;
    }
    if (deploy.phase === "streaming") return;
    if (firedKeyRef.current === active.id) return;
    firedKeyRef.current = active.id;
    deploy.startDeploy(
      {
        reproductionId: active.id,
        paperId: active.paper.id,
        deviceId: active.device.id
      },
      // 把"做什么"作为用户气泡显示出来，避免初始化指令隐式发出后用户盯着空白等。
      `请帮我把《${active.paper.title}》部署到设备「${active.device.name}」上，并按标准流程拉代码、装依赖、跑训练。`
    );
  }, [deploy.restored, deploy.messages.length, deploy.phase, active, deploy]);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [deploy.messages]);
  const handleSend = (e) => {
    e.preventDefault();
    const msg = draft.trim();
    if (!msg) return;
    setDraft("");
    deploy.send(msg);
  };
  return /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 flex-col rounded-2xl border border-border bg-card", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-border px-4 py-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm font-semibold", children: [
        /* @__PURE__ */ jsx(TerminalSquare, { className: "h-4 w-4 text-primary", "aria-hidden": true }),
        t("manager.panels.commandInterface"),
        deploy.phase === "streaming" && /* @__PURE__ */ jsxs("span", { className: "ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground", children: [
          /* @__PURE__ */ jsx(Loader2, { className: "h-3 w-3 animate-spin" }),
          t("manager.chat.streaming")
        ] })
      ] }),
      /* @__PURE__ */ jsxs("button", { type: "button", className: "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground", onClick: () => {
        firedKeyRef.current = null;
        deploy.reset();
      }, children: [
        /* @__PURE__ */ jsx(History, { className: "h-3.5 w-3.5", "aria-hidden": true }),
        "New"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { ref: scrollRef, className: "flex-1 space-y-4 overflow-y-auto px-4 py-5", children: [
      deploy.messages.length === 0 && deploy.phase === "idle" && /* @__PURE__ */ jsx("div", { className: "text-center text-sm text-muted-foreground py-12", children: t("manager.chat.waitingDeploy") }),
      deploy.messages.map((msg) => {
        if (msg.role === "system") {
          return /* @__PURE__ */ jsx("div", { className: "text-center text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground", children: msg.content }, msg.id);
        }
        if (msg.role === "user") {
          return /* @__PURE__ */ jsx(UserBubble, { children: msg.content }, msg.id);
        }
        if (!msg.content) {
          return /* @__PURE__ */ jsx(SystemBubble, { children: /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-2 text-sm text-muted-foreground", children: [
            /* @__PURE__ */ jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin", "aria-hidden": true }),
            "正在分析论文与目标主机环境，正在生成部署计划…"
          ] }) }, msg.id);
        }
        return /* @__PURE__ */ jsx(SystemBubble, { children: /* @__PURE__ */ jsx(ChatMarkdown, { children: msg.content }) }, msg.id);
      }),
      deploy.error && /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive", children: deploy.error })
    ] }),
    /* @__PURE__ */ jsxs("form", { onSubmit: handleSend, className: "border-t border-border px-4 py-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-full border border-border bg-background/40 px-4 py-2", children: [
        /* @__PURE__ */ jsx("input", { value: draft, onChange: (e) => setDraft(e.target.value), placeholder: t("manager.chat.inputPlaceholder"), className: "flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground", autoComplete: "off", disabled: deploy.phase === "streaming" }),
        /* @__PURE__ */ jsx("button", { type: "submit", "aria-label": t("manager.chat.send"), className: "grid h-8 w-8 place-items-center rounded-full text-primary-foreground disabled:opacity-40", style: {
          background: "var(--gradient-primary)"
        }, disabled: !draft.trim(), children: /* @__PURE__ */ jsx(Send, { className: "h-4 w-4", "aria-hidden": true }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-2 flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx(SlashChip, { onClick: () => deploy.send("查看当前训练状态"), children: "/status" }),
        /* @__PURE__ */ jsx(SlashChip, { onClick: () => deploy.send("查看 GPU 使用情况"), children: "/gpu" }),
        /* @__PURE__ */ jsx(SlashChip, { onClick: () => deploy.send("暂停训练"), children: "/pause" })
      ] })
    ] })
  ] });
}
function SystemBubble({
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
    /* @__PURE__ */ jsx("span", { className: "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground", children: /* @__PURE__ */ jsx(TerminalSquare, { className: "h-4 w-4", "aria-hidden": true }) }),
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: "System" }),
      /* @__PURE__ */ jsx("div", { className: "mt-1 rounded-xl border border-border bg-background/40 px-3 py-2 text-sm leading-relaxed", children })
    ] })
  ] });
}
function UserBubble({
  children
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-row-reverse items-start gap-3", children: [
    /* @__PURE__ */ jsx("span", { className: "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary", children: /* @__PURE__ */ jsx(User, { className: "h-4 w-4", "aria-hidden": true }) }),
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 max-w-[80%]", children: [
      /* @__PURE__ */ jsx("div", { className: "text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: "You" }),
      /* @__PURE__ */ jsx("div", { className: "mt-1 rounded-xl bg-primary/10 px-3 py-2 text-sm leading-relaxed", children })
    ] })
  ] });
}
function SlashChip({
  children,
  onClick
}) {
  return /* @__PURE__ */ jsx("button", { type: "button", onClick, className: "rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:bg-secondary/80 hover:text-foreground transition-colors", children });
}
function TelemetryPanel({
  active,
  totalNodes
}) {
  const {
    t
  } = useI18n();
  const deviceId = active.device?.id;
  const hostQuery = useQuery({
    queryKey: ["host-detail", deviceId],
    queryFn: () => deviceId ? getHostDetail(deviceId) : Promise.resolve(null),
    enabled: Boolean(deviceId),
    refetchInterval: 6e4
    // 每分钟刷新
  });
  const metrics = hostQuery.data?.latestMetrics;
  const gpu = metrics?.gpus?.[0];
  return /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 flex-col gap-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4 lg:grid-cols-4", children: [
      /* @__PURE__ */ jsx(StatCard, { icon: Cpu, label: "GPU 利用率", value: gpu ? `${gpu.utilizationPct}%` : metrics?.online === false ? "离线" : "—", hint: gpu?.name ?? "", bars: gpu ? gpuUtilBars(gpu.utilizationPct) : void 0 }),
      /* @__PURE__ */ jsx(StatCard, { icon: Gauge, label: "GPU 温度", value: gpu?.temperatureC != null ? `${gpu.temperatureC}°C` : "—", hint: gpu?.powerW != null ? `${gpu.powerW.toFixed(1)}W` : "" }),
      /* @__PURE__ */ jsx(StatCard, { icon: ActivitySquare, label: "显存", value: gpu ? `${gpu.memoryUsedMb}/${gpu.memoryTotalMb} MB` : "—", hint: gpu ? `${Math.round(gpu.memoryUsedMb / gpu.memoryTotalMb * 100)}%` : "", progress: gpu ? gpu.memoryUsedMb / gpu.memoryTotalMb : void 0 }),
      /* @__PURE__ */ jsx(StatCard, { icon: Clock, label: "CPU / 内存", value: metrics?.cpuLoad1m != null ? `CPU ${metrics.cpuLoad1m}%` : "—", hint: metrics?.memoryUsedMb != null && metrics?.memoryTotalMb != null ? `${metrics.memoryUsedMb}/${metrics.memoryTotalMb} MB` : "", progress: metrics?.memoryUsedMb != null && metrics?.memoryTotalMb != null ? metrics.memoryUsedMb / metrics.memoryTotalMb : void 0 })
    ] }),
    /* @__PURE__ */ jsx(HostStatusCard, { metrics, host: hostQuery.data }),
    /* @__PURE__ */ jsx(LiveMetricsCard, { deviceId })
  ] });
}
function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  progress,
  delta,
  bars
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: [
      /* @__PURE__ */ jsx(Icon, { className: "h-3.5 w-3.5", "aria-hidden": true }),
      label
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-2 flex items-baseline gap-2", children: [
      /* @__PURE__ */ jsx("div", { className: "text-2xl font-semibold tabular-nums", children: value }),
      hint ? /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: hint }) : null
    ] }),
    progress !== void 0 ? /* @__PURE__ */ jsx("div", { className: "mt-3 h-1.5 overflow-hidden rounded-full bg-secondary", children: /* @__PURE__ */ jsx("div", { className: "h-full rounded-full", style: {
      width: `${Math.round(progress * 100)}%`,
      background: "var(--gradient-primary)"
    } }) }) : null,
    delta ? /* @__PURE__ */ jsxs("div", { className: "mt-2 text-[11px] text-muted-foreground", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[oklch(0.74_0.18_155)]", children: delta }),
      " (last 100 steps)"
    ] }) : null,
    bars ? /* @__PURE__ */ jsx("div", { className: "mt-3 flex items-end gap-1", children: bars.map((b, i) => /* @__PURE__ */ jsx("div", { className: "w-2 rounded-sm bg-[oklch(0.74_0.18_155)]", style: {
      height: `${Math.max(4, b)}px`,
      opacity: 0.4 + b / 28
    }, "aria-hidden": true }, i)) }) : null
  ] });
}
function HostStatusCard({
  metrics,
  host
}) {
  if (!metrics && !host) {
    return /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground", children: "未绑定主机凭证，无法获取监控数据" });
  }
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("div", { className: "text-sm font-semibold", children: "主机状态" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [
        /* @__PURE__ */ jsx("span", { className: cn("h-2 w-2 rounded-full", metrics?.online ? "bg-[oklch(0.74_0.18_155)]" : "bg-destructive") }),
        metrics?.online ? "在线" : "离线",
        metrics?.collectedAt && /* @__PURE__ */ jsxs("span", { children: [
          "· ",
          new Date(metrics.collectedAt).toLocaleTimeString()
        ] })
      ] })
    ] }),
    metrics?.online && /* @__PURE__ */ jsxs("div", { className: "mt-4 grid grid-cols-2 gap-3 text-sm", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "主机名" }),
        /* @__PURE__ */ jsx("span", { className: "font-mono", children: metrics.hostname ?? "—" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "内核" }),
        /* @__PURE__ */ jsx("span", { className: "font-mono text-xs", children: metrics.kernel ?? "—" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "运行时间" }),
        /* @__PURE__ */ jsx("span", { className: "font-mono", children: formatUptime(metrics.uptimeSeconds) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "磁盘" }),
        /* @__PURE__ */ jsx("span", { className: "font-mono", children: metrics.diskUsedPct != null ? `${metrics.diskUsedPct}%` : "—" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "SSH 延迟" }),
        /* @__PURE__ */ jsx("span", { className: "font-mono", children: metrics.latencyMs != null ? `${metrics.latencyMs}ms` : "—" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: "IP" }),
        /* @__PURE__ */ jsx("span", { className: "font-mono", children: host?.host ?? "—" })
      ] })
    ] }),
    metrics && !metrics.online && metrics.errorMessage && /* @__PURE__ */ jsx("div", { className: "mt-3 rounded-md bg-destructive/5 p-2 text-xs text-destructive", children: metrics.errorMessage })
  ] });
}
function LiveMetricsCard({
  deviceId
}) {
  const historyQuery = useQuery({
    queryKey: ["host-metrics-history", deviceId],
    queryFn: () => deviceId ? getHostMetricsHistory(deviceId, {
      limit: 10
    }) : Promise.resolve({
      items: []
    }),
    enabled: Boolean(deviceId),
    refetchInterval: 6e4
  });
  const items = historyQuery.data?.items ?? [];
  return /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 flex-col rounded-2xl border border-border bg-card", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between border-b border-border px-4 py-3", children: /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 text-sm font-semibold", children: [
      /* @__PURE__ */ jsx("span", { className: "h-2 w-2 rounded-full bg-[oklch(0.74_0.18_155)]", "aria-hidden": true }),
      "采集日志（最近 10 条）"
    ] }) }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed max-h-48", children: items.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-center text-muted-foreground py-4", children: "暂无采集记录" }) : items.map((m) => /* @__PURE__ */ jsxs("div", { className: "break-all", children: [
      /* @__PURE__ */ jsxs("span", { className: "text-muted-foreground", children: [
        "[",
        new Date(m.collectedAt).toLocaleTimeString(),
        "]"
      ] }),
      " ",
      /* @__PURE__ */ jsx("span", { className: cn("font-semibold", m.online ? "text-[oklch(0.74_0.18_155)]" : "text-destructive"), children: m.online ? "OK" : "FAIL" }),
      " ",
      /* @__PURE__ */ jsx("span", { className: "text-foreground", children: m.online ? `GPU ${m.gpus?.[0]?.utilizationPct ?? 0}% | ${m.gpus?.[0]?.temperatureC ?? "?"}°C | CPU ${m.cpuLoad1m ?? "?"}% | Mem ${m.memoryUsedMb ?? "?"}/${m.memoryTotalMb ?? "?"} MB` : m.errorMessage?.slice(0, 80) ?? "连接失败" })
    ] }, m.id)) })
  ] });
}
function formatUptime(seconds) {
  if (seconds == null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor(seconds % 3600 / 60);
  return `${hours}h ${mins}m`;
}
function StatusBadge({
  status
}) {
  const map = {
    running: {
      label: "RUNNING",
      tone: "bg-[oklch(0.74_0.18_155)] text-[oklch(0.16_0.03_155)]"
    },
    success: {
      label: "SUCCESS",
      tone: "bg-primary/20 text-primary"
    },
    failed: {
      label: "FAILED",
      tone: "bg-destructive/20 text-destructive"
    },
    paused: {
      label: "PAUSED",
      tone: "bg-secondary text-muted-foreground"
    },
    not_started: {
      label: "PENDING",
      tone: "bg-secondary text-muted-foreground"
    }
  };
  const meta = map[status];
  return /* @__PURE__ */ jsx("span", { className: cn("rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", meta.tone), children: meta.label });
}
function EmptyState() {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsx("div", { className: "mx-auto grid max-w-md flex-1 place-items-center px-6 text-center", children: /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("span", { className: "grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground", children: /* @__PURE__ */ jsx(AlertTriangle, { className: "h-6 w-6", "aria-hidden": true }) }),
    /* @__PURE__ */ jsx("h2", { className: "mt-4 text-lg font-semibold", children: t("manager.empty.title") }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: t("manager.empty.hint") }),
    /* @__PURE__ */ jsx(Link, { to: "/workspace", className: "mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90", children: t("manager.empty.cta") })
  ] }) });
}
function gpuUtilBars(util) {
  const bars = [];
  for (let i = 0; i < 6; i += 1) {
    const base = Math.max(4, Math.round(util / 100 * 20 + i % 3 * 4));
    bars.push(base);
  }
  return bars;
}
export {
  ManagerPage as component
};
