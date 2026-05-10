import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  Hammer,
  Loader2,
  ShieldAlert,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { CommandRuntimePhase, CommandStreamEvent } from "@/types/command";
import type { ActiveConfirmation, CommandTranscriptItem } from "@/hooks/use-command-stream";

/**
 * Command Center 的结果面板：按顺序渲染 user 消息、Agent 事件、最终结果和确认卡片。
 * 仅负责展示；状态与交互都由 CommandPrompt 通过 props 传进来。
 */
export function CommandConversation({
  phase,
  transcript,
  pendingConfirmation,
  error,
  onConfirm,
  onCancel,
  onReset,
}: {
  phase: CommandRuntimePhase;
  transcript: CommandTranscriptItem[];
  pendingConfirmation: ActiveConfirmation | null;
  error: { code?: string; message: string } | null;
  onConfirm: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 新事件到来时自动滚底。只在事件数变化时滚，避免 phase-only 变化时重复滚动。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript.length, pendingConfirmation, error]);

  const showReset = phase === "completed" || phase === "failed" || phase === "cancelled";

  return (
    <section className="mt-8" aria-live="polite">
      <div className="flex items-center justify-between pb-3">
        <PhaseBadge phase={phase} />
        {showReset ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            {t("command.reset")}
          </Button>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="max-h-[30rem] space-y-3 overflow-y-auto rounded-2xl border border-border bg-card/40 p-4"
      >
        {transcript.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleDashed className="h-4 w-4 animate-pulse" aria-hidden />
            {t("command.waitingFirstEvent")}
          </div>
        ) : (
          transcript.map((item) =>
            item.kind === "user" ? (
              <UserBubble key={item.id} message={item.message} />
            ) : (
              <EventRow key={item.id} event={item.event} />
            ),
          )
        )}

        {pendingConfirmation ? (
          <ConfirmationCard
            confirmation={pendingConfirmation}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        ) : null}

        {error ? <ErrorRow error={error} /> : null}
      </div>
    </section>
  );
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
      return {
        label: t("command.phase.connecting"),
        Icon: Loader2,
        tone: "border-primary/40 text-primary",
        spin: true,
      };
    case "streaming":
      return {
        label: t("command.phase.streaming"),
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

// ---------- Transcript rows ----------

function UserBubble({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <User className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 rounded-xl bg-primary/10 px-3 py-2 text-sm">{message}</div>
    </div>
  );
}

function EventRow({ event }: { event: CommandStreamEvent }) {
  const { t } = useI18n();

  switch (event.type) {
    case "thinking":
    case "agent_message":
      return (
        <AgentRow
          Icon={event.type === "thinking" ? Loader2 : Bot}
          spin={event.type === "thinking"}
          text={event.message || t("command.event.agentEmpty")}
        />
      );
    case "tool_start":
      return (
        <AgentRow
          Icon={Hammer}
          text={t("command.event.toolStart", {
            name: event.displayName || event.toolName,
          })}
        />
      );
    case "tool_result":
      return (
        <AgentRow
          Icon={CheckCircle2}
          text={t("command.event.toolResult", {
            name: event.toolName,
            summary: event.summary,
          })}
        />
      );
    case "need_confirmation":
      // 需求卡片由 ConfirmationCard 单独渲染；transcript 里留一个标记让用户知道此处挂起
      return (
        <AgentRow
          Icon={ShieldAlert}
          tone="amber"
          text={t("command.event.needConfirmationInline", {
            message: event.message || t("command.event.needConfirmationFallback"),
          })}
        />
      );
    case "final":
      return <FinalRow event={event} />;
    case "error":
      return (
        <AgentRow
          Icon={AlertTriangle}
          tone="destructive"
          text={t("command.event.errorInline", {
            message: event.message,
          })}
        />
      );
  }
}

function AgentRow({
  Icon,
  text,
  spin,
  tone,
}: {
  Icon: typeof Loader2;
  text: string;
  spin?: boolean;
  tone?: "amber" | "destructive";
}) {
  const iconTone =
    tone === "destructive"
      ? "bg-destructive/15 text-destructive"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-secondary text-muted-foreground";

  const textTone =
    tone === "destructive"
      ? "text-destructive"
      : tone === "amber"
        ? "text-foreground"
        : "text-foreground";

  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          iconTone,
        )}
      >
        <Icon className={cn("h-4 w-4", spin && "animate-spin")} aria-hidden />
      </span>
      <div className={cn("min-w-0 flex-1 rounded-xl bg-background px-3 py-2 text-sm", textTone)}>
        {text}
      </div>
    </div>
  );
}

function FinalRow({ event }: { event: Extract<CommandStreamEvent, { type: "final" }> }) {
  const { t } = useI18n();
  const result = event.result;
  const isCancelled =
    typeof result === "object" &&
    result !== null &&
    (result as { status?: string }).status === "cancelled";

  const headline =
    event.message ??
    (isCancelled ? t("command.event.finalCancelled") : t("command.event.finalDefault"));

  const Icon = isCancelled ? CircleDashed : CheckCircle2;
  const iconTone = isCancelled
    ? "bg-secondary text-muted-foreground"
    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";

  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          iconTone,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm">
        <div className="font-medium">{headline}</div>
        {result ? <ResultPreview value={result} /> : null}
      </div>
    </div>
  );
}

function ResultPreview({ value }: { value: unknown }) {
  // 简单的 JSON 预览。大多数情况下这就是 Hermes 返回的结构化结果，没必要做专门的 UI。
  const pretty = safeStringify(value);
  if (!pretty) return null;
  return (
    <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-secondary/60 p-2 text-xs leading-relaxed">
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

// ---------- Confirmation card ----------

function ConfirmationCard({
  confirmation,
  onConfirm,
  onCancel,
}: {
  confirmation: ActiveConfirmation;
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

// ---------- Error ----------

function ErrorRow({ error }: { error: { code?: string; message: string } }) {
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
