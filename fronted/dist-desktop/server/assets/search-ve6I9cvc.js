import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Paperclip, Loader2, Send, Sparkles, AlertTriangle, Filter, Download, Share2, User, Bot, Hammer, CheckCircle2 } from "lucide-react";
import { S as Shell } from "./Shell-D8Pakp7k.js";
import { C as ChatMarkdown } from "./fastclaw-BIiEmd5C.js";
import { f as apiFetch, u as useI18n, R as Route } from "./router-DbOKu9BE.js";
import { u as useFastClawResearch } from "./use-fastclaw-research-C3Gqks9y.js";
import "clsx";
import "tailwind-merge";
import "react-markdown";
import "remark-gfm";
import "zod";
async function getRagScope() {
  return apiFetch("/api/rag/scope");
}
function RagSearchPage() {
  const {
    t
  } = useI18n();
  const {
    q: urlQuery,
    paperId
  } = Route.useSearch();
  const navigate = useNavigate({
    from: Route.fullPath
  });
  const command = useFastClawResearch({
    storageKey: "hermes.fastclaw-rag-analysis.sessionId.v1",
    entry: "rag-analysis",
    agentRole: "reader",
    fallbackErrorMessage: "无法连接 FastClaw 论文分析助手。"
  });
  const [draft, setDraft] = useState("");
  const isBusy = command.phase === "connecting" || command.phase === "streaming" || command.phase === "awaiting_confirmation";
  const turns = useMemo(() => groupTurns(command.transcript), [command.transcript]);
  const latestEvent = useMemo(() => {
    for (let i = command.transcript.length - 1; i >= 0; i -= 1) {
      const item = command.transcript[i];
      if (item.kind === "event") return item.event;
    }
    return null;
  }, [command.transcript]);
  const latestTool = useMemo(() => {
    for (let i = command.transcript.length - 1; i >= 0; i -= 1) {
      const item = command.transcript[i];
      if (item.kind !== "event") continue;
      if (item.event.type === "tool_start") return item.event.displayName || item.event.toolName;
      if (item.event.type === "tool_result") return item.event.toolName;
    }
    return null;
  }, [command.transcript]);
  const scopeQuery = useQuery({
    queryKey: ["rag-scope"],
    queryFn: getRagScope,
    staleTime: 5 * 6e4
  });
  const initialFired = useRef(false);
  useEffect(() => {
    if (initialFired.current) return;
    initialFired.current = true;
    const q = urlQuery?.trim();
    if (q) void submitQuestion(q);
  }, []);
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [command.error, command.transcript.length]);
  async function submitQuestion(question) {
    navigate({
      search: (prev) => ({
        ...prev,
        q: question,
        ...paperId ? {
          paperId
        } : {}
      }),
      replace: true
    });
    await command.run(question);
  }
  const handleSubmit = (event) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || isBusy) return;
    setDraft("");
    void submitQuestion(value);
  };
  return /* @__PURE__ */ jsx(Shell, { active: "None", children: /* @__PURE__ */ jsxs("div", { className: "flex h-[calc(100vh-69px)] flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-border px-6 py-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: t("search.pageTitleShort") }),
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground", children: [
          /* @__PURE__ */ jsx("span", { className: "opacity-70", children: t("search.modelLabel") }),
          /* @__PURE__ */ jsx("span", { className: "rounded-md bg-secondary/60 px-2 py-1 font-mono text-[11px] text-foreground", children: "FASTCLAW-ANALYSE" })
        ] }),
        paperId ? /* @__PURE__ */ jsxs("span", { className: "rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground", children: [
          "paper:",
          paperId
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "relative hidden md:block", children: [
        /* @__PURE__ */ jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground", "aria-hidden": true }),
        /* @__PURE__ */ jsx("input", { type: "search", placeholder: t("search.globalSearchPlaceholder"), className: "h-9 w-64 rounded-full border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 flex-1 gap-6 px-6 pt-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 flex-1 flex-col", children: [
        /* @__PURE__ */ jsxs("div", { ref: scrollRef, className: "flex-1 space-y-5 overflow-y-auto pr-2", children: [
          turns.length === 0 ? /* @__PURE__ */ jsx(EmptyConversation, {}) : turns.map((turn, index) => /* @__PURE__ */ jsx(ConversationTurn, { turn, isLast: index === turns.length - 1, phase: command.phase }, turn.userId ?? `turn-${index}`)),
          command.error ? /* @__PURE__ */ jsx(ErrorBubble, { message: command.error.message }) : null
        ] }),
        /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "mb-6 mt-4 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3", children: [
          /* @__PURE__ */ jsx(Search, { className: "h-4 w-4 text-muted-foreground", "aria-hidden": true }),
          /* @__PURE__ */ jsx("label", { htmlFor: "rag-chat-input", className: "sr-only", children: t("search.inputLabel") }),
          /* @__PURE__ */ jsx("input", { id: "rag-chat-input", value: draft, onChange: (event) => setDraft(event.target.value), placeholder: isBusy ? t("command.inputPlaceholderBusy") : t("search.chatPlaceholder"), className: "flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60", autoComplete: "off", disabled: isBusy }),
          /* @__PURE__ */ jsx("button", { type: "button", "aria-label": t("search.attach"), disabled: true, className: "rounded-full p-1.5 text-muted-foreground opacity-40", children: /* @__PURE__ */ jsx(Paperclip, { className: "h-4 w-4", "aria-hidden": true }) }),
          /* @__PURE__ */ jsx("button", { type: "submit", "aria-label": t("search.submit"), disabled: !draft.trim() || isBusy, className: "grid h-9 w-9 place-items-center rounded-full text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40", style: {
            background: "var(--gradient-primary)"
          }, children: isBusy ? /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }) : /* @__PURE__ */ jsx(Send, { className: "h-4 w-4", "aria-hidden": true }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("aside", { className: "hidden w-[360px] shrink-0 space-y-4 overflow-y-auto border-l border-border pl-6 pb-6 lg:block", children: [
        /* @__PURE__ */ jsx(FastClawSourceCard, { phase: command.phase, latestTool }),
        /* @__PURE__ */ jsx(StreamStatsCard, { phase: command.phase, latestEvent, totalEvents: command.transcript.filter((item) => item.kind === "event").length }),
        /* @__PURE__ */ jsx(ExecutionContextCard, { papersIndexed: scopeQuery.data?.papersIndexed, turnCount: turns.length, onNewSession: command.newSession, onReset: command.reset, disabled: isBusy })
      ] })
    ] })
  ] }) });
}
function groupTurns(transcript) {
  const turns = [];
  let current = null;
  for (const item of transcript) {
    if (item.kind === "user") {
      current = {
        userId: item.id,
        userMessage: item.message,
        events: []
      };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = {
        userId: null,
        userMessage: null,
        events: []
      };
      turns.push(current);
    }
    current.events.push(item);
  }
  return turns;
}
function ConversationTurn({
  turn,
  isLast,
  phase
}) {
  const {
    t
  } = useI18n();
  const showSpinner = isLast && turn.events.length === 0 && (phase === "connecting" || phase === "streaming");
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    turn.userMessage ? /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx(UserAvatar, {}),
      /* @__PURE__ */ jsx("div", { className: "flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground", children: turn.userMessage })
    ] }) : null,
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx(AgentAvatar, {}),
      /* @__PURE__ */ jsx("div", { className: "flex-1 space-y-3", children: showSpinner ? /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground", children: [
        /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }),
        t("command.waitingFirstEvent")
      ] }) : turn.events.map((item) => /* @__PURE__ */ jsx(EventBubble, { event: item.event }, item.id)) })
    ] })
  ] });
}
function EventBubble({
  event
}) {
  const {
    t
  } = useI18n();
  if (event.type === "agent_message") {
    return /* @__PURE__ */ jsx(Bubble, { tone: "default", icon: /* @__PURE__ */ jsx(Bot, { className: "h-4 w-4", "aria-hidden": true }), children: /* @__PURE__ */ jsx(ChatMarkdown, { children: event.message || t("command.event.agentEmpty") }) });
  }
  if (event.type === "thinking") {
    return /* @__PURE__ */ jsx(Bubble, { tone: "muted", icon: /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }), children: /* @__PURE__ */ jsx(ChatMarkdown, { children: event.message || t("command.phase.streaming") }) });
  }
  if (event.type === "tool_start") {
    return /* @__PURE__ */ jsx(Bubble, { tone: "primary", icon: /* @__PURE__ */ jsx(Hammer, { className: "h-4 w-4", "aria-hidden": true }), children: /* @__PURE__ */ jsx("div", { className: "text-sm", children: t("command.event.toolStart", {
      name: event.displayName || event.toolName
    }) }) });
  }
  if (event.type === "tool_result") {
    return /* @__PURE__ */ jsx(Bubble, { tone: "muted", icon: /* @__PURE__ */ jsx(CheckCircle2, { className: "h-4 w-4", "aria-hidden": true }), children: /* @__PURE__ */ jsx("div", { className: "text-sm", children: t("command.event.toolResult", {
      name: event.toolName,
      summary: event.summary
    }) }) });
  }
  if (event.type === "error") {
    return /* @__PURE__ */ jsx(ErrorBubble, { message: event.message });
  }
  if (event.type === "final") {
    const message = event.message || t("command.event.finalDefault");
    return /* @__PURE__ */ jsx(Bubble, { tone: "success", icon: /* @__PURE__ */ jsx(CheckCircle2, { className: "h-4 w-4", "aria-hidden": true }), children: /* @__PURE__ */ jsx(ChatMarkdown, { children: message }) });
  }
  return null;
}
function Bubble({
  tone,
  icon,
  children
}) {
  const toneClass = {
    default: "border-border bg-card",
    muted: "border-border bg-secondary/40 text-muted-foreground",
    primary: "border-primary/30 bg-primary/5",
    success: "border-[oklch(0.74_0.18_155_/_0.35)] bg-[oklch(0.74_0.18_155_/_0.08)]"
  }[tone];
  return /* @__PURE__ */ jsxs("div", { className: `flex gap-3 rounded-xl border px-4 py-3 ${toneClass}`, children: [
    /* @__PURE__ */ jsx("span", { className: "mt-0.5 text-primary", children: icon }),
    /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1", children })
  ] });
}
function ErrorBubble({
  message
}) {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
    /* @__PURE__ */ jsx(AgentAvatar, {}),
    /* @__PURE__ */ jsx("div", { className: "flex-1 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ jsx(AlertTriangle, { className: "mt-0.5 h-4 w-4 shrink-0", "aria-hidden": true }),
      /* @__PURE__ */ jsx("span", { children: t("search.replyError", {
        message
      }) })
    ] }) })
  ] });
}
function EmptyConversation() {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 text-center", children: [
    /* @__PURE__ */ jsx("span", { className: "grid h-14 w-14 place-items-center rounded-2xl text-primary-foreground", style: {
      background: "var(--gradient-primary)"
    }, "aria-hidden": true, children: /* @__PURE__ */ jsx(Sparkles, { className: "h-6 w-6" }) }),
    /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: t("search.emptyConversation.title") }),
    /* @__PURE__ */ jsx("p", { className: "max-w-sm text-sm text-muted-foreground", children: t("search.emptyConversation.hint") })
  ] });
}
function AgentAvatar() {
  return /* @__PURE__ */ jsx("span", { className: "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-primary-foreground", style: {
    background: "var(--gradient-primary)"
  }, "aria-hidden": true, children: /* @__PURE__ */ jsx(Sparkles, { className: "h-3.5 w-3.5" }) });
}
function UserAvatar() {
  return /* @__PURE__ */ jsx("span", { className: "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground", "aria-hidden": true, children: /* @__PURE__ */ jsx(User, { className: "h-3.5 w-3.5" }) });
}
function FastClawSourceCard({
  phase,
  latestTool
}) {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsxs("div", { className: "overflow-hidden rounded-2xl border border-border bg-card", children: [
    /* @__PURE__ */ jsx("div", { className: "h-20 w-full", style: {
      background: "var(--gradient-primary)",
      opacity: 0.3
    }, "aria-hidden": true }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-3 p-5", children: [
      /* @__PURE__ */ jsx("span", { className: "inline-block rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: t("search.panels.currentSource") }),
      /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold leading-snug", children: "FastClaw Paper Analysis" }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx(Tag, { children: "agentRole: reader" }),
        /* @__PURE__ */ jsx(Tag, { children: "FASTCLAW_AGENT_PAPER_ANALYSE" })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-xs", children: [
          /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: t("command.phase.streaming") }),
          /* @__PURE__ */ jsx("span", { className: "font-mono tabular-nums text-[oklch(0.74_0.18_155)]", children: phase })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "mt-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground", children: latestTool ? `Latest tool: ${latestTool}` : "Waiting for FastClaw events" })
      ] })
    ] })
  ] });
}
function StreamStatsCard({
  phase,
  latestEvent,
  totalEvents
}) {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: t("search.panels.dataExtraction") }),
      /* @__PURE__ */ jsx("button", { type: "button", "aria-label": t("search.panels.filter"), className: "rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", children: /* @__PURE__ */ jsx(Filter, { className: "h-3.5 w-3.5", "aria-hidden": true }) })
    ] }),
    /* @__PURE__ */ jsx("table", { className: "mt-4 w-full text-xs", children: /* @__PURE__ */ jsxs("tbody", { children: [
      /* @__PURE__ */ jsx(StatsRow, { label: "Phase", value: phase }),
      /* @__PURE__ */ jsx(StatsRow, { label: "Events", value: String(totalEvents) }),
      /* @__PURE__ */ jsx(StatsRow, { label: "Latest", value: latestEvent ? summarizeEvent(latestEvent) : "-" })
    ] }) })
  ] });
}
function ExecutionContextCard({
  papersIndexed,
  turnCount,
  onNewSession,
  onReset,
  disabled
}) {
  const {
    t
  } = useI18n();
  const contextUsed = Math.max(1, turnCount) * 4096;
  const contextMax = 128e3;
  const pct = Math.min(100, Math.round(contextUsed / contextMax * 100));
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4 rounded-2xl border border-border bg-card p-5", children: [
    /* @__PURE__ */ jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: t("search.panels.executionContext") }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm", children: [
        /* @__PURE__ */ jsx("span", { className: "h-2 w-2 rounded-full bg-[oklch(0.74_0.18_155)]", "aria-hidden": true }),
        t("search.panels.ragOnline"),
        /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: papersIndexed !== void 0 ? ` / ${papersIndexed}` : "" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "font-mono text-xs text-muted-foreground", children: [
        turnCount,
        " turns"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-xs", children: [
        /* @__PURE__ */ jsx("span", { className: "uppercase tracking-[0.12em] text-muted-foreground", children: t("search.panels.contextWindow") }),
        /* @__PURE__ */ jsxs("span", { className: "font-mono tabular-nums", children: [
          contextUsed.toLocaleString(),
          " / ",
          contextMax.toLocaleString()
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "mt-2 h-1.5 overflow-hidden rounded-full bg-secondary", children: /* @__PURE__ */ jsx("div", { className: "h-full rounded-full", style: {
        width: `${pct}%`,
        background: "var(--gradient-primary)"
      } }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsx(MetaCell, { label: t("search.panels.embeddings"), value: "FastClaw tools" }),
      /* @__PURE__ */ jsx(MetaCell, { label: "Chat model", value: "FASTCLAW-ANALYSE" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: onReset, disabled, className: "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-50", children: [
        /* @__PURE__ */ jsx(Download, { className: "h-3.5 w-3.5", "aria-hidden": true }),
        " Reset"
      ] }),
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: onNewSession, disabled, className: "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-primary-foreground disabled:opacity-50", style: {
        background: "var(--gradient-primary)"
      }, children: [
        /* @__PURE__ */ jsx(Share2, { className: "h-3.5 w-3.5", "aria-hidden": true }),
        " New Session"
      ] })
    ] })
  ] });
}
function StatsRow({
  label,
  value
}) {
  return /* @__PURE__ */ jsxs("tr", { className: "border-b border-border/60 last:border-none", children: [
    /* @__PURE__ */ jsx("td", { className: "py-2 font-mono text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("td", { className: "py-2 text-right font-mono text-primary", children: value })
  ] });
}
function MetaCell({
  label,
  value
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-border bg-background/40 px-3 py-2", children: [
    /* @__PURE__ */ jsx("div", { className: "text-[10px] uppercase tracking-[0.14em] text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("div", { className: "mt-1 truncate font-mono text-sm tabular-nums", children: value })
  ] });
}
function Tag({
  children
}) {
  return /* @__PURE__ */ jsx("span", { className: "rounded-md bg-secondary px-2 py-1 text-[11px] font-mono text-muted-foreground", children });
}
function summarizeEvent(event) {
  switch (event.type) {
    case "thinking":
    case "agent_message":
      return event.message.slice(0, 60) || event.type;
    case "tool_start":
      return event.displayName || event.toolName;
    case "tool_result":
      return event.summary.slice(0, 60) || event.toolName;
    case "need_confirmation":
      return event.message.slice(0, 60);
    case "final":
      return event.message?.slice(0, 60) || "final";
    case "error":
      return event.message.slice(0, 60);
    default:
      return "event";
  }
}
export {
  RagSearchPage as component
};
