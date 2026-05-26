import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  Filter,
  Hammer,
  Loader2,
  Paperclip,
  Search,
  Send,
  Share2,
  Sparkles,
  User,
} from "lucide-react";
import { z } from "zod";
import { Shell } from "@/components/hermes/Shell";
import { ChatMarkdown } from "@/components/hermes/ChatMarkdown";
import { getRagScope } from "@/api/rag";
import { useI18n } from "@/lib/i18n/I18nProvider";
import {
  useFastClawResearch,
  type FastClawResearchTranscriptItem,
} from "@/hooks/use-fastclaw-research";
import type { CommandRuntimePhase, CommandStreamEvent } from "@/types/command";

const searchSchema = z.object({
  q: z.string().optional(),
  paperId: z.string().optional(),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "RAG Search - Hermes AI" },
      { name: "description", content: "FastClaw-assisted analysis over the research corpus." },
    ],
  }),
  component: RagSearchPage,
});

function RagSearchPage() {
  const { t } = useI18n();
  const { q: urlQuery, paperId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const command = useFastClawResearch({
    storageKey: "hermes.fastclaw-rag-analysis.sessionId.v1",
    entry: "rag-analysis",
    agentRole: "reader",
    fallbackErrorMessage: "无法连接 FastClaw 论文分析助手。",
  });
  const [draft, setDraft] = useState("");

  const isBusy =
    command.phase === "connecting" ||
    command.phase === "streaming" ||
    command.phase === "awaiting_confirmation";

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
    queryKey: ["rag-scope"] as const,
    queryFn: getRagScope,
    staleTime: 5 * 60_000,
  });

  const initialFired = useRef(false);
  useEffect(() => {
    if (initialFired.current) return;
    initialFired.current = true;
    const q = urlQuery?.trim();
    if (q) void submitQuestion(q);
    // submitQuestion intentionally reads current command state only once here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [command.error, command.transcript.length]);

  async function submitQuestion(question: string) {
    navigate({
      search: (prev) => ({ ...prev, q: question, ...(paperId ? { paperId } : {}) }),
      replace: true,
    });
    await command.run(question);
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || isBusy) return;
    setDraft("");
    void submitQuestion(value);
  };

  return (
    <Shell active="None">
      <div className="flex h-[calc(100vh-69px)] flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold tracking-tight">{t("search.pageTitleShort")}</h1>
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <span className="opacity-70">{t("search.modelLabel")}</span>
              <span className="rounded-md bg-secondary/60 px-2 py-1 font-mono text-[11px] text-foreground">
                FASTCLAW-ANALYSE
              </span>
            </span>
            {paperId ? (
              <span className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
                paper:{paperId}
              </span>
            ) : null}
          </div>
          <div className="relative hidden md:block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              placeholder={t("search.globalSearchPlaceholder")}
              className="h-9 w-64 rounded-full border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-6 px-6 pt-6">
          <div className="flex min-h-0 flex-1 flex-col">
            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto pr-2">
              {turns.length === 0 ? (
                <EmptyConversation />
              ) : (
                turns.map((turn, index) => (
                  <ConversationTurn
                    key={turn.userId ?? `turn-${index}`}
                    turn={turn}
                    isLast={index === turns.length - 1}
                    phase={command.phase}
                  />
                ))
              )}

              {command.error ? <ErrorBubble message={command.error.message} /> : null}
            </div>

            <form
              onSubmit={handleSubmit}
              className="mb-6 mt-4 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3"
            >
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <label htmlFor="rag-chat-input" className="sr-only">
                {t("search.inputLabel")}
              </label>
              <input
                id="rag-chat-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  isBusy ? t("command.inputPlaceholderBusy") : t("search.chatPlaceholder")
                }
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                autoComplete="off"
                disabled={isBusy}
              />
              <button
                type="button"
                aria-label={t("search.attach")}
                disabled
                className="rounded-full p-1.5 text-muted-foreground opacity-40"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="submit"
                aria-label={t("search.submit")}
                disabled={!draft.trim() || isBusy}
                className="grid h-9 w-9 place-items-center rounded-full text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40"
                style={{ background: "var(--gradient-primary)" }}
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
              </button>
            </form>
          </div>

          <aside className="hidden w-[360px] shrink-0 space-y-4 overflow-y-auto border-l border-border pl-6 pb-6 lg:block">
            <FastClawSourceCard phase={command.phase} latestTool={latestTool} />
            <StreamStatsCard
              phase={command.phase}
              latestEvent={latestEvent}
              totalEvents={command.transcript.filter((item) => item.kind === "event").length}
            />
            <ExecutionContextCard
              papersIndexed={scopeQuery.data?.papersIndexed}
              turnCount={turns.length}
              onNewSession={command.newSession}
              onReset={command.reset}
              disabled={isBusy}
            />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

type ConversationTurnData = {
  userId: string | null;
  userMessage: string | null;
  events: Extract<FastClawResearchTranscriptItem, { kind: "event" }>[];
};

function groupTurns(transcript: FastClawResearchTranscriptItem[]): ConversationTurnData[] {
  const turns: ConversationTurnData[] = [];
  let current: ConversationTurnData | null = null;

  for (const item of transcript) {
    if (item.kind === "user") {
      current = { userId: item.id, userMessage: item.message, events: [] };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = { userId: null, userMessage: null, events: [] };
      turns.push(current);
    }
    current.events.push(item);
  }

  return turns;
}

function ConversationTurn({
  turn,
  isLast,
  phase,
}: {
  turn: ConversationTurnData;
  isLast: boolean;
  phase: CommandRuntimePhase;
}) {
  const { t } = useI18n();
  const showSpinner =
    isLast && turn.events.length === 0 && (phase === "connecting" || phase === "streaming");

  return (
    <>
      {turn.userMessage ? (
        <div className="flex items-start gap-3">
          <UserAvatar />
          <div className="flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {turn.userMessage}
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <AgentAvatar />
        <div className="flex-1 space-y-3">
          {showSpinner ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("command.waitingFirstEvent")}
            </div>
          ) : (
            turn.events.map((item) => <EventBubble key={item.id} event={item.event} />)
          )}
        </div>
      </div>
    </>
  );
}

function EventBubble({ event }: { event: CommandStreamEvent }) {
  const { t } = useI18n();

  if (event.type === "agent_message") {
    return (
      <Bubble tone="default" icon={<Bot className="h-4 w-4" aria-hidden />}>
        <ChatMarkdown>{event.message || t("command.event.agentEmpty")}</ChatMarkdown>
      </Bubble>
    );
  }

  if (event.type === "thinking") {
    return (
      <Bubble tone="muted" icon={<Loader2 className="h-4 w-4 animate-spin" aria-hidden />}>
        <ChatMarkdown>{event.message || t("command.phase.streaming")}</ChatMarkdown>
      </Bubble>
    );
  }

  if (event.type === "tool_start") {
    return (
      <Bubble tone="primary" icon={<Hammer className="h-4 w-4" aria-hidden />}>
        <div className="text-sm">
          {t("command.event.toolStart", {
            name: event.displayName || event.toolName,
          })}
        </div>
      </Bubble>
    );
  }

  if (event.type === "tool_result") {
    return (
      <Bubble tone="muted" icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>
        <div className="text-sm">
          {t("command.event.toolResult", {
            name: event.toolName,
            summary: event.summary,
          })}
        </div>
      </Bubble>
    );
  }

  if (event.type === "error") {
    return <ErrorBubble message={event.message} />;
  }

  if (event.type === "final") {
    const message = event.message || t("command.event.finalDefault");
    return (
      <Bubble tone="success" icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>
        <ChatMarkdown>{message}</ChatMarkdown>
      </Bubble>
    );
  }

  return null;
}

function Bubble({
  tone,
  icon,
  children,
}: {
  tone: "default" | "muted" | "primary" | "success";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass = {
    default: "border-border bg-card",
    muted: "border-border bg-secondary/40 text-muted-foreground",
    primary: "border-primary/30 bg-primary/5",
    success: "border-[oklch(0.74_0.18_155_/_0.35)] bg-[oklch(0.74_0.18_155_/_0.08)]",
  }[tone];

  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 ${toneClass}`}>
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ErrorBubble({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3">
      <AgentAvatar />
      <div className="flex-1 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t("search.replyError", { message })}</span>
        </div>
      </div>
    </div>
  );
}

function EmptyConversation() {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <span
        className="grid h-14 w-14 place-items-center rounded-2xl text-primary-foreground"
        style={{ background: "var(--gradient-primary)" }}
        aria-hidden
      >
        <Sparkles className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-semibold">{t("search.emptyConversation.title")}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t("search.emptyConversation.hint")}</p>
    </div>
  );
}

function AgentAvatar() {
  return (
    <span
      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-primary-foreground"
      style={{ background: "var(--gradient-primary)" }}
      aria-hidden
    >
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}

function UserAvatar() {
  return (
    <span
      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground"
      aria-hidden
    >
      <User className="h-3.5 w-3.5" />
    </span>
  );
}

function FastClawSourceCard({
  phase,
  latestTool,
}: {
  phase: CommandRuntimePhase;
  latestTool: string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div
        className="h-20 w-full"
        style={{ background: "var(--gradient-primary)", opacity: 0.3 }}
        aria-hidden
      />
      <div className="space-y-3 p-5">
        <span className="inline-block rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("search.panels.currentSource")}
        </span>
        <h3 className="text-base font-semibold leading-snug">FastClaw Paper Analysis</h3>
        <div className="flex flex-wrap gap-2">
          <Tag>agentRole: reader</Tag>
          <Tag>FASTCLAW_AGENT_PAPER_ANALYSE</Tag>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("command.phase.streaming")}</span>
            <span className="font-mono tabular-nums text-[oklch(0.74_0.18_155)]">{phase}</span>
          </div>
          <div className="mt-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
            {latestTool ? `Latest tool: ${latestTool}` : "Waiting for FastClaw events"}
          </div>
        </div>
      </div>
    </div>
  );
}

function StreamStatsCard({
  phase,
  latestEvent,
  totalEvents,
}: {
  phase: CommandRuntimePhase;
  latestEvent: CommandStreamEvent | null;
  totalEvents: number;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("search.panels.dataExtraction")}
        </span>
        <button
          type="button"
          aria-label={t("search.panels.filter")}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <table className="mt-4 w-full text-xs">
        <tbody>
          <StatsRow label="Phase" value={phase} />
          <StatsRow label="Events" value={String(totalEvents)} />
          <StatsRow label="Latest" value={latestEvent ? summarizeEvent(latestEvent) : "-"} />
        </tbody>
      </table>
    </div>
  );
}

function ExecutionContextCard({
  papersIndexed,
  turnCount,
  onNewSession,
  onReset,
  disabled,
}: {
  papersIndexed: number | undefined;
  turnCount: number;
  onNewSession: () => void;
  onReset: () => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const contextUsed = Math.max(1, turnCount) * 4096;
  const contextMax = 128_000;
  const pct = Math.min(100, Math.round((contextUsed / contextMax) * 100));

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t("search.panels.executionContext")}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-[oklch(0.74_0.18_155)]" aria-hidden />
          {t("search.panels.ragOnline")}
          <span className="text-muted-foreground">
            {papersIndexed !== undefined ? ` / ${papersIndexed}` : ""}
          </span>
        </div>
        <div className="font-mono text-xs text-muted-foreground">{turnCount} turns</div>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="uppercase tracking-[0.12em] text-muted-foreground">
            {t("search.panels.contextWindow")}
          </span>
          <span className="font-mono tabular-nums">
            {contextUsed.toLocaleString()} / {contextMax.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: "var(--gradient-primary)",
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetaCell label={t("search.panels.embeddings")} value="FastClaw tools" />
        <MetaCell label="Chat model" value="FASTCLAW-ANALYSE" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> Reset
        </button>
        <button
          type="button"
          onClick={onNewSession}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden /> New Session
        </button>
      </div>
    </div>
  );
}

function StatsRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-border/60 last:border-none">
      <td className="py-2 font-mono text-muted-foreground">{label}</td>
      <td className="py-2 text-right font-mono text-primary">{value}</td>
    </tr>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-mono text-muted-foreground">
      {children}
    </span>
  );
}

function summarizeEvent(event: CommandStreamEvent): string {
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
