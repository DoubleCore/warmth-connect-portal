import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useState, useMemo, useRef, useEffect } from "react";
import { Plus, Search, Paperclip, Loader2, Send, Sparkles, ShieldAlert, AlertTriangle, Download, CircleDashed, XCircle, CheckCircle2, User, Hammer, Bot } from "lucide-react";
import { S as Shell, c as cn } from "./Shell-D8Pakp7k.js";
import { C as ChatMarkdown } from "./fastclaw-BIiEmd5C.js";
import { B as Button } from "./button-toWkDJS-.js";
import { u as useI18n } from "./router-DbOKu9BE.js";
import { u as useFastClawResearch } from "./use-fastclaw-research-C3Gqks9y.js";
import "@tanstack/react-router";
import "clsx";
import "tailwind-merge";
import "@tanstack/react-query";
import "react-markdown";
import "remark-gfm";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "zod";
function ResearchPage() {
  const {
    t
  } = useI18n();
  const command = useFastClawResearch();
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
      if (item.event.type === "tool_start" || item.event.type === "tool_result") {
        return item.event.type === "tool_start" ? item.event.displayName || item.event.toolName : item.event.toolName;
      }
    }
    return null;
  }, [command.transcript]);
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [command.transcript.length, command.pendingConfirmation, command.error]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v || isBusy) return;
    setDraft("");
    await command.run(v);
  };
  return /* @__PURE__ */ jsx(Shell, { active: "None", children: /* @__PURE__ */ jsxs("div", { className: "flex h-[calc(100vh-69px)] flex-col", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-border px-6 py-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-xl font-semibold tracking-tight", children: t("research.title") }),
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground", children: [
          /* @__PURE__ */ jsx("span", { className: "opacity-70", children: t("search.modelLabel") }),
          /* @__PURE__ */ jsx("span", { className: "rounded-md bg-secondary/60 px-2 py-1 font-mono text-[11px] text-foreground", children: "FASTCLAW-SEARCH" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(PhaseBadge, { phase: command.phase }),
        /* @__PURE__ */ jsxs("button", { type: "button", onClick: command.newSession, disabled: isBusy, title: t("research.newSessionHint"), "aria-label": t("research.newSession"), className: "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50", children: [
          /* @__PURE__ */ jsx(Plus, { className: "h-3.5 w-3.5", "aria-hidden": true }),
          t("research.newSession")
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 flex-1 gap-6 px-6 pt-6", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex min-h-0 flex-1 flex-col", children: [
        /* @__PURE__ */ jsxs("div", { ref: scrollRef, className: "flex-1 space-y-5 overflow-y-auto pr-2", children: [
          turns.length === 0 ? /* @__PURE__ */ jsx(EmptyConversation, {}) : turns.map((turn, idx) => /* @__PURE__ */ jsx(ConversationTurn, { turn, isLast: idx === turns.length - 1, phase: command.phase }, turn.userId ?? `turn-${idx}`)),
          command.pendingConfirmation ? /* @__PURE__ */ jsx(ConfirmationCard, { confirmation: command.pendingConfirmation, onConfirm: () => void command.respondConfirmation("confirm"), onCancel: () => void command.respondConfirmation("cancel") }) : null,
          command.error ? /* @__PURE__ */ jsx(ErrorBubble, { error: command.error }) : null
        ] }),
        /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "mb-6 mt-4 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3", children: [
          /* @__PURE__ */ jsx(Search, { className: "h-4 w-4 text-muted-foreground", "aria-hidden": true }),
          /* @__PURE__ */ jsx("label", { htmlFor: "research-chat-input", className: "sr-only", children: t("research.followupLabel") }),
          /* @__PURE__ */ jsx("input", { id: "research-chat-input", value: draft, onChange: (e) => setDraft(e.target.value), placeholder: isBusy ? t("command.inputPlaceholderBusy") : t("research.followupPlaceholder"), className: "flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60", autoComplete: "off", disabled: isBusy }),
          /* @__PURE__ */ jsx("button", { type: "button", "aria-label": t("search.attach"), disabled: true, className: "rounded-full p-1.5 text-muted-foreground opacity-40", children: /* @__PURE__ */ jsx(Paperclip, { className: "h-4 w-4", "aria-hidden": true }) }),
          /* @__PURE__ */ jsx("button", { type: "submit", "aria-label": t("research.followupSubmit"), disabled: !draft.trim() || isBusy, className: "grid h-9 w-9 place-items-center rounded-full text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40", style: {
            background: "var(--gradient-primary)"
          }, children: isBusy ? /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }) : /* @__PURE__ */ jsx(Send, { className: "h-4 w-4", "aria-hidden": true }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("aside", { className: "hidden w-[360px] shrink-0 space-y-4 overflow-y-auto border-l border-border pl-6 pb-6 lg:block", children: [
        /* @__PURE__ */ jsx(CurrentCommandCard, { phase: command.phase, commandId: command.currentCommandId, latestTool }),
        /* @__PURE__ */ jsx(LiveStreamCard, { phase: command.phase, latestEvent, totalEvents: command.transcript.filter((i) => i.kind === "event").length }),
        /* @__PURE__ */ jsx(ExecutionCard, { turnCount: turns.length, onReset: command.reset, onNewSession: command.newSession, isBusy })
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
    turn.userMessage !== null ? /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx(AgentAvatar, {}),
      /* @__PURE__ */ jsx("div", { className: "flex-1 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words", children: turn.userMessage })
    ] }) : null,
    /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx(UserAvatar, {}),
      /* @__PURE__ */ jsx("div", { className: "flex-1 space-y-3", children: showSpinner ? /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground", children: [
        /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }),
        t("command.waitingFirstEvent")
      ] }) : turn.events.length === 0 ? null : turn.events.map((item) => /* @__PURE__ */ jsx(EventBubble, { event: item.event }, item.id)) })
    ] })
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
    /* @__PURE__ */ jsx("h2", { className: "text-lg font-semibold", children: t("research.empty.title") }),
    /* @__PURE__ */ jsx("p", { className: "max-w-sm text-sm text-muted-foreground", children: t("research.empty.hint") })
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
function EventBubble({
  event
}) {
  const {
    t
  } = useI18n();
  switch (event.type) {
    case "thinking":
      return /* @__PURE__ */ jsxs(BubbleShell, { tone: "muted", children: [
        /* @__PURE__ */ jsx(BubbleIcon, { Icon: Loader2, spin: true, tone: "muted" }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1 space-y-1", children: [
          /* @__PURE__ */ jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: t("command.phase.streaming") }),
          /* @__PURE__ */ jsx(ChatMarkdown, { children: event.message || t("command.event.agentEmpty") })
        ] })
      ] });
    case "agent_message":
      return /* @__PURE__ */ jsxs(BubbleShell, { tone: "default", children: [
        /* @__PURE__ */ jsx(BubbleIcon, { Icon: Bot, tone: "default" }),
        /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1", children: /* @__PURE__ */ jsx(ChatMarkdown, { children: event.message || t("command.event.agentEmpty") }) })
      ] });
    case "tool_start":
      return /* @__PURE__ */ jsxs(BubbleShell, { tone: "primary", children: [
        /* @__PURE__ */ jsx(BubbleIcon, { Icon: Hammer, tone: "primary" }),
        /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1 text-sm", children: t("command.event.toolStart", {
          name: event.displayName || event.toolName
        }) })
      ] });
    case "tool_result":
      return /* @__PURE__ */ jsxs(BubbleShell, { tone: "primary", children: [
        /* @__PURE__ */ jsx(BubbleIcon, { Icon: CheckCircle2, tone: "primary" }),
        /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1 text-sm", children: t("command.event.toolResult", {
          name: event.toolName,
          summary: event.summary
        }) })
      ] });
    case "need_confirmation":
      return /* @__PURE__ */ jsxs(BubbleShell, { tone: "amber", children: [
        /* @__PURE__ */ jsx(BubbleIcon, { Icon: ShieldAlert, tone: "amber" }),
        /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1 text-sm", children: t("command.event.needConfirmationInline", {
          message: event.message || t("command.event.needConfirmationFallback")
        }) })
      ] });
    case "final":
      return /* @__PURE__ */ jsx(FinalBubble, { event });
    case "error":
      return /* @__PURE__ */ jsxs(BubbleShell, { tone: "destructive", children: [
        /* @__PURE__ */ jsx(BubbleIcon, { Icon: AlertTriangle, tone: "destructive" }),
        /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1 text-sm text-destructive", children: t("command.event.errorInline", {
          message: event.message
        }) })
      ] });
  }
}
function FinalBubble({
  event
}) {
  const {
    t
  } = useI18n();
  const result = event.result;
  const isCancelled = typeof result === "object" && result !== null && result.status === "cancelled";
  const headline = event.message ?? (isCancelled ? t("command.event.finalCancelled") : t("command.event.finalDefault"));
  const leftover = extractLeftover(result, event.message);
  return /* @__PURE__ */ jsxs(BubbleShell, { tone: isCancelled ? "muted" : "success", children: [
    /* @__PURE__ */ jsx(BubbleIcon, { Icon: isCancelled ? CircleDashed : CheckCircle2, tone: isCancelled ? "muted" : "success" }),
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1 space-y-2", children: [
      /* @__PURE__ */ jsx(ChatMarkdown, { children: headline }),
      leftover !== void 0 ? /* @__PURE__ */ jsx(ResultPreview, { value: leftover }) : null
    ] })
  ] });
}
function BubbleShell({
  tone,
  children
}) {
  const bg = tone === "destructive" ? "border-destructive/40 bg-destructive/5" : tone === "amber" ? "border-amber-500/40 bg-amber-500/5" : tone === "success" ? "border-emerald-500/40 bg-emerald-500/5" : tone === "primary" ? "border-primary/30 bg-primary/5" : tone === "muted" ? "border-border bg-card/60" : "border-border bg-card";
  return /* @__PURE__ */ jsx("div", { className: cn("flex items-start gap-3 rounded-xl border px-4 py-3", bg), children });
}
function BubbleIcon({
  Icon,
  tone,
  spin
}) {
  const bg = tone === "destructive" ? "bg-destructive/15 text-destructive" : tone === "amber" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : tone === "success" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : tone === "primary" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground";
  return /* @__PURE__ */ jsx("span", { className: cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", bg), "aria-hidden": true, children: /* @__PURE__ */ jsx(Icon, { className: cn("h-3.5 w-3.5", spin && "animate-spin") }) });
}
function extractLeftover(result, headline) {
  if (result === null || result === void 0) return void 0;
  if (typeof result === "string") {
    return result === headline ? void 0 : result;
  }
  if (typeof result === "object") {
    const r = result;
    const {
      usage: _usage,
      ...rest
    } = r;
    if (typeof rest.output === "string" && rest.output === headline) {
      delete rest.output;
    }
    const remaining = Object.entries(rest).filter(([, v]) => v !== null && v !== void 0);
    return remaining.length > 0 ? Object.fromEntries(remaining) : void 0;
  }
  return result;
}
function ResultPreview({
  value
}) {
  const pretty = safeStringify(value);
  if (!pretty) return null;
  return /* @__PURE__ */ jsx("pre", { className: "mt-1 max-h-56 overflow-auto rounded-lg bg-secondary/60 p-2 text-xs leading-relaxed", children: pretty });
}
function safeStringify(v) {
  try {
    if (v === null || v === void 0) return null;
    if (typeof v === "string") return v;
    return JSON.stringify(v, null, 2);
  } catch {
    return null;
  }
}
function PhaseBadge({
  phase
}) {
  const {
    t
  } = useI18n();
  const meta = phaseMeta(phase, t);
  return /* @__PURE__ */ jsxs("span", { className: cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium", meta.tone), children: [
    /* @__PURE__ */ jsx(meta.Icon, { className: cn("h-3.5 w-3.5", meta.spin && "animate-spin"), "aria-hidden": true }),
    meta.label
  ] });
}
function phaseMeta(phase, t) {
  switch (phase) {
    case "idle":
      return {
        label: t("command.phase.idle"),
        Icon: Sparkles,
        tone: "border-border text-muted-foreground",
        spin: false
      };
    case "connecting":
    case "streaming":
      return {
        label: phase === "connecting" ? t("command.phase.connecting") : t("command.phase.streaming"),
        Icon: Loader2,
        tone: "border-primary/40 text-primary",
        spin: true
      };
    case "awaiting_confirmation":
      return {
        label: t("command.phase.awaitingConfirmation"),
        Icon: ShieldAlert,
        tone: "border-amber-500/40 text-amber-600 dark:text-amber-400",
        spin: false
      };
    case "completed":
      return {
        label: t("command.phase.completed"),
        Icon: CheckCircle2,
        tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        spin: false
      };
    case "failed":
      return {
        label: t("command.phase.failed"),
        Icon: XCircle,
        tone: "border-destructive/40 text-destructive",
        spin: false
      };
    case "cancelled":
      return {
        label: t("command.phase.cancelled"),
        Icon: CircleDashed,
        tone: "border-border text-muted-foreground",
        spin: false
      };
  }
}
function ConfirmationCard({
  confirmation,
  onConfirm,
  onCancel
}) {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsx("div", { className: "rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3", children: [
    /* @__PURE__ */ jsx("span", { className: "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400", children: /* @__PURE__ */ jsx(ShieldAlert, { className: "h-4 w-4", "aria-hidden": true }) }),
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsx("div", { className: "font-medium", children: t("command.confirmation.title") }),
      /* @__PURE__ */ jsx("div", { className: "mt-1 text-sm text-muted-foreground", children: confirmation.message || t("command.confirmation.fallback") }),
      confirmation.payload ? /* @__PURE__ */ jsx(ResultPreview, { value: confirmation.payload }) : null,
      /* @__PURE__ */ jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx(Button, { size: "sm", onClick: onConfirm, children: t("command.confirmation.confirm") }),
        /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", onClick: onCancel, children: t("command.confirmation.cancel") })
      ] })
    ] })
  ] }) });
}
function ErrorBubble({
  error
}) {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3", children: [
    /* @__PURE__ */ jsx("span", { className: "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive", children: /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4", "aria-hidden": true }) }),
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1 text-sm", children: [
      /* @__PURE__ */ jsx("div", { className: "font-medium text-destructive", children: t("command.error.title") }),
      /* @__PURE__ */ jsx("div", { className: "mt-1 text-destructive", children: error.message }),
      error.code ? /* @__PURE__ */ jsx("div", { className: "mt-1 text-xs text-destructive/80", children: t("command.error.code", {
        code: error.code
      }) }) : null
    ] })
  ] });
}
function CurrentCommandCard({
  phase,
  commandId,
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
      /* @__PURE__ */ jsx("span", { className: "inline-block rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: t("research.panels.currentCommand") }),
      /* @__PURE__ */ jsx("h3", { className: "text-base font-semibold leading-snug", children: phaseMeta(phase, t).label }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
        commandId ? /* @__PURE__ */ jsx(Tag, { children: /* @__PURE__ */ jsx("span", { className: "font-mono text-[10px]", children: commandId.slice(0, 8) }) }) : /* @__PURE__ */ jsx(Tag, { children: t("research.panels.noCommand") }),
        latestTool ? /* @__PURE__ */ jsx(Tag, { children: latestTool }) : null
      ] })
    ] })
  ] });
}
function LiveStreamCard({
  phase,
  latestEvent,
  totalEvents
}) {
  const {
    t
  } = useI18n();
  const latestSummary = latestEvent ? summarizeEvent(latestEvent, t) : null;
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-border bg-card p-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: t("research.panels.liveStream") }),
      /* @__PURE__ */ jsx("span", { className: cn("h-2 w-2 rounded-full", phase === "streaming" || phase === "connecting" ? "bg-[oklch(0.74_0.18_155)]" : "bg-muted-foreground/40"), "aria-hidden": true })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-4 text-xs text-muted-foreground", children: t("research.panels.eventCount", {
      count: totalEvents
    }) }),
    /* @__PURE__ */ jsx("div", { className: "mt-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm", children: latestSummary ?? /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: t("research.panels.noEvents") }) })
  ] });
}
function ExecutionCard({
  turnCount,
  onReset,
  onNewSession,
  isBusy
}) {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4 rounded-2xl border border-border bg-card p-5", children: [
    /* @__PURE__ */ jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", children: t("research.panels.execution") }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsx(MetaCell, { label: t("research.panels.turns"), value: String(turnCount) }),
      /* @__PURE__ */ jsx(MetaCell, { label: t("research.panels.channel"), value: "SSE" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: onReset, disabled: isBusy || turnCount === 0, className: "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50", children: [
        /* @__PURE__ */ jsx(Download, { className: "h-3.5 w-3.5", "aria-hidden": true }),
        t("command.reset")
      ] }),
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: onNewSession, disabled: isBusy, className: "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-primary-foreground disabled:opacity-50", style: {
        background: "var(--gradient-primary)"
      }, children: [
        /* @__PURE__ */ jsx(Plus, { className: "h-3.5 w-3.5", "aria-hidden": true }),
        t("research.newSession")
      ] })
    ] })
  ] });
}
function MetaCell({
  label,
  value
}) {
  return /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-border bg-background/40 px-3 py-2", children: [
    /* @__PURE__ */ jsx("div", { className: "text-[10px] uppercase tracking-[0.14em] text-muted-foreground", children: label }),
    /* @__PURE__ */ jsx("div", { className: "mt-1 font-mono text-sm tabular-nums", children: value })
  ] });
}
function Tag({
  children
}) {
  return /* @__PURE__ */ jsx("span", { className: "rounded-md bg-secondary px-2 py-1 text-[11px] font-mono text-muted-foreground", children });
}
function summarizeEvent(event, t) {
  switch (event.type) {
    case "thinking":
      return event.message || t("command.phase.streaming");
    case "agent_message":
      return event.message || t("command.event.agentEmpty");
    case "tool_start":
      return t("command.event.toolStart", {
        name: event.displayName || event.toolName
      });
    case "tool_result":
      return t("command.event.toolResult", {
        name: event.toolName,
        summary: event.summary
      });
    case "need_confirmation":
      return t("command.event.needConfirmationInline", {
        message: event.message || t("command.event.needConfirmationFallback")
      });
    case "final":
      return event.message ?? t("command.event.finalDefault");
    case "error":
      return t("command.event.errorInline", {
        message: event.message
      });
  }
}
export {
  ResearchPage as component
};
