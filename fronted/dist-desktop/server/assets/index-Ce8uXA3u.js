import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { u as useI18n, m as RECENT_PAPERS_LIMIT, l as listPapers, b as listReproductionRecords, i as isNetworkError, A as ApiError } from "./router-DbOKu9BE.js";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, MessageSquare, Cpu, AlertTriangle, Loader2, FlaskConical } from "lucide-react";
import { S as Shell, c as cn } from "./Shell-D8Pakp7k.js";
import "react";
import "zod";
import "clsx";
import "tailwind-merge";
const RECENT_RECORDS_LIMIT = 2;
const quickActions = [{
  labelKey: "home.quickAction.searchPapers",
  icon: Search,
  to: "/research"
}, {
  labelKey: "home.quickAction.analyzePdf",
  icon: FileText,
  to: "/library"
}, {
  labelKey: "home.quickAction.ragChat",
  icon: MessageSquare,
  to: "/search"
}, {
  labelKey: "home.quickAction.manageTraining",
  icon: Cpu,
  to: "/workspace"
}];
const statusLabelKey = {
  not_started: "repro.status.not_started",
  running: "repro.status.running",
  success: "repro.status.success",
  failed: "repro.status.failed",
  paused: "repro.status.paused"
};
const statusAccent = {
  not_started: "text-muted-foreground",
  running: "text-primary",
  success: "text-[oklch(0.74_0.18_155)]",
  failed: "text-destructive",
  paused: "text-muted-foreground"
};
function Index() {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsx(Shell, { active: "None", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto w-full max-w-4xl px-8 py-14", children: [
    /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-5xl font-semibold tracking-tight", children: t("home.title") }),
      /* @__PURE__ */ jsx("p", { className: "mt-4 text-muted-foreground", children: t("home.subtitle") })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-10 grid grid-cols-2 gap-4 md:grid-cols-4", children: quickActions.map(({
      labelKey,
      icon: Icon,
      to
    }) => /* @__PURE__ */ jsxs(Link, { to, className: "group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-6 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-glow)]", children: [
      /* @__PURE__ */ jsx("span", { className: "flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary", children: /* @__PURE__ */ jsx(Icon, { className: "h-5 w-5", "aria-hidden": true }) }),
      /* @__PURE__ */ jsx("span", { className: "text-sm font-medium", children: t(labelKey) })
    ] }, labelKey)) }),
    /* @__PURE__ */ jsx(RecentActivity, {})
  ] }) });
}
function RecentActivity() {
  const {
    t
  } = useI18n();
  const papersQuery = useQuery({
    queryKey: ["papers", {
      page: 1,
      pageSize: RECENT_PAPERS_LIMIT
    }],
    queryFn: () => listPapers({
      page: 1,
      pageSize: RECENT_PAPERS_LIMIT
    })
  });
  const recordsQuery = useQuery({
    queryKey: ["reproduction-records"],
    queryFn: listReproductionRecords
  });
  const isLoading = papersQuery.isLoading || recordsQuery.isLoading;
  const papersErr = papersQuery.error;
  const recordsErr = recordsQuery.error;
  const hasNetworkErr = papersQuery.isError && isNetworkError(papersErr) || recordsQuery.isError && isNetworkError(recordsErr);
  const hasRealError = papersQuery.isError && !isNetworkError(papersErr) || recordsQuery.isError && !isNetworkError(recordsErr);
  const errorObj = !isNetworkError(papersErr) && papersErr || recordsErr;
  const papers = papersQuery.data?.items.slice(0, RECENT_PAPERS_LIMIT) ?? [];
  const records = recordsQuery.data?.items.slice(0, RECENT_RECORDS_LIMIT) ?? [];
  const isEmpty = papers.length === 0 && records.length === 0;
  return /* @__PURE__ */ jsxs("section", { className: "mt-12", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold", children: t("home.recentHeading") }),
      /* @__PURE__ */ jsx(Link, { to: "/library", className: "text-sm text-primary hover:underline", children: t("common.viewAll") })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-4 flex flex-col gap-3", children: isLoading ? /* @__PURE__ */ jsx(SkeletonRows, { count: 3 }) : hasRealError ? /* @__PURE__ */ jsx(ErrorCard, { message: t("home.recent.loadError", {
      message: errMsg(errorObj)
    }), retryLabel: t("home.recent.retry"), onRetry: () => {
      void papersQuery.refetch();
      void recordsQuery.refetch();
    } }) : isEmpty || hasNetworkErr ? /* @__PURE__ */ jsx(EmptyCard, { text: t("home.recent.empty") }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      papers.map((p) => /* @__PURE__ */ jsx(PaperCard, { paper: p }, `paper-${p.id}`)),
      records.map((r) => /* @__PURE__ */ jsx(RecordCard, { record: r }, `record-${r.id}`))
    ] }) })
  ] });
}
function PaperCard({
  paper
}) {
  const {
    t
  } = useI18n();
  const firstAuthor = paper.authors[0] ?? t("home.recent.unknownAuthor");
  const yearPart = paper.publishedYear !== null ? String(paper.publishedYear) : paper.source ?? "—";
  return /* @__PURE__ */ jsxs(Link, { to: "/library/$paperId", params: {
    paperId: paper.id
  }, className: "flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40", children: [
    /* @__PURE__ */ jsx(FileText, { className: "h-5 w-5 shrink-0 text-muted-foreground", "aria-hidden": true }),
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsx("div", { className: "truncate font-medium", children: paper.title }),
      /* @__PURE__ */ jsx("div", { className: "truncate text-xs text-muted-foreground", children: t("home.recent.paperMeta", {
        authors: firstAuthor + (paper.authors.length > 1 ? t("library.etAl") : ""),
        year: yearPart
      }) })
    ] }),
    /* @__PURE__ */ jsx(Tag, { children: t("home.recent.tag.paper") })
  ] });
}
function RecordCard({
  record
}) {
  const {
    t
  } = useI18n();
  const accent = statusAccent[record.status];
  return /* @__PURE__ */ jsxs(Link, { to: "/workspace", className: "flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40", children: [
    /* @__PURE__ */ jsx(FlaskConical, { className: cn("h-5 w-5 shrink-0", accent), "aria-hidden": true }),
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsx("div", { className: "truncate font-medium", children: record.paper.title }),
      /* @__PURE__ */ jsx("div", { className: "truncate text-xs text-muted-foreground", children: t("home.recent.recordMeta", {
        status: t(statusLabelKey[record.status]),
        progress: record.progress
      }) })
    ] }),
    /* @__PURE__ */ jsx(Tag, { children: t("common.task") })
  ] });
}
function Tag({
  children
}) {
  return /* @__PURE__ */ jsx("span", { className: "shrink-0 rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground", children });
}
function SkeletonRows({
  count
}) {
  return /* @__PURE__ */ jsx(Fragment, { children: Array.from({
    length: count
  }, (_, i) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4", children: [
    /* @__PURE__ */ jsx("div", { className: "h-5 w-5 shrink-0 animate-pulse rounded-sm bg-muted", "aria-hidden": true }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 space-y-2", children: [
      /* @__PURE__ */ jsx("div", { className: "h-4 w-2/3 animate-pulse rounded bg-muted", "aria-hidden": true }),
      /* @__PURE__ */ jsx("div", { className: "h-3 w-1/3 animate-pulse rounded bg-muted/70", "aria-hidden": true })
    ] })
  ] }, i)) });
}
function ErrorCard({
  message,
  retryLabel,
  onRetry
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive", children: [
    /* @__PURE__ */ jsx(AlertTriangle, { className: "h-4 w-4 shrink-0", "aria-hidden": true }),
    /* @__PURE__ */ jsx("span", { className: "flex-1", children: message }),
    /* @__PURE__ */ jsx("button", { type: "button", onClick: onRetry, className: "rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-secondary", children: retryLabel })
  ] });
}
function EmptyCard({
  text
}) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-5 py-6 text-sm text-muted-foreground", children: [
    /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 shrink-0 opacity-40", "aria-hidden": true }),
    text
  ] });
}
function errMsg(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}
export {
  Index as component
};
