import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Paperclip, Plus, Search, Send, Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Shell } from "@/components/hermes/Shell";
import { FastclawToolCard, FastclawProgressRow } from "@/components/hermes/FastclawToolCard";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { type FastclawTranscriptItem } from "@/hooks/use-fastclaw-stream";
import { useFastClawResearch } from "@/hooks/use-fastclaw-research";

/**
 * FastClaw 论文搜索助手页面（/research）。
 *
 * 布局镜像 /search：页面自定义 header + 左侧对话流 + 右侧上下文面板 + 底部药丸
 * 输入条。数据源走当前 FastClaw 流式链路 `/api/fastclaw/chat/stream`，
 * agentRole = "researcher"——与设置页飞书配对卡片共用同一个搜索 agent。
 *
 * 每一轮对话由两个气泡组成：
 *   1. AgentAvatar + 用户原始输入
 *   2. UserAvatar + FastClaw 的回答 / 工具过程（按 transcript 顺序渲染）
 */
export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research — FastClaw" },
      {
        name: "description",
        content: "Search and explore the research corpus with the FastClaw paper agent.",
      },
    ],
  }),
  component: ResearchPage,
});

const RESEARCH_SYSTEM_PROMPT =
  "你是论文搜索助手。帮助用户在研究语料中检索、对比并归纳论文，" +
  "回答时给出清晰的要点与来源标题。";

type ResearchPhase = ReturnType<typeof useFastClawResearch>["phase"];

function ResearchPage() {
  const { t } = useI18n();
  const stream = useFastClawResearch();
  const [draft, setDraft] = useState("");

  const isBusy = stream.phase === "streaming";

  // 把扁平 transcript 按 user 消息聚合成一轮一轮（提问 → 回答）。
  const turns = useMemo(() => groupTurns(stream.items), [stream.items]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [stream.items.length, stream.error]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v || isBusy) return;
    setDraft("");
    stream.send(v, { systemPrompt: RESEARCH_SYSTEM_PROMPT });
  };

  return (
    <Shell active="None">
      {/* 镜像 /search：Shell TopBar 之下再开一条页面自己的 header */}
      <div className="flex h-[calc(100vh-69px)] flex-col">
        <ResearchHeader phase={stream.phase} isBusy={isBusy} onNewSession={stream.reset} />

        {/* 主体双栏：左对话，右上下文面板 */}
        <div className="flex min-h-0 flex-1 gap-6 px-6 pt-6">
          <div className="flex min-h-0 flex-1 flex-col">
            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto pr-2">
              {!stream.restored ? null : turns.length === 0 ? (
                <EmptyConversation />
              ) : (
                turns.map((turn, idx) => (
                  <ConversationTurn
                    key={turn.userId ?? `turn-${idx}`}
                    turn={turn}
                    isLast={idx === turns.length - 1}
                    isBusy={isBusy}
                  />
                ))
              )}

              {stream.error ? <ErrorBubble message={stream.error} /> : null}
            </div>

            <ResearchInput
              draft={draft}
              onChange={setDraft}
              onSubmit={handleSubmit}
              isBusy={isBusy}
            />
          </div>

          <aside className="hidden w-[360px] shrink-0 space-y-4 overflow-y-auto border-l border-border pl-6 pb-6 lg:block">
            <SessionCard
              phase={stream.phase}
              turnCount={turns.length}
              toolCount={stream.items.filter((i) => i.kind === "tool").length}
              onReset={stream.reset}
              isBusy={isBusy}
            />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

// ---------- Header ----------

function ResearchHeader({
  phase,
  isBusy,
  onNewSession,
}: {
  phase: ResearchPhase;
  isBusy: boolean;
  onNewSession: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{t("research.title")}</h1>
        <span className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          <span className="opacity-70">{t("search.modelLabel")}</span>
          <span className="rounded-md bg-secondary/60 px-2 py-1 font-mono text-[11px] text-foreground">
            FASTCLAW-SEARCH
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <PhaseBadge phase={phase} />
        <button
          type="button"
          onClick={onNewSession}
          disabled={isBusy}
          title={t("research.newSessionHint")}
          aria-label={t("research.newSession")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("research.newSession")}
        </button>
      </div>
    </div>
  );
}

// ---------- 底部输入条 ----------

function ResearchInput({
  draft,
  onChange,
  onSubmit,
  isBusy,
}: {
  draft: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isBusy: boolean;
}) {
  const { t } = useI18n();
  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 mt-4 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3"
    >
      <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
      <label htmlFor="research-chat-input" className="sr-only">
        {t("research.followupLabel")}
      </label>
      <input
        id="research-chat-input"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          isBusy ? t("research.inputPlaceholderBusy") : t("research.followupPlaceholder")
        }
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
        autoComplete="off"
        disabled={isBusy}
      />
      {/* Paperclip 视觉占位：暂不支持附件上传 */}
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
        aria-label={t("research.followupSubmit")}
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
  );
}

// ---------- Turn 聚合 ----------

type ConversationTurnData = {
  /** 用户 transcript 条目 id，用作 React key；未配对用户消息时为 null。 */
  userId: string | null;
  userMessage: string | null;
  items: FastclawTranscriptItem[];
};

function groupTurns(items: FastclawTranscriptItem[]): ConversationTurnData[] {
  const turns: ConversationTurnData[] = [];
  let current: ConversationTurnData | null = null;
  for (const item of items) {
    if (item.kind === "user") {
      current = { userId: item.id, userMessage: item.content, items: [] };
      turns.push(current);
      continue;
    }
    // 事件先于任何 user 消息到达——挂到匿名轮，避免孤儿事件被丢。
    if (!current) {
      current = { userId: null, userMessage: null, items: [] };
      turns.push(current);
    }
    current.items.push(item);
  }
  return turns;
}

// ---------- 对话单轮 ----------

function ConversationTurn({
  turn,
  isLast,
  isBusy,
}: {
  turn: ConversationTurnData;
  isLast: boolean;
  isBusy: boolean;
}) {
  const showSpinner = isLast && turn.items.length === 0 && isBusy;

  return (
    <>
      {turn.userMessage !== null ? (
        <div className="flex items-start gap-3">
          <AgentAvatar />
          <div className="flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {turn.userMessage}
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <UserAvatar />
        <div className="min-w-0 flex-1 space-y-3">
          {showSpinner ? (
            <WaitingBubble />
          ) : turn.items.length === 0 ? null : (
            turn.items.map((item) => <TurnItem key={item.id} item={item} />)
          )}
        </div>
      </div>
    </>
  );
}

// ---------- transcript 项渲染 ----------

function TurnItem({ item }: { item: FastclawTranscriptItem }) {
  switch (item.kind) {
    case "tool":
      return <FastclawToolCard item={item} />;
    case "progress":
      return <FastclawProgressRow item={item} />;
    case "assistant":
      return (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed">
          <ResearchMarkdown>{item.content}</ResearchMarkdown>
        </div>
      );
    case "system":
    case "user":
      return <p className="px-1 text-xs text-muted-foreground">{item.content}</p>;
    default:
      return null;
  }
}

function WaitingBubble() {
  const { t } = useI18n();
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {t("research.waiting")}
    </div>
  );
}

function ErrorBubble({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <span className="flex-1">{t("research.replyError", { message })}</span>
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
      <h2 className="text-lg font-semibold">{t("research.empty.title")}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t("research.empty.hint")}</p>
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

// ---------- Phase 徽章 ----------

function PhaseBadge({ phase }: { phase: ResearchPhase }) {
  const { t } = useI18n();
  const meta =
    phase === "streaming"
      ? {
          label: t("command.phase.streaming"),
          Icon: Loader2,
          tone: "border-primary/40 text-primary",
          spin: true,
        }
      : phase === "completed"
        ? {
            label: t("command.phase.completed"),
            Icon: Sparkles,
            tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
            spin: false,
          }
        : phase === "error"
          ? {
              label: t("command.phase.failed"),
              Icon: Sparkles,
              tone: "border-destructive/40 text-destructive",
              spin: false,
            }
          : {
              label: t("command.phase.idle"),
              Icon: Sparkles,
              tone: "border-border text-muted-foreground",
              spin: false,
            };
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${meta.tone}`}
    >
      <Icon className={`h-3.5 w-3.5 ${meta.spin ? "animate-spin" : ""}`} aria-hidden />
      {meta.label}
    </span>
  );
}

// ---------- 右侧会话上下文卡片 ----------

function SessionCard({
  phase,
  turnCount,
  toolCount,
  onReset,
  isBusy,
}: {
  phase: ResearchPhase;
  turnCount: number;
  toolCount: number;
  onReset: () => void;
  isBusy: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
        {t("research.panel.heading")}
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{t("research.panel.phase")}</dt>
          <dd className="font-medium">
            {phase === "streaming"
              ? t("command.phase.streaming")
              : phase === "completed"
                ? t("command.phase.completed")
                : phase === "error"
                  ? t("command.phase.failed")
                  : t("command.phase.idle")}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{t("research.panel.turns")}</dt>
          <dd className="font-medium">{turnCount}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{t("research.panel.tools")}</dt>
          <dd className="font-medium">{toolCount}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onReset}
        disabled={isBusy}
        className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("research.newSession")}
      </button>
    </div>
  );
}

// ---------- markdown（与分析页 AnalysisMarkdown 同款轻量样式） ----------

function ResearchMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 break-words text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h3 className="mt-1 text-base font-semibold" {...props} />,
          h2: (props) => <h4 className="mt-1 text-sm font-semibold" {...props} />,
          h3: (props) => <h5 className="mt-1 text-sm font-semibold" {...props} />,
          p: (props) => <p className="leading-relaxed" {...props} />,
          ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li className="leading-relaxed" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          a: ({ href, ...rest }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
              {...rest}
            />
          ),
          code: (props) => (
            <code
              className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[12px]"
              {...props}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
