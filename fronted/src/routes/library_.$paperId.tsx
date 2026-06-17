import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronRight,
  ChevronDown,
  Download,
  Sparkles,
  ClipboardList,
  Compass,
  BarChart3,
  ArrowLeft,
  FileText,
  FileQuestion,
  FlagTriangleRight,
  StickyNote,
  MessageSquare,
  Github,
  Loader2,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { PdfUploadButton } from "@/components/hermes/PdfUploadButton";
import { StartReproductionButton } from "@/components/hermes/StartReproductionButton";
import { FastclawToolCard, FastclawProgressRow } from "@/components/hermes/FastclawToolCard";
import { cn } from "@/lib/utils";
import { ApiError, getApiBaseUrl } from "@/lib/api-client";
import { getPaperDetail, getPaperPdfUrl } from "@/api/papers";
import { useFastclawStream } from "@/hooks/use-fastclaw-stream";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { PaperAnalysis, PaperDetail } from "@/types/paper";
import type { MessageKey } from "@/lib/i18n/messages";

const detailQuery = (paperId: string) => ({
  queryKey: ["paper-detail", paperId] as const,
  queryFn: () => getPaperDetail(paperId),
});

export const Route = createFileRoute("/library_/$paperId")({
  loader: async ({ params, context }) => {
    try {
      await context.queryClient.ensureQueryData(detailQuery(params.paperId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw notFound();
      throw err;
    }
  },
  notFoundComponent: NotFoundView,
  errorComponent: ({ error }) => <ErrorView message={error.message} />,
  component: PaperDetailPage,
});

function NotFoundView() {
  const { t } = useI18n();
  return (
    <Shell active="Library">
      <div className="mx-auto max-w-2xl px-8 py-20 text-center">
        <h1 className="text-3xl font-semibold">{t("paper.notFound")}</h1>
        <p className="mt-3 text-muted-foreground">{t("paper.notFoundHint")}</p>
        <Link
          to="/library"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("paper.backToLibrary")}
        </Link>
      </div>
    </Shell>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <Shell active="Library">
      <div className="mx-auto max-w-2xl px-8 py-20 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </Shell>
  );
}

function PaperDetailPage() {
  const { paperId } = Route.useParams();
  const { t } = useI18n();
  const { data } = useSuspenseQuery(detailQuery(paperId));

  const { paper, analysis } = data as PaperDetail;

  // 实时 AI 分析流：点击「AI 分析」按钮触发，工具调用过程实时可见。
  const aiStream = useFastclawStream();
  const runAiAnalysis = () => {
    if (aiStream.phase === "streaming") return;
    aiStream.setItems([]);
    void aiStream.start(`${getApiBaseUrl()}/api/fastclaw/analyze/stream`, {
      paperId: paper.id,
      sessionKey: `wcp-analyse-${paper.id}`,
    });
  };

  return (
    <Shell active="Library">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px]">
        {/* Left: paper content */}
        <div className="min-w-0 px-8 py-10">
          <nav
            className="flex items-center gap-2 text-sm text-muted-foreground"
            aria-label="Breadcrumb"
          >
            <Link to="/library" className="hover:text-foreground">
              {t("sidebar.paperLibrary")}
            </Link>
            <ChevronRight className="h-4 w-4" aria-hidden />
            <span className="truncate text-foreground">{paper.title}</span>
          </nav>

          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {paper.field && (
                <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/30">
                  {paper.field}
                </span>
              )}
              {paper.source && (
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                  {paper.source}
                </span>
              )}
              {paper.publishedYear !== null && (
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                  {paper.publishedYear}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {paper.repoUrl && (
                <a
                  href={paper.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("paper.repoUrlOpen")}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <Github className="h-4 w-4" aria-hidden />
                  {t("paper.repoUrl")}
                </a>
              )}
              <StartReproductionButton paperId={paper.id} paperTitle={paper.title} />
              <PdfUploadButton paperId={paper.id} />
              <a
                href={getPaperPdfUrl(paper.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
                style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
              >
                <Download className="h-4 w-4" aria-hidden />
                {t("paper.download")}
              </a>
            </div>
          </div>

          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight">
            {paper.title}
          </h1>

          {paper.authors.length > 0 && (
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              {paper.authors.map((a, i) => (
                <span key={`${a}-${i}`}>
                  <span className="text-foreground">{a}</span>
                  {i < paper.authors.length - 1 && <span>, </span>}
                </span>
              ))}
            </p>
          )}

          <div className="my-8 h-px bg-border" />

          <section aria-labelledby="abstract-heading">
            <h2 id="abstract-heading" className="flex items-center gap-2 text-2xl font-semibold">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              {t("paper.abstract")}
            </h2>
            {paper.abstract ? (
              <div className="mt-4 space-y-4 text-[15px] leading-7 text-foreground/90">
                {paper.abstract.split(/\n\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm italic text-muted-foreground">
                {t("paper.abstractEmpty")}
              </p>
            )}
          </section>
        </div>

        {/* Right: analysis panel. Uses the shared page background — no
            custom override — and leans on bordered cards for structure. */}
        <aside
          className="border-t border-border px-6 py-8 lg:border-l lg:border-t-0"
          aria-labelledby="analysis-heading"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="analysis-heading" className="text-xl font-semibold">
                {t("paper.analysis.heading")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("paper.analysis.subheading")}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={runAiAnalysis}
                disabled={aiStream.phase === "streaming"}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
              >
                {aiStream.phase === "streaming" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                )}
                {aiStream.phase === "streaming"
                  ? t("paper.analysis.running")
                  : t("paper.analysis.runAi")}
              </button>
              <Link
                to="/search"
                search={{ q: paper.title }}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground"
                style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                {t("paper.analysis.startRagChat")}
              </Link>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {(aiStream.items.length > 0 || aiStream.error) && (
              <AnalysisLiveRegion stream={aiStream} />
            )}
            {analysis ? <AnalysisSections analysis={analysis} /> : <EmptyAnalysis />}
          </div>
        </aside>
      </div>
    </Shell>
  );
}

type AnalysisSection = {
  key: keyof PaperAnalysis;
  titleKey: MessageKey;
  icon: typeof FileText;
  defaultOpen?: boolean;
};

function AnalysisSections({ analysis }: { analysis: PaperAnalysis }) {
  const { t } = useI18n();

  // Order follows the design mock: task definition open, others collapsed.
  const sections: AnalysisSection[] = [
    {
      key: "taskDefinition",
      titleKey: "paper.analysis.taskDefinition",
      icon: ClipboardList,
      defaultOpen: true,
    },
    {
      key: "researchQuestions",
      titleKey: "paper.analysis.researchQuestions",
      icon: FileQuestion,
    },
    { key: "methodOverview", titleKey: "paper.analysis.methodOverview", icon: Compass },
    { key: "metrics", titleKey: "paper.analysis.metrics", icon: BarChart3, defaultOpen: true },
    { key: "conclusion", titleKey: "paper.analysis.conclusion", icon: FlagTriangleRight },
    { key: "notes", titleKey: "paper.analysis.notes", icon: StickyNote },
  ];

  const visible = sections.filter(
    (s) => analysis[s.key] !== null && analysis[s.key]!.trim().length > 0,
  );

  if (visible.length === 0) return <EmptyAnalysis />;

  return (
    <>
      {visible.map(({ key, titleKey, icon, defaultOpen }) => (
        <AnalysisCard key={key} icon={icon} title={t(titleKey)} defaultOpen={defaultOpen ?? false}>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
            {analysis[key]}
          </p>
        </AnalysisCard>
      ))}
    </>
  );
}

function AnalysisCard({
  icon: Icon,
  title,
  children,
  defaultOpen = false,
}: {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-2xl border border-border bg-card p-5",
        "[&_summary::-webkit-details-marker]:hidden",
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" aria-hidden />
          <span className="text-base font-semibold">{title}</span>
        </div>
        <ChevronDown
          className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function EmptyAnalysis() {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
      {t("paper.analysis.empty")}
    </div>
  );
}

/**
 * 实时 AI 分析区：把 useFastclawStream 的结构化 transcript 渲染出来——
 * 工具调用卡片（running/done）、进度行与流式 markdown 文本交错呈现，
 * 让用户看到 agent 正在做什么，而不是盯着空白等。
 */
function AnalysisLiveRegion({ stream }: { stream: ReturnType<typeof useFastclawStream> }) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t("paper.analysis.liveHeading")}
      className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        {stream.phase === "streaming" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        )}
        {stream.phase === "streaming"
          ? t("paper.analysis.running")
          : t("paper.analysis.liveHeading")}
      </div>

      {stream.items.map((item) => {
        switch (item.kind) {
          case "tool":
            return <FastclawToolCard key={item.id} item={item} />;
          case "progress":
            return <FastclawProgressRow key={item.id} item={item} />;
          case "assistant":
            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm leading-relaxed"
              >
                <AnalysisMarkdown>{item.content}</AnalysisMarkdown>
              </div>
            );
          case "system":
          case "user":
            return (
              <p key={item.id} className="px-1 text-xs text-muted-foreground">
                {item.content}
              </p>
            );
          default:
            return null;
        }
      })}

      {stream.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {stream.error}
        </div>
      )}
    </section>
  );
}

/** 流式分析文本的 markdown 渲染（与 manager 的 DeployMarkdown 同款轻量样式）。 */
function AnalysisMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 break-words text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h3 className="mt-1 text-base font-semibold" {...props} />,
          h2: (props) => <h4 className="mt-1 text-sm font-semibold" {...props} />,
          h3: (props) => <h5 className="mt-1 text-sm font-semibold" {...props} />,
          p: (props) => <p className="leading-relaxed" {...props} />,
          ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li className="leading-relaxed" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          a: ({ href, ...rest }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
              {...rest}
            />
          ),
          code: ({ className, children: codeChildren, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code className={cn("block font-mono text-xs", className)} {...rest}>
                  {codeChildren}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[0.85em]"
                {...rest}
              >
                {codeChildren}
              </code>
            );
          },
          pre: (props) => (
            <pre
              className="max-h-56 overflow-auto rounded-lg bg-secondary/60 p-2 text-xs leading-relaxed"
              {...props}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
