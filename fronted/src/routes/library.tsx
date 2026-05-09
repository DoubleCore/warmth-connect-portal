import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { listPapers } from "@/api/papers";
import { ApiError } from "@/lib/api-client";
import type { PaperListItem } from "@/types/paper";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
});

const PAGE_SIZE = 10;

function LibraryPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const debouncedQuery = useDebounce(query, 300);
  const keyword = debouncedQuery.trim() || undefined;

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["papers", { keyword, page, pageSize: PAGE_SIZE }],
    queryFn: () => listPapers({ keyword, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = items.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = start === 0 ? 0 : start + items.length - 1;

  const rangeLabel =
    total === 0
      ? t("library.noMatch")
      : t("library.rangeLabel", { start, end, total });

  return (
    <Shell active="Library">
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <header>
          <h1 className="text-4xl font-semibold tracking-tight">{t("library.title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("library.subtitle")}</p>
        </header>

        <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <label htmlFor="library-search" className="sr-only">
              {t("library.searchLabel")}
            </label>
            <input
              id="library-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={t("library.searchPlaceholder")}
              className="w-full rounded-xl bg-transparent py-3 pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
              autoComplete="off"
            />
          </div>
          {isFetching && !isLoading && (
            <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("library.loading")}
            </div>
          )}
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border">
          <div
            className="grid grid-cols-[1fr_140px_120px_80px_80px] gap-4 border-b border-border bg-card/60 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
            role="row"
          >
            <div>{t("library.table.titleAuthors")}</div>
            <div>{t("library.table.domain")}</div>
            <div>{t("library.table.source")}</div>
            <div>{t("library.table.year")}</div>
            <div className="text-right">{t("library.table.actions")}</div>
          </div>

          {isLoading ? (
            <LoadingRow text={t("library.loading")} />
          ) : isError ? (
            <ErrorRow
              text={t("library.loadError", { message: getErrorMessage(error) })}
              retryLabel={t("library.retry")}
              onRetry={() => refetch()}
            />
          ) : items.length === 0 ? (
            <div className="grid place-items-center gap-2 bg-card px-6 py-16 text-center">
              <div className="text-sm font-medium">{t("library.emptyTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("library.emptyHint")}</div>
            </div>
          ) : (
            items.map((p) => <PaperRow key={p.id} paper={p} etAlLabel={t("library.etAl")} openLabel={t("library.table.open")} />)
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{rangeLabel}</div>
          <nav className="flex items-center gap-2" aria-label={t("library.pagination.label")}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              aria-label={t("library.pagination.previous")}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                aria-current={safePage === n ? "page" : undefined}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-lg border text-sm transition-colors",
                  safePage === n
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              aria-label={t("library.pagination.next")}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </nav>
        </div>
      </div>
    </Shell>
  );
}

function PaperRow({
  paper,
  etAlLabel,
  openLabel,
}: {
  paper: PaperListItem;
  etAlLabel: string;
  openLabel: string;
}) {
  return (
    <Link
      to="/library/$paperId"
      params={{ paperId: paper.id }}
      className="grid grid-cols-[1fr_140px_120px_80px_80px] items-center gap-4 border-b border-border bg-card px-6 py-4 transition-colors last:border-0 hover:bg-secondary/40"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[oklch(0.35_0.15_25)]/30 text-[oklch(0.78_0.18_30)]">
          <FileText className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium">{paper.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {paper.authors[0] ?? "—"}
            {paper.authors.length > 1 ? etAlLabel : ""}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {paper.field ? (
          <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/30">
            {paper.field}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </div>
      <div className="text-sm text-muted-foreground">{paper.source ?? "—"}</div>
      <div className="text-sm text-muted-foreground">{paper.publishedYear ?? "—"}</div>
      <div className="text-right">
        <span className="text-xs text-primary hover:underline">{openLabel}</span>
      </div>
    </Link>
  );
}

function LoadingRow({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 bg-card px-6 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {text}
    </div>
  );
}

function ErrorRow({
  text,
  retryLabel,
  onRetry,
}: {
  text: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="grid place-items-center gap-3 bg-card px-6 py-16 text-center">
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {text}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-secondary"
      >
        {retryLabel}
      </button>
    </div>
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
