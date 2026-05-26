import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Search, Loader2, ChevronLeft, ChevronRight, AlertTriangle, FileText } from "lucide-react";
import { S as Shell, c as cn } from "./Shell-D8Pakp7k.js";
import { u as useI18n, l as listPapers, i as isNetworkError, A as ApiError } from "./router-DbOKu9BE.js";
import "clsx";
import "tailwind-merge";
import "zod";
function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
const PAGE_SIZE = 10;
function LibraryPage() {
  const {
    t
  } = useI18n();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query, 300);
  const keyword = debouncedQuery.trim() || void 0;
  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ["papers", {
      keyword,
      page,
      pageSize: PAGE_SIZE
    }],
    queryFn: () => listPapers({
      keyword,
      page,
      pageSize: PAGE_SIZE
    }),
    placeholderData: keepPreviousData
  });
  const items = data?.items ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = items.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = start === 0 ? 0 : start + items.length - 1;
  const rangeLabel = total === 0 ? t("library.noMatch") : t("library.rangeLabel", {
    start,
    end,
    total
  });
  return /* @__PURE__ */ jsx(Shell, { active: "Library", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto w-full max-w-6xl px-8 py-10", children: [
    /* @__PURE__ */ jsxs("header", { children: [
      /* @__PURE__ */ jsx("h1", { className: "text-4xl font-semibold tracking-tight", children: t("library.title") }),
      /* @__PURE__ */ jsx("p", { className: "mt-2 text-muted-foreground", children: t("library.subtitle") })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3 md:flex-row md:items-center", children: [
      /* @__PURE__ */ jsxs("div", { className: "relative flex-1", children: [
        /* @__PURE__ */ jsx(Search, { className: "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground", "aria-hidden": true }),
        /* @__PURE__ */ jsx("label", { htmlFor: "library-search", className: "sr-only", children: t("library.searchLabel") }),
        /* @__PURE__ */ jsx("input", { id: "library-search", value: query, onChange: (e) => {
          setQuery(e.target.value);
          setPage(1);
        }, placeholder: t("library.searchPlaceholder"), className: "w-full rounded-xl bg-transparent py-3 pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40", autoComplete: "off" })
      ] }),
      isFetching && !isLoading && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-3 text-xs text-muted-foreground", children: [
        /* @__PURE__ */ jsx(Loader2, { className: "h-3.5 w-3.5 animate-spin", "aria-hidden": true }),
        t("library.loading")
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 overflow-hidden rounded-2xl border border-border", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[1fr_140px_120px_80px_80px] gap-4 border-b border-border bg-card/60 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground", role: "row", children: [
        /* @__PURE__ */ jsx("div", { children: t("library.table.titleAuthors") }),
        /* @__PURE__ */ jsx("div", { children: t("library.table.domain") }),
        /* @__PURE__ */ jsx("div", { children: t("library.table.source") }),
        /* @__PURE__ */ jsx("div", { children: t("library.table.year") }),
        /* @__PURE__ */ jsx("div", { className: "text-right", children: t("library.table.actions") })
      ] }),
      isLoading ? /* @__PURE__ */ jsx(LoadingRow, { text: t("library.loading") }) : isError && !isNetworkError(error) ? /* @__PURE__ */ jsx(ErrorRow, { text: t("library.loadError", {
        message: getErrorMessage(error)
      }), retryLabel: t("library.retry"), onRetry: () => refetch() }) : items.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "grid place-items-center gap-2 bg-card px-6 py-16 text-center", children: [
        /* @__PURE__ */ jsx("div", { className: "text-sm font-medium", children: t("library.emptyTitle") }),
        /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: t("library.emptyHint") })
      ] }) : items.map((p) => /* @__PURE__ */ jsx(PaperRow, { paper: p, etAlLabel: t("library.etAl"), openLabel: t("library.table.open") }, p.id))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("div", { className: "text-sm text-muted-foreground", children: rangeLabel }),
      /* @__PURE__ */ jsxs("nav", { className: "flex items-center gap-2", "aria-label": t("library.pagination.label"), children: [
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setPage((p) => Math.max(1, p - 1)), disabled: safePage === 1, "aria-label": t("library.pagination.previous"), className: "grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40", children: /* @__PURE__ */ jsx(ChevronLeft, { className: "h-4 w-4", "aria-hidden": true }) }),
        Array.from({
          length: totalPages
        }, (_, i) => i + 1).map((n) => /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setPage(n), "aria-current": safePage === n ? "page" : void 0, className: cn("grid h-9 w-9 place-items-center rounded-lg border text-sm transition-colors", safePage === n ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-secondary"), children: n }, n)),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setPage((p) => Math.min(totalPages, p + 1)), disabled: safePage === totalPages, "aria-label": t("library.pagination.next"), className: "grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40", children: /* @__PURE__ */ jsx(ChevronRight, { className: "h-4 w-4", "aria-hidden": true }) })
      ] })
    ] })
  ] }) });
}
function PaperRow({
  paper,
  etAlLabel,
  openLabel
}) {
  return /* @__PURE__ */ jsxs(Link, { to: "/library/$paperId", params: {
    paperId: paper.id
  }, className: "grid grid-cols-[1fr_140px_120px_80px_80px] items-center gap-4 border-b border-border bg-card px-6 py-4 transition-colors last:border-0 hover:bg-secondary/40", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
      /* @__PURE__ */ jsx("span", { className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[oklch(0.35_0.15_25)]/30 text-[oklch(0.78_0.18_30)]", children: /* @__PURE__ */ jsx(FileText, { className: "h-4 w-4", "aria-hidden": true }) }),
      /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx("div", { className: "truncate font-medium", children: paper.title }),
        /* @__PURE__ */ jsxs("div", { className: "truncate text-xs text-muted-foreground", children: [
          paper.authors[0] ?? "—",
          paper.authors.length > 1 ? etAlLabel : ""
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1", children: paper.field ? /* @__PURE__ */ jsx("span", { className: "rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/30", children: paper.field }) : /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground/60", children: "—" }) }),
    /* @__PURE__ */ jsx("div", { className: "text-sm text-muted-foreground", children: paper.source ?? "—" }),
    /* @__PURE__ */ jsx("div", { className: "text-sm text-muted-foreground", children: paper.publishedYear ?? "—" }),
    /* @__PURE__ */ jsx("div", { className: "text-right", children: /* @__PURE__ */ jsx("span", { className: "text-xs text-primary hover:underline", children: openLabel }) })
  ] });
}
function LoadingRow({
  text
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center gap-2 bg-card px-6 py-16 text-sm text-muted-foreground", children: [
    /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }),
    text
  ] });
}
function ErrorRow({
  text,
  retryLabel,
  onRetry
}) {
  return /* @__PURE__ */ jsxs("div", { className: "grid place-items-center gap-3 bg-card px-6 py-16 text-center", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm font-medium text-destructive", children: [
      /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4", "aria-hidden": true }),
      text
    ] }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: onRetry, className: "rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-secondary", children: retryLabel })
  ] });
}
function getErrorMessage(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
export {
  LibraryPage as component
};
