import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, CornerDownLeft, Database, Inbox } from "lucide-react";
import { z } from "zod";
import { Shell } from "@/components/hermes/Shell";
import { useDebounce } from "@/hooks/use-debounce";
import { useI18n } from "@/lib/i18n/I18nProvider";

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

/**
 * RAG search page.
 *
 * The results list, recent queries, and scope statistics are all driven by
 * the backend. Until the endpoint is wired up, this view renders the query
 * input plus empty states so the page stays usable without mock data.
 */
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>("input")?.blur();
  };

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
            <span className="text-xs italic text-muted-foreground/70">
              {t("search.recentEmpty")}
            </span>
          </div>
        </form>

        <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_300px]">
          <section aria-labelledby="results-heading">
            <div className="flex items-end justify-between">
              <h2 id="results-heading" className="text-2xl font-semibold tracking-tight">
                {t("search.resultsHeading")}
              </h2>
            </div>

            <div className="mt-5 grid place-items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-20 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/60" aria-hidden />
              <div className="text-sm font-medium">{t("search.empty.title")}</div>
              <div className="max-w-md text-xs text-muted-foreground">
                {t("search.empty.hint")}
              </div>
            </div>
          </section>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="text-lg font-semibold">{t("search.scope.heading")}</h3>
              </div>

              <div className="mt-5 space-y-4">
                <ScopeStat label={t("search.scope.papersIndexed")} />
                <ScopeStat label={t("search.scope.totalTokens")} />
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t("search.scope.activeCollections")}
                  </div>
                  <div className="mt-3 text-xs italic text-muted-foreground/70">
                    {t("search.scope.noCollections")}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function ScopeStat({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-muted-foreground/70">
        {t("search.scope.empty")}
      </div>
    </div>
  );
}
