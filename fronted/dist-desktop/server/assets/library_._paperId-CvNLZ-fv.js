import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { u as useI18n, A as ApiError, n as uploadPaperPdf, c as createReproductionRecord, o as Route, p as detailQuery, q as getPaperPdfUrl } from "./router-DbOKu9BE.js";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient, useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Loader2, Upload, CheckCircle2, FileText, Play, ChevronRight, Github, Download, Sparkles, MessageSquare, ClipboardList, FileQuestion, Compass, BarChart3, FlagTriangleRight, StickyNote, ChevronDown } from "lucide-react";
import { c as cn, S as Shell } from "./Shell-D8Pakp7k.js";
import { useRef, useState } from "react";
import { D as Dialog, a as DialogTrigger, b as DialogContent, c as DialogHeader, d as DialogTitle, e as DialogDescription, E as EntityCombobox, f as DialogFooter } from "./EntityCombobox-C0poqq6t.js";
import { B as Button } from "./button-toWkDJS-.js";
import { L as Label } from "./label-CEbNblBy.js";
import { l as listDevices } from "./devices-BDVJaLc_.js";
import "zod";
import "clsx";
import "tailwind-merge";
import "cmdk";
import "@radix-ui/react-dialog";
import "@radix-ui/react-popover";
import "@radix-ui/react-slot";
import "class-variance-authority";
import "@radix-ui/react-label";
const MAX_BYTES = 26 * 1024 * 1024;
const MAX_LABEL = "26 MB";
function PdfUploadButton({ paperId }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const mutation = useMutation({
    mutationFn: (file) => uploadPaperPdf(paperId, file),
    onSuccess: async () => {
      setErrorMsg(null);
      await queryClient.invalidateQueries({ queryKey: ["paper-detail", paperId] });
      await queryClient.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "upload failed";
      setErrorMsg(t("paper.uploadError", { message: msg }));
    }
  });
  const submit = (file) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg(t("paper.uploadNotPdf"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setErrorMsg(t("paper.uploadTooLarge", { limit: MAX_LABEL }));
      return;
    }
    setErrorMsg(null);
    mutation.mutate(file);
  };
  const onPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    submit(file);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) submit(file);
  };
  const lastFile = mutation.variables;
  const showSuccessLine = mutation.isSuccess && lastFile && !errorMsg;
  const pending = mutation.isPending;
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-end gap-1", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => inputRef.current?.click(),
        onDragOver: (e) => {
          e.preventDefault();
          if (!pending) setDragActive(true);
        },
        onDragLeave: () => setDragActive(false),
        onDrop,
        disabled: pending,
        "aria-describedby": "pdf-upload-hint",
        className: cn(
          "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-60",
          dragActive ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary"
        ),
        children: [
          pending ? /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin", "aria-hidden": true }) : /* @__PURE__ */ jsx(Upload, { className: "h-4 w-4", "aria-hidden": true }),
          pending ? t("paper.uploading") : t("paper.upload")
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      "input",
      {
        ref: inputRef,
        type: "file",
        accept: "application/pdf,.pdf",
        className: "hidden",
        onChange: onPick
      }
    ),
    /* @__PURE__ */ jsxs("p", { id: "pdf-upload-hint", className: "max-w-xs text-right text-[10px] text-muted-foreground", children: [
      t("paper.uploadHint"),
      " · ≤ ",
      MAX_LABEL
    ] }),
    errorMsg && /* @__PURE__ */ jsx("p", { className: "max-w-xs text-right text-xs text-destructive", role: "alert", children: errorMsg }),
    showSuccessLine && /* @__PURE__ */ jsxs("p", { className: "flex max-w-xs items-center gap-1 text-right text-xs text-[oklch(0.74_0.18_155)]", children: [
      /* @__PURE__ */ jsx(CheckCircle2, { className: "h-3.5 w-3.5 shrink-0", "aria-hidden": true }),
      t("paper.uploadSuccess")
    ] }),
    lastFile && (showSuccessLine || pending) && /* @__PURE__ */ jsxs("p", { className: "flex max-w-xs items-center gap-1 overflow-hidden text-right text-[10px] text-muted-foreground", children: [
      /* @__PURE__ */ jsx(FileText, { className: "h-3 w-3 shrink-0", "aria-hidden": true }),
      /* @__PURE__ */ jsx("span", { className: "truncate", children: t("paper.uploadedFile", {
        name: lastFile.name,
        size: formatBytes(lastFile.size)
      }) })
    ] })
  ] });
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function StartReproductionButton({ paperId, paperTitle }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
    enabled: open
  });
  const deviceOptions = (devicesQuery.data?.items ?? []).map((d) => ({
    value: d.id,
    label: d.name,
    hint: [d.deviceType, d.location].filter(Boolean).join(" · ") || null
  }));
  const mutation = useMutation({
    mutationFn: () => createReproductionRecord({
      paperId,
      deviceId: selectedDeviceId,
      status: "running",
      progress: 0,
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    }),
    onSuccess: async (record) => {
      await queryClient.invalidateQueries({ queryKey: ["reproduction-records"] });
      setOpen(false);
      void navigate({ to: "/manager", search: { runId: record.id } });
    }
  });
  return /* @__PURE__ */ jsxs(
    Dialog,
    {
      open,
      onOpenChange: (next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) {
          mutation.reset();
          setSelectedDeviceId(null);
        }
      },
      children: [
        /* @__PURE__ */ jsx(DialogTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            className: "inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary",
            children: [
              /* @__PURE__ */ jsx(Play, { className: "h-4 w-4 text-primary", "aria-hidden": true }),
              t("paper.startReproduction")
            ]
          }
        ) }),
        /* @__PURE__ */ jsxs(DialogContent, { className: "sm:max-w-md", children: [
          /* @__PURE__ */ jsxs(DialogHeader, { children: [
            /* @__PURE__ */ jsx(DialogTitle, { children: t("paper.startReproduction") }),
            /* @__PURE__ */ jsx(DialogDescription, { children: t("paper.startReproductionDesc", { title: paperTitle }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-4 py-2", children: [
            /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsx(Label, { htmlFor: "repro-device", children: t("paper.selectDevice") }),
              /* @__PURE__ */ jsx(
                EntityCombobox,
                {
                  id: "repro-device",
                  options: deviceOptions,
                  value: selectedDeviceId,
                  onChange: setSelectedDeviceId,
                  loading: devicesQuery.isLoading,
                  clearable: true,
                  clearLabel: t("paper.noDevice")
                }
              )
            ] }),
            mutation.isError && /* @__PURE__ */ jsx("div", { className: "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive", children: mutation.error instanceof ApiError ? mutation.error.message : mutation.error.message })
          ] }),
          /* @__PURE__ */ jsxs(DialogFooter, { children: [
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "ghost",
                onClick: () => setOpen(false),
                disabled: mutation.isPending,
                children: t("paper.cancel")
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                onClick: () => mutation.mutate(),
                disabled: mutation.isPending,
                children: mutation.isPending ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin", "aria-hidden": true }),
                  t("paper.creating")
                ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(Play, { className: "mr-2 h-4 w-4", "aria-hidden": true }),
                  t("paper.startNow")
                ] })
              }
            )
          ] })
        ] })
      ]
    }
  );
}
function PaperDetailPage() {
  const {
    paperId
  } = Route.useParams();
  const {
    t
  } = useI18n();
  const {
    data
  } = useSuspenseQuery(detailQuery(paperId));
  const {
    paper,
    analysis
  } = data;
  return /* @__PURE__ */ jsx(Shell, { active: "Library", children: /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-[1fr_440px]", children: [
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 px-8 py-10", children: [
      /* @__PURE__ */ jsxs("nav", { className: "flex items-center gap-2 text-sm text-muted-foreground", "aria-label": "Breadcrumb", children: [
        /* @__PURE__ */ jsx(Link, { to: "/library", className: "hover:text-foreground", children: t("sidebar.paperLibrary") }),
        /* @__PURE__ */ jsx(ChevronRight, { className: "h-4 w-4", "aria-hidden": true }),
        /* @__PURE__ */ jsx("span", { className: "truncate text-foreground", children: paper.title })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "mt-6 flex flex-wrap items-start justify-between gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          paper.field && /* @__PURE__ */ jsx("span", { className: "rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/30", children: paper.field }),
          paper.source && /* @__PURE__ */ jsx("span", { className: "rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground", children: paper.source }),
          paper.publishedYear !== null && /* @__PURE__ */ jsx("span", { className: "rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground", children: paper.publishedYear })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          paper.repoUrl && /* @__PURE__ */ jsxs("a", { href: paper.repoUrl, target: "_blank", rel: "noopener noreferrer", title: t("paper.repoUrlOpen"), className: "inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary", children: [
            /* @__PURE__ */ jsx(Github, { className: "h-4 w-4", "aria-hidden": true }),
            t("paper.repoUrl")
          ] }),
          /* @__PURE__ */ jsx(StartReproductionButton, { paperId: paper.id, paperTitle: paper.title }),
          /* @__PURE__ */ jsx(PdfUploadButton, { paperId: paper.id }),
          /* @__PURE__ */ jsxs("a", { href: getPaperPdfUrl(paper.id), target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]", style: {
            background: "var(--gradient-primary)",
            boxShadow: "var(--shadow-glow)"
          }, children: [
            /* @__PURE__ */ jsx(Download, { className: "h-4 w-4", "aria-hidden": true }),
            t("paper.download")
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("h1", { className: "mt-6 text-5xl font-semibold leading-[1.05] tracking-tight", children: paper.title }),
      paper.authors.length > 0 && /* @__PURE__ */ jsx("p", { className: "mt-6 text-sm leading-relaxed text-muted-foreground", children: paper.authors.map((a, i) => /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("span", { className: "text-foreground", children: a }),
        i < paper.authors.length - 1 && /* @__PURE__ */ jsx("span", { children: ", " })
      ] }, `${a}-${i}`)) }),
      /* @__PURE__ */ jsx("div", { className: "my-8 h-px bg-border" }),
      /* @__PURE__ */ jsxs("section", { "aria-labelledby": "abstract-heading", children: [
        /* @__PURE__ */ jsxs("h2", { id: "abstract-heading", className: "flex items-center gap-2 text-2xl font-semibold", children: [
          /* @__PURE__ */ jsx(Sparkles, { className: "h-5 w-5 text-primary", "aria-hidden": true }),
          t("paper.abstract")
        ] }),
        paper.abstract ? /* @__PURE__ */ jsx("div", { className: "mt-4 space-y-4 text-[15px] leading-7 text-foreground/90", children: paper.abstract.split(/\n\n+/).map((p, i) => /* @__PURE__ */ jsx("p", { children: p }, i)) }) : /* @__PURE__ */ jsx("p", { className: "mt-4 text-sm italic text-muted-foreground", children: t("paper.abstractEmpty") })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("aside", { className: "border-t border-border px-6 py-8 lg:border-l lg:border-t-0", "aria-labelledby": "analysis-heading", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { id: "analysis-heading", className: "text-xl font-semibold", children: t("paper.analysis.heading") }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-muted-foreground", children: t("paper.analysis.subheading") })
        ] }),
        /* @__PURE__ */ jsxs(Link, { to: "/search", search: {
          q: `Analyze this paper: ${paper.title}`,
          paperId: paper.id
        }, className: "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground", style: {
          background: "var(--gradient-primary)",
          boxShadow: "var(--shadow-glow)"
        }, children: [
          /* @__PURE__ */ jsx(MessageSquare, { className: "h-3.5 w-3.5", "aria-hidden": true }),
          t("paper.analysis.startRagChat")
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "mt-6 space-y-4", children: analysis ? /* @__PURE__ */ jsx(AnalysisSections, { analysis }) : /* @__PURE__ */ jsx(EmptyAnalysis, {}) })
    ] })
  ] }) });
}
function AnalysisSections({
  analysis
}) {
  const {
    t
  } = useI18n();
  const sections = [{
    key: "taskDefinition",
    titleKey: "paper.analysis.taskDefinition",
    icon: ClipboardList,
    defaultOpen: true
  }, {
    key: "researchQuestions",
    titleKey: "paper.analysis.researchQuestions",
    icon: FileQuestion
  }, {
    key: "methodOverview",
    titleKey: "paper.analysis.methodOverview",
    icon: Compass
  }, {
    key: "metrics",
    titleKey: "paper.analysis.metrics",
    icon: BarChart3,
    defaultOpen: true
  }, {
    key: "conclusion",
    titleKey: "paper.analysis.conclusion",
    icon: FlagTriangleRight
  }, {
    key: "notes",
    titleKey: "paper.analysis.notes",
    icon: StickyNote
  }];
  const visible = sections.filter((s) => analysis[s.key] !== null && analysis[s.key].trim().length > 0);
  if (visible.length === 0) return /* @__PURE__ */ jsx(EmptyAnalysis, {});
  return /* @__PURE__ */ jsx(Fragment, { children: visible.map(({
    key,
    titleKey,
    icon,
    defaultOpen
  }) => /* @__PURE__ */ jsx(AnalysisCard, { icon, title: t(titleKey), defaultOpen: defaultOpen ?? false, children: /* @__PURE__ */ jsx("p", { className: "whitespace-pre-wrap text-sm leading-6 text-foreground/85", children: analysis[key] }) }, key)) });
}
function AnalysisCard({
  icon: Icon,
  title,
  children,
  defaultOpen = false
}) {
  return /* @__PURE__ */ jsxs("details", { open: defaultOpen, className: cn("group rounded-2xl border border-border bg-card p-5", "[&_summary::-webkit-details-marker]:hidden"), children: [
    /* @__PURE__ */ jsxs("summary", { className: "flex cursor-pointer list-none items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Icon, { className: "h-5 w-5 text-primary", "aria-hidden": true }),
        /* @__PURE__ */ jsx("span", { className: "text-base font-semibold", children: title })
      ] }),
      /* @__PURE__ */ jsx(ChevronDown, { className: "h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180", "aria-hidden": true })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-4", children })
  ] });
}
function EmptyAnalysis() {
  const {
    t
  } = useI18n();
  return /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground", children: t("paper.analysis.empty") });
}
export {
  PaperDetailPage as component
};
