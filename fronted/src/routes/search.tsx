import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, CornerDownLeft, BookOpen, Database, Quote, Loader2 } from "lucide-react";
import { z } from "zod";
import { Shell } from "@/components/hermes/Shell";
import { useDebounce } from "@/hooks/use-debounce";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { getRagScope, searchRagPapers } from "@/api/rag";
import { ApiError } from "@/lib/api-client";

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "RAG Search — Hermes AI" },
      { name: "description", content: "Semantic retrieval across the global research corpus." },
    ],
  }),
  component: RagSearchPage,
});

const recents = [
  "Attention mechanism bounds",
  "MoE routing stability",
  "KV cache compression",
];

function RagSearchPage() {
  const { t } = useI18n();
  const { q: urlQuery } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [q, setQ] = useState(urlQuery ?? "");
  const debouncedQ = useDebounce(q, 400);

  // Keep URL in sync with debounced query (shareable deep links).
  useEffect(() => {
    const trimmed = debouncedQ.trim();
    navigate({
      search: (prev) => ({ ...prev, q: trimmed ? trimmed : undefined }),
      replace: true,
    });
  }, [debouncedQ, navigate]);

  const trimmedQ = debouncedQ.trim();
  const searchQuery = useQuery({
    queryKey: ["rag-search", trimmedQ] as const,
    queryFn: () => searchRagPapers(trimmedQ, 10),
    enabled: trimmedQ.length > 0,
    // Empty query = stale-while-empty; don't retry on user-caused 400.
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 400) return false;
      return failureCount < 2;
    },
  });

  // Scope card is independent of the query; one fetch on mount is enough.
  const scopeQuery = useQuery({
    queryKey: ["rag-scope"] as const,
    queryFn: getRagScope,
    staleTime: 5 * 60_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>("input")?.blur();
  };

  const results = searchQuery.data?.items ?? [];

  return (
    <Shell active="None">
      <div className="mx-auto w-full max-w-7xl px-8 py-12">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-semibold tracking-tight">{t("search.pageTitle")}</h1>
          <p className="mt-4 text-muted-foreground">{t("search.pageSubtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-3xl" role="search">
          <div className="group relative">
            <div
              className="absolute -inset-px rounded-2xl opacity-60 blur-md transition-opacity group-focus-within:opacity-100"
              style={{ background: "var(--gradient-primary)" }}
              aria-hidden
            />
            <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
              <Search className="h-5 w-5 text-primary" aria-hidden />
              <label htmlFor="rag-query" className="sr-only">
                {t("search.inputLabel")}
              </label>
              <input
                id="rag-query"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={t("search.inputPlaceholder")}
                autoComplete="off"
              />
              <button
                type="submit"
                aria-label={t("search.submit")}
                className="rounded-lg bg-secondary p-2 text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                disabled={!q.trim()}
              >
                <CornerDownLeft className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("search.recent")}
            </span>
            {recents.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setQ(r)}
                className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {r}
              </button>
            ))}
          </div>
        </form>

        <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_300px]">
          <section>
            <div className="flex items-end justify-between">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t("search.resultsHeading")}
              </h2>
              <span className="text-sm text-muted-foreground">
                {t("search.resultsCount", { count: results.length })}
              </span>
            </div>

            <ResultsList
              isEnabled={trimmedQ.length > 0}
              isLoading={searchQuery.isLoading || searchQuery.isFetching}
              isError={searchQuery.isError}
              error={searchQuery.error}
              items={results}
            />
          </section>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <ScopeCard
              papersIndexed={scopeQuery.data?.papersIndexed}
              totalAbstractChars={scopeQuery.data?.totalAbstractChars}
              isLoading={scopeQuery.isLoading}
            />
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function ResultsList({
  isEnabled,
  isLoading,
  isError,
  error,
  items,
}: {
  isEnabled: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  items: Array<{
    id: number;
    title: string;
    authors: string[];
    venue: string | null;
    score: number;
    excerpt: string;
  }>;
}) {
  const { t } = useI18n();

  if (!isEnabled) {
    return (
      <EmptyCard
        title={t("search.empty.title")}
        hint={t("search.empty.hint")}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="mt-5 flex items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 p-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("workspace.loading")}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyCard
        title={t("search.empty.title")}
        hint={t("library.loadError", { message: getErrorMessage(error) })}
      />
    );
  }

  if (items.length === 0) {
    return <EmptyCard title={t("search.empty.title")} hint={t("search.empty.hint")} />;
  }

  return (
    <div className="mt-5 flex flex-col gap-5">
      {items.map((r) => (
        <article
          key={r.id}
          className="rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-[var(--shadow-glow)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold leading-snug text-primary hover:underline">
                {r.title}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-mono text-muted-foreground">
                  {r.authors.length > 0 ? r.authors.join(", ") : "—"}
                </span>
                {r.venue && (
                  <>
                    <span className="text-muted-foreground" aria-hidden>
                      •
                    </span>
                    <span className="font-mono text-muted-foreground">{r.venue}</span>
                  </>
                )}
                <span className="text-muted-foreground" aria-hidden>
                  •
                </span>
                <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {t("search.relevance", { value: r.score.toFixed(2) })}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-primary-foreground transition-transform hover:scale-105"
              style={{ background: "var(--gradient-primary)" }}
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> {t("search.viewSource")}
            </button>
          </div>
          <blockquote className="mt-4 rounded-xl border-l-2 border-primary/60 bg-secondary/40 p-4 text-sm leading-relaxed text-muted-foreground">
            <Quote className="mb-2 h-4 w-4 text-primary/60" aria-hidden />
            {/* Backend-rendered <mark> from FTS5 snippet(); content is derived
                from our own seeded text, not user input. Still sanitize the
                tag set by stripping anything that isn't <mark>. */}
            <span dangerouslySetInnerHTML={{ __html: sanitizeExcerpt(r.excerpt) }} />
          </blockquote>
        </article>
      ))}
    </div>
  );
}

/**
 * FTS5 snippet() only emits the `<mark>` / `</mark>` tags we specified. But we
 * still pass any abstract text the backend produced. Scrub defensively so a
 * mis-seeded abstract with raw HTML cannot inject arbitrary markup.
 */
function sanitizeExcerpt(html: string): string {
  // Escape everything first, then re-allow <mark>...</mark>.
  const escaped = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

function ScopeCard({
  papersIndexed,
  totalAbstractChars,
  isLoading,
}: {
  papersIndexed: number | undefined;
  totalAbstractChars: number | undefined;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  const approxTokens =
    totalAbstractChars === undefined ? undefined : Math.round(totalAbstractChars / 4);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" aria-hidden />
        <h3 className="text-lg font-semibold">{t("search.scope.heading")}</h3>
      </div>

      <div className="mt-5 space-y-4">
        <ScopeStat
          label={t("search.scope.papersIndexed")}
          value={isLoading ? "—" : papersIndexed !== undefined ? String(papersIndexed) : "—"}
        />
        <ScopeStat
          label={t("search.scope.totalTokens")}
          value={isLoading ? "—" : approxTokens !== undefined ? formatTokens(approxTokens) : "—"}
        />
      </div>
    </div>
  );
}

function ScopeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** 1250000 → "1.2M"；小于 1000 照数字展示。 */
function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
