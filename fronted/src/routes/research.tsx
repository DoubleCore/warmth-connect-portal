import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  Download,
  Hammer,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { ChatMarkdown } from "@/components/hermes/ChatMarkdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import {
  useFastClawResearch,
  type FastClawResearchConfirmation,
  type FastClawResearchTranscriptItem,
} from "@/hooks/use-fastclaw-research";
import type { CommandRuntimePhase, CommandStreamEvent } from "@/types/command";

/**
 * FastClaw 论文搜索助手的"研究会话"子页面。
 *
 * UI 与 /search 页面对齐：顶部自定义 header、左侧对话气泡流、右侧上下文面板、
 * 底部药丸输入条。数据源来自 FastClaw researcher/search agent。
 *
 * 每一轮对话由两个气泡组成：
 *   1. AgentAvatar + 用户原始输入（镜像 /search 的排版）
 *   2. UserAvatar + FastClaw 的回答 / 工具过程 / 最终结果（按顺序渲染事件流）
 *
 * 右侧三个卡片：
 *   - Current Command: phase / commandId / 最近工具
 *   - Live Stream:     实时事件计数和最近一条动态
 *   - Execution:       runId / 会话长度 / reset / new session
 */
export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research — FastClaw" },
      {
        name: "description",
        content: "Follow the FastClaw paper research agent through a live session.",
      },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  const { t } = useI18n();
  const command = useFastClawResearch();
  const [draft, setDraft] = useState("");

  const isBusy =
    command.phase === "connecting" ||
    command.phase === "streaming" ||
    command.phase === "awaiting_confirmation";

  // 把 transcript 按 user 消息聚合成一轮一轮：每遇到一个 kind === "user"
  // 就开一轮，后续所有 event 都归属当前轮，直到遇到下一条 user 为止。
  // 这个结构让渲染层能把每轮做成"提问 → 回答"的两行气泡。
  const turns = useMemo(() => groupTurns(command.transcript), [command.transcript]);

  // 最近一条事件，给右侧"当前动态"摘要用
  const latestEvent = useMemo(() => {
    for (let i = command.transcript.length - 1; i >= 0; i -= 1) {
      const item = command.transcript[i];
      if (item.kind === "event") return item.event;
    }
    return null;
  }, [command.transcript]);

  // 最近一次工具调用（用于 Current Command 卡片）
  const latestTool = useMemo(() => {
    for (let i = command.transcript.length - 1; i >= 0; i -= 1) {
      const item = command.transcript[i];
      if (item.kind !== "event") continue;
      if (item.event.type === "tool_start" || item.event.type === "tool_result") {
        return item.event.type === "tool_start"
          ? item.event.displayName || item.event.toolName
          : item.event.toolName;
      }
    }
    return null;
  }, [command.transcript]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [command.transcript.length, command.pendingConfirmation, command.error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v || isBusy) return;
    setDraft("");
    await command.run(v);
  };

  return (
    <Shell active="None">
      {/* 镜像 /search：Shell TopBar 之下再开一条页面自己的 header */}
      <div className="flex h-[calc(100vh-69px)] flex-col">
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
            <PhaseBadge phase={command.phase} />
            {/*
             * New Session：清掉 sessionIdRef 和 transcript，下一次 run() 重新
             * 新建 FastClaw 论文搜索会话。busy 时禁用，避免半途打断。
             */}
            <button
              type="button"
              onClick={command.newSession}
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

        {/* 主体双栏：左对话，右上下文面板 */}
        <div className="flex min-h-0 flex-1 gap-6 px-6 pt-6">
          {/* 左：对话流 */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto pr-2">
              {turns.length === 0 ? (
                <EmptyConversation />
              ) : (
                turns.map((turn, idx) => (
                  <ConversationTurn
                    key={turn.userId ?? `turn-${idx}`}
                    turn={turn}
                    isLast={idx === turns.length - 1}
                    phase={command.phase}
                  />
                ))
              )}

              {command.pendingConfirmation ? (
                <ConfirmationCard
                  confirmation={command.pendingConfirmation}
                  onConfirm={() => void command.respondConfirmation("confirm")}
                  onCancel={() => void command.respondConfirmation("cancel")}
                />
              ) : null}

              {command.error ? <ErrorBubble error={command.error} /> : null}
            </div>

            {/* 底部药丸输入条（镜像 /search） */}
            <form
              onSubmit={handleSubmit}
              className="mb-6 mt-4 flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3"
            >
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <label htmlFor="research-chat-input" className="sr-only">
                {t("research.followupLabel")}
              </label>
              <input
                id="research-chat-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  isBusy ? t("command.inputPlaceholderBusy") : t("research.followupPlaceholder")
                }
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                autoComplete="off"
                disabled={isBusy}
              />
              {/* Paperclip 是视觉占位：Command Center 目前不支持附件上传 */}
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
          </div>

          {/* 右：当前命令 / 事件流 / 执行上下文 */}
          <aside className="hidden w-[360px] shrink-0 space-y-4 overflow-y-auto border-l border-border pl-6 pb-6 lg:block">
            <CurrentCommandCard
              phase={command.phase}
              commandId={command.currentCommandId}
              latestTool={latestTool}
            />
            <LiveStreamCard
              phase={command.phase}
              latestEvent={latestEvent}
              totalEvents={command.transcript.filter((i) => i.kind === "event").length}
            />
            <ExecutionCard
              turnCount={turns.length}
              onReset={command.reset}
              onNewSession={command.newSession}
              isBusy={isBusy}
            />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

// ---------- Turn 聚合 ----------

type ConversationTurnData = {
  /** 用户 transcript 条目的 id，用作 React key；未配对用户消息时可能为 null。 */
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
    // 事件到达但还没见过 user 消息——挂在一个"匿名"轮上，避免孤儿事件被丢掉
    if (!current) {
      current = { userId: null, userMessage: null, events: [] };
      turns.push(current);
    }
    current.events.push(item);
  }
  return turns;
}

// ---------- 对话单轮 ----------

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
      {/* 第一行：用户问（镜像 /search 的 AgentAvatar + query 排版） */}
      {turn.userMessage !== null ? (
        <div className="flex items-start gap-3">
          <AgentAvatar />
          <div className="flex-1 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {turn.userMessage}
          </div>
        </div>
      ) : null}

      {/* 第二行：助手（FastClaw）回答，按事件顺序渲染 */}
      <div className="flex items-start gap-3">
        <UserAvatar />
        <div className="flex-1 space-y-3">
          {showSpinner ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("command.waitingFirstEvent")}
            </div>
          ) : turn.events.length === 0 ? null : (
            turn.events.map((item) => <EventBubble key={item.id} event={item.event} />)
          )}
        </div>
      </div>
    </>
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

// ---------- 事件气泡 ----------

/**
 * 每个 CommandStreamEvent 渲染成一个独立气泡。不同类型用不同样式和图标，
 * markdown 只在 agent_message / thinking / final 里启用，工具事件保持纯文本。
 */
function EventBubble({ event }: { event: CommandStreamEvent }) {
  const { t } = useI18n();
  switch (event.type) {
    case "thinking":
      return (
        <BubbleShell tone="muted">
          <BubbleIcon Icon={Loader2} spin tone="muted" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("command.phase.streaming")}
            </div>
            <ChatMarkdown>{event.message || t("command.event.agentEmpty")}</ChatMarkdown>
          </div>
        </BubbleShell>
      );
    case "agent_message":
      return (
        <BubbleShell tone="default">
          <BubbleIcon Icon={Bot} tone="default" />
          <div className="min-w-0 flex-1">
            <ChatMarkdown>{event.message || t("command.event.agentEmpty")}</ChatMarkdown>
          </div>
        </BubbleShell>
      );
    case "tool_start":
      return (
        <BubbleShell tone="primary">
          <BubbleIcon Icon={Hammer} tone="primary" />
          <div className="min-w-0 flex-1 text-sm">
            {t("command.event.toolStart", {
              name: event.displayName || event.toolName,
            })}
          </div>
        </BubbleShell>
      );
    case "tool_result":
      return (
        <BubbleShell tone="primary">
          <BubbleIcon Icon={CheckCircle2} tone="primary" />
          <div className="min-w-0 flex-1 text-sm">
            {t("command.event.toolResult", {
              name: event.toolName,
              summary: event.summary,
            })}
          </div>
        </BubbleShell>
      );
    case "need_confirmation":
      // 详细的确认卡片由 ConfirmationCard 独立渲染；这里只留个占位让用户
      // 知道此处被挂起了
      return (
        <BubbleShell tone="amber">
          <BubbleIcon Icon={ShieldAlert} tone="amber" />
          <div className="min-w-0 flex-1 text-sm">
            {t("command.event.needConfirmationInline", {
              message: event.message || t("command.event.needConfirmationFallback"),
            })}
          </div>
        </BubbleShell>
      );
    case "final":
      return <FinalBubble event={event} />;
    case "error":
      return (
        <BubbleShell tone="destructive">
          <BubbleIcon Icon={AlertTriangle} tone="destructive" />
          <div className="min-w-0 flex-1 text-sm text-destructive">
            {t("command.event.errorInline", { message: event.message })}
          </div>
        </BubbleShell>
      );
  }
}

/**
 * Final 事件：强调样式（绿色/灰色根据是否 cancelled），result 里的 output 与
 * message 去重，只展示 leftover（usage 等元数据）作为 JSON 预览。
 */
function FinalBubble({ event }: { event: Extract<CommandStreamEvent, { type: "final" }> }) {
  const { t } = useI18n();
  const result = event.result;
  const isCancelled =
    typeof result === "object" &&
    result !== null &&
    (result as { status?: string }).status === "cancelled";

  const headline =
    event.message ??
    (isCancelled ? t("command.event.finalCancelled") : t("command.event.finalDefault"));
  const leftover = extractLeftover(result, event.message);

  return (
    <BubbleShell tone={isCancelled ? "muted" : "success"}>
      <BubbleIcon
        Icon={isCancelled ? CircleDashed : CheckCircle2}
        tone={isCancelled ? "muted" : "success"}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <ChatMarkdown>{headline}</ChatMarkdown>
        {leftover !== undefined ? <ResultPreview value={leftover} /> : null}
      </div>
    </BubbleShell>
  );
}

type BubbleTone = "default" | "muted" | "primary" | "amber" | "destructive" | "success";

function BubbleShell({ tone, children }: { tone: BubbleTone; children: React.ReactNode }) {
  const bg =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "amber"
        ? "border-amber-500/40 bg-amber-500/5"
        : tone === "success"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : tone === "primary"
            ? "border-primary/30 bg-primary/5"
            : tone === "muted"
              ? "border-border bg-card/60"
              : "border-border bg-card";
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", bg)}>{children}</div>
  );
}

function BubbleIcon({
  Icon,
  tone,
  spin,
}: {
  Icon: typeof Loader2;
  tone: BubbleTone;
  spin?: boolean;
}) {
  const bg =
    tone === "destructive"
      ? "bg-destructive/15 text-destructive"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : tone === "success"
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : tone === "primary"
            ? "bg-primary/15 text-primary"
            : "bg-secondary text-muted-foreground";
  return (
    <span
      className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", bg)}
      aria-hidden
    >
      <Icon className={cn("h-3.5 w-3.5", spin && "animate-spin")} />
    </span>
  );
}

function extractLeftover(result: unknown, headline: string | undefined): unknown {
  if (result === null || result === undefined) return undefined;
  if (typeof result === "string") {
    return result === headline ? undefined : result;
  }
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    // usage（token 计数）对用户没用，扣掉
    const { usage: _usage, ...rest } = r;
    if (typeof rest.output === "string" && rest.output === headline) {
      delete (rest as Record<string, unknown>).output;
    }
    const remaining = Object.entries(rest).filter(([, v]) => v !== null && v !== undefined);
    return remaining.length > 0 ? Object.fromEntries(remaining) : undefined;
  }
  return result;
}

function ResultPreview({ value }: { value: unknown }) {
  const pretty = safeStringify(value);
  if (!pretty) return null;
  return (
    <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-secondary/60 p-2 text-xs leading-relaxed">
      {pretty}
    </pre>
  );
}

function safeStringify(v: unknown): string | null {
  try {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return v;
    return JSON.stringify(v, null, 2);
  } catch {
    return null;
  }
}

// ---------- Phase 徽章 ----------

function PhaseBadge({ phase }: { phase: CommandRuntimePhase }) {
  const { t } = useI18n();
  const meta = phaseMeta(phase, t);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        meta.tone,
      )}
    >
      <meta.Icon className={cn("h-3.5 w-3.5", meta.spin && "animate-spin")} aria-hidden />
      {meta.label}
    </span>
  );
}

function phaseMeta(
  phase: CommandRuntimePhase,
  t: (k: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string,
): { label: string; Icon: typeof Loader2; tone: string; spin: boolean } {
  switch (phase) {
    case "idle":
      return {
        label: t("command.phase.idle"),
        Icon: Sparkles,
        tone: "border-border text-muted-foreground",
        spin: false,
      };
    case "connecting":
    case "streaming":
      return {
        label:
          phase === "connecting" ? t("command.phase.connecting") : t("command.phase.streaming"),
        Icon: Loader2,
        tone: "border-primary/40 text-primary",
        spin: true,
      };
    case "awaiting_confirmation":
      return {
        label: t("command.phase.awaitingConfirmation"),
        Icon: ShieldAlert,
        tone: "border-amber-500/40 text-amber-600 dark:text-amber-400",
        spin: false,
      };
    case "completed":
      return {
        label: t("command.phase.completed"),
        Icon: CheckCircle2,
        tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        spin: false,
      };
    case "failed":
      return {
        label: t("command.phase.failed"),
        Icon: XCircle,
        tone: "border-destructive/40 text-destructive",
        spin: false,
      };
    case "cancelled":
      return {
        label: t("command.phase.cancelled"),
        Icon: CircleDashed,
        tone: "border-border text-muted-foreground",
        spin: false,
      };
  }
}

// ---------- Confirmation / Error ----------

function ConfirmationCard({
  confirmation,
  onConfirm,
  onCancel,
}: {
  confirmation: FastClawResearchConfirmation;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t("command.confirmation.title")}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {confirmation.message || t("command.confirmation.fallback")}
          </div>
          {confirmation.payload ? <ResultPreview value={confirmation.payload} /> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onConfirm}>
              {t("command.confirmation.confirm")}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              {t("command.confirmation.cancel")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBubble({ error }: { error: { code?: string; message: string } }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium text-destructive">{t("command.error.title")}</div>
        <div className="mt-1 text-destructive">{error.message}</div>
        {error.code ? (
          <div className="mt-1 text-xs text-destructive/80">
            {t("command.error.code", { code: error.code })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- 右侧面板 ----------

function CurrentCommandCard({
  phase,
  commandId,
  latestTool,
}: {
  phase: CommandRuntimePhase;
  commandId: string | null;
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
          {t("research.panels.currentCommand")}
        </span>
        <h3 className="text-base font-semibold leading-snug">{phaseMeta(phase, t).label}</h3>
        <div className="flex flex-wrap gap-2">
          {commandId ? (
            <Tag>
              <span className="font-mono text-[10px]">{commandId.slice(0, 8)}</span>
            </Tag>
          ) : (
            <Tag>{t("research.panels.noCommand")}</Tag>
          )}
          {latestTool ? <Tag>{latestTool}</Tag> : null}
        </div>
      </div>
    </div>
  );
}

function LiveStreamCard({
  phase,
  latestEvent,
  totalEvents,
}: {
  phase: CommandRuntimePhase;
  latestEvent: CommandStreamEvent | null;
  totalEvents: number;
}) {
  const { t } = useI18n();
  const latestSummary = latestEvent ? summarizeEvent(latestEvent, t) : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("research.panels.liveStream")}
        </span>
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            phase === "streaming" || phase === "connecting"
              ? "bg-[oklch(0.74_0.18_155)]"
              : "bg-muted-foreground/40",
          )}
          aria-hidden
        />
      </div>
      <div className="mt-4 text-xs text-muted-foreground">
        {t("research.panels.eventCount", { count: totalEvents })}
      </div>
      <div className="mt-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-sm">
        {latestSummary ?? (
          <span className="text-muted-foreground">{t("research.panels.noEvents")}</span>
        )}
      </div>
    </div>
  );
}

function ExecutionCard({
  turnCount,
  onReset,
  onNewSession,
  isBusy,
}: {
  turnCount: number;
  onReset: () => void;
  onNewSession: () => void;
  isBusy: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t("research.panels.execution")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetaCell label={t("research.panels.turns")} value={String(turnCount)} />
        <MetaCell label={t("research.panels.channel")} value="SSE" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onReset}
          disabled={isBusy || turnCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {t("command.reset")}
        </button>
        <button
          type="button"
          onClick={onNewSession}
          disabled={isBusy}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("research.newSession")}
        </button>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm tabular-nums">{value}</div>
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

// ---------- 摘要 ----------

function summarizeEvent(
  event: CommandStreamEvent,
  t: (
    k: Parameters<ReturnType<typeof useI18n>["t"]>[0],
    v?: Record<string, string | number>,
  ) => string,
): string {
  switch (event.type) {
    case "thinking":
      return event.message || t("command.phase.streaming");
    case "agent_message":
      return event.message || t("command.event.agentEmpty");
    case "tool_start":
      return t("command.event.toolStart", {
        name: event.displayName || event.toolName,
      });
    case "tool_result":
      return t("command.event.toolResult", {
        name: event.toolName,
        summary: event.summary,
      });
    case "need_confirmation":
      return t("command.event.needConfirmationInline", {
        message: event.message || t("command.event.needConfirmationFallback"),
      });
    case "final":
      return event.message ?? t("command.event.finalDefault");
    case "error":
      return t("command.event.errorInline", { message: event.message });
  }
}
