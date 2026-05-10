import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  CornerDownLeft,
  Search,
  FileText,
  MessageSquare,
  Cpu,
  Loader2,
  AlertTriangle,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { ApiError, isNetworkError } from "@/lib/api-client";
import { listPapers } from "@/api/papers";
import { listReproductionRecords } from "@/api/reproduction";
import type { PaperListItem } from "@/types/paper";
import type { ReproductionRecord, ReproductionStatus } from "@/types/reproduction";

const RECENT_PAPERS_LIMIT = 3;
const RECENT_RECORDS_LIMIT = 2;

const quickActions = [
  { labelKey: "home.quickAction.searchPapers", icon: Search, to: "/search" as const },
  { labelKey: "home.quickAction.analyzePdf", icon: FileText, to: "/library" as const },
  { labelKey: "home.quickAction.ragChat", icon: MessageSquare, to: "/search" as const },
  { labelKey: "home.quickAction.manageTraining", icon: Cpu, to: "/workspace" as const },
] as const satisfies readonly {
  labelKey: MessageKey;
  icon: typeof Search;
  to: string;
}[];

const statusLabelKey: Record<ReproductionStatus, MessageKey> = {
  not_started: "repro.status.not_started",
  running: "repro.status.running",
  success: "repro.status.success",
  failed: "repro.status.failed",
  paused: "repro.status.paused",
};

const statusAccent: Record<ReproductionStatus, string> = {
  not_started: "text-muted-foreground",
  running: "text-primary",
  success: "text-[oklch(0.74_0.18_155)]",
  failed: "text-destructive",
  paused: "text-muted-foreground",
};

export function CommandPrompt() {
  const [value, setValue] = useState("");
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    navigate({ to: "/search", search: { q: trimmed } });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-14">
      <div className="text-center">
        <h2 className="text-5xl font-semibold tracking-tight">{t("home.title")}</h2>
        <p className="mt-4 text-muted-foreground">{t("home.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-10 group relative" role="search">
        <div
          className="absolute -inset-px rounded-2xl opacity-60 blur-md transition-opacity group-focus-within:opacity-100"
          style={{ background: "var(--gradient-primary)" }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <label htmlFor="command-prompt" className="sr-only">
            {t("home.inputLabel")}
          </label>
          <input
            id="command-prompt"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("home.inputPlaceholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
          />
          <button
            type="submit"
            aria-label={t("home.submit")}
            className="rounded-lg bg-secondary p-2 text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
            disabled={!value.trim()}
          >
            <CornerDownLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </form>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {quickActions.map(({ labelKey, icon: Icon, to }) => (
          <Link
            key={labelKey}
            to={to}
            className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-6 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-glow)]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm font-medium">{t(labelKey)}</span>
          </Link>
        ))}
      </div>

      <RecentActivity />
    </div>
  );
}

function RecentActivity() {
  const { t } = useI18n();

  const papersQuery = useQuery({
    queryKey: ["papers", { page: 1, pageSize: RECENT_PAPERS_LIMIT }],
    queryFn: () => listPapers({ page: 1, pageSize: RECENT_PAPERS_LIMIT }),
  });
  const recordsQuery = useQuery({
    queryKey: ["reproduction-records"],
    queryFn: listReproductionRecords,
  });

  const isLoading = papersQuery.isLoading || recordsQuery.isLoading;
  // Treat transport-level failures (backend offline, CORS blocked, etc.) the
  // same as an empty dataset instead of showing a red error banner.
  const papersErr = papersQuery.error;
  const recordsErr = recordsQuery.error;
  const hasNetworkErr =
    (papersQuery.isError && isNetworkError(papersErr)) ||
    (recordsQuery.isError && isNetworkError(recordsErr));
  const hasRealError =
    (papersQuery.isError && !isNetworkError(papersErr)) ||
    (recordsQuery.isError && !isNetworkError(recordsErr));
  const errorObj = (!isNetworkError(papersErr) && papersErr) || recordsErr;

  const papers = papersQuery.data?.items.slice(0, RECENT_PAPERS_LIMIT) ?? [];
  const records = recordsQuery.data?.items.slice(0, RECENT_RECORDS_LIMIT) ?? [];
  const isEmpty = papers.length === 0 && records.length === 0;

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("home.recentHeading")}</h3>
        <Link to="/library" className="text-sm text-primary hover:underline">
          {t("common.viewAll")}
        </Link>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {isLoading ? (
          <SkeletonRows count={3} />
        ) : hasRealError ? (
          <ErrorCard
            message={t("home.recent.loadError", { message: errMsg(errorObj) })}
            retryLabel={t("home.recent.retry")}
            onRetry={() => {
              void papersQuery.refetch();
              void recordsQuery.refetch();
            }}
          />
        ) : isEmpty || hasNetworkErr ? (
          <EmptyCard text={t("home.recent.empty")} />
        ) : (
          <>
            {papers.map((p) => (
              <PaperCard key={`paper-${p.id}`} paper={p} />
            ))}
            {records.map((r) => (
              <RecordCard key={`record-${r.id}`} record={r} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function PaperCard({ paper }: { paper: PaperListItem }) {
  const { t } = useI18n();
  const firstAuthor = paper.authors[0] ?? t("home.recent.unknownAuthor");
  const yearPart =
    paper.publishedYear !== null ? String(paper.publishedYear) : (paper.source ?? "—");

  return (
    <Link
      to="/library/$paperId"
      params={{ paperId: paper.id }}
      className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40"
    >
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{paper.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {t("home.recent.paperMeta", {
            authors:
              firstAuthor + (paper.authors.length > 1 ? t("library.etAl") : ""),
            year: yearPart,
          })}
        </div>
      </div>
      <Tag>{t("home.recent.tag.paper")}</Tag>
    </Link>
  );
}

function RecordCard({ record }: { record: ReproductionRecord }) {
  const { t } = useI18n();
  const accent = statusAccent[record.status];
  return (
    <Link
      to="/workspace"
      className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40"
    >
      <FlaskConical className={cn("h-5 w-5 shrink-0", accent)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{record.paper.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {t("home.recent.recordMeta", {
            status: t(statusLabelKey[record.status]),
            progress: record.progress,
          })}
        </div>
      </div>
      <Tag>{t("common.task")}</Tag>
    </Link>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4"
        >
          <div className="h-5 w-5 shrink-0 animate-pulse rounded-sm bg-muted" aria-hidden />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" aria-hidden />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted/70" aria-hidden />
          </div>
        </div>
      ))}
    </>
  );
}

function ErrorCard({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-secondary"
      >
        {retryLabel}
      </button>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-5 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 shrink-0 opacity-40" aria-hidden />
      {text}
    </div>
  );
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
