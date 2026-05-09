import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronDown,
  FileText,
  Folder,
  CalendarDays,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { cn } from "@/lib/utils";
import { papers, type Paper } from "@/lib/papers";
import { useDebounce } from "@/hooks/use-debounce";
import { useI18n } from "@/lib/i18n/I18nProvider";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
});

const PAGE_SIZE = 10;

function FilterButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Folder;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span>{label}</span>
      <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
    </button>
  );
}

function Chip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/30">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="opacity-70 hover:opacity-100"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

/**
 * Apply active text query and chip filters to the paper list.
 * Chip filters match against domain (case-insensitive, substring) or an
 * exact year.
 */
function applyFilters(list: Paper[], query: string, chips: string[]): Paper[] {
  const q = query.trim().toLowerCase();

  return list.filter((p) => {
    if (q) {
      const haystack = [p.title, p.authors.join(" "), p.domains.join(" ")]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    for (const chip of chips) {
      const chipLower = chip.toLowerCase();
      const yearMatch = /^\d{4}$/.test(chip);
      const matched = yearMatch
        ? p.year === Number(chip)
        : p.domains.some((d) => d.toLowerCase().includes(chipLower));
      if (!matched) return false;
    }

    return true;
  });
}

function LibraryPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>(["NLP", "2023"]);
  const [page, setPage] = useState(1);

  const debouncedQuery = useDebounce(query, 250);

  const visible = useMemo(
    () => applyFilters(papers, debouncedQuery, filters),
    [debouncedQuery, filters],
  );

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);

  const removeFilter = (f: string) => {
    setFilters((prev) => prev.filter((x) => x !== f));
    setPage(1);
  };

  const rangeLabel =
    visible.length === 0
      ? t("library.noMatch")
      : t("library.rangeLabel", {
          start: start + 1,
          end: start + pageItems.length,
          total: visible.length,
        });

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
          <div className="flex flex-wrap gap-2">
            <FilterButton icon={Folder} label={t("library.filter.domain")} />
            <FilterButton icon={Folder} label={t("library.filter.source")} />
            <FilterButton icon={CalendarDays} label={t("library.filter.year")} />
          </div>
        </div>

        {filters.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <Chip
                key={f}
                label={f}
                removeLabel={t("library.filter.remove", { label: f })}
                onRemove={() => removeFilter(f)}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                setFilters([]);
                setPage(1);
              }}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("library.filter.clearAll")}
            </button>
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-border">
          <div
            className="grid grid-cols-[1fr_120px_120px_80px_80px] gap-4 border-b border-border bg-card/60 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
            role="row"
          >
            <div>{t("library.table.titleAuthors")}</div>
            <div>{t("library.table.domain")}</div>
            <div>{t("library.table.source")}</div>
            <div>{t("library.table.year")}</div>
            <div className="text-right">{t("library.table.actions")}</div>
          </div>

          {pageItems.length === 0 ? (
            <div className="grid place-items-center gap-2 bg-card px-6 py-16 text-center">
              <div className="text-sm font-medium">{t("library.emptyTitle")}</div>
              <div className="text-xs text-muted-foreground">{t("library.emptyHint")}</div>
            </div>
          ) : (
            pageItems.map((p) => (
              <Link
                key={p.id}
                to="/library/$paperId"
                params={{ paperId: p.id }}
                className="grid grid-cols-[1fr_120px_120px_80px_80px] items-center gap-4 border-b border-border bg-card px-6 py-4 transition-colors last:border-0 hover:bg-secondary/40"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[oklch(0.35_0.15_25)]/30 text-[oklch(0.78_0.18_30)]">
                    <FileText className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <div className="font-medium">{p.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.authors[0]}
                      {p.authors.length > 1 ? t("library.etAl") : ""}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.domains.map((d) => (
                    <span
                      key={d}
                      className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/30"
                    >
                      {d}
                    </span>
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">{p.source}</div>
                <div className="text-sm text-muted-foreground">{p.year}</div>
                <div className="text-right">
                  <span className="text-xs text-primary hover:underline">
                    {t("library.table.open")}
                  </span>
                </div>
              </Link>
            ))
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
