import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Download,
  Sparkles,
  ClipboardList,
  Compass,
  BarChart3,
  MessageSquare,
  ArrowLeft,
  FileText,
  FileQuestion,
  FlagTriangleRight,
  StickyNote,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { ApiError } from "@/lib/api-client";
import { getPaperDetail, getPaperPdfUrl } from "@/api/papers";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { PaperAnalysis, PaperDetail } from "@/types/paper";

const detailQuery = (paperId: string) => ({
  queryKey: ["paper-detail", paperId] as const,
  queryFn: () => getPaperDetail(paperId),
});

export const Route = createFileRoute("/library/$paperId")({
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

  return (
    <Shell active="Library">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px]">
        {/* Left: paper content */}
        <div className="min-w-0 px-8 py-10">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/library" className="hover:text-foreground">
              {t("sidebar.paperLibrary")}
            </Link>
            <ChevronRight className="h-4 w-4" />
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
            {/* Plain anchor so the browser handles either the 302 redirect or
                the inline application/pdf response with minimum fuss. */}
            <a
              href={getPaperPdfUrl(paper.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
            >
              <Download className="h-4 w-4" />
              {t("paper.download")}
            </a>
          </div>

          <h1 className="mt-6 text-5xl font-semibold tracking-tight leading-[1.05]">
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

          <section>
            <h2 className="flex items-center gap-2 text-2xl font-semibold">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("paper.abstract")}
            </h2>
            {paper.abstract ? (
              <div className="mt-4 space-y-4 text-[15px] leading-7 text-foreground/90">
                {paper.abstract.split("\n\n").map((p, i) => (
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

        {/* Right: analysis panel */}
        <aside className="border-l border-border bg-[oklch(0.16_0.01_260)] px-6 py-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{t("paper.analysis.heading")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("paper.analysis.subheading")}
              </p>
            </div>
            <Link
              to="/library/$paperId/rag"
              params={{ paperId: paper.id }}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t("paper.startRagChat")}
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {analysis ? <AnalysisSections analysis={analysis} /> : <EmptyAnalysis />}
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function AnalysisSections({ analysis }: { analysis: PaperAnalysis }) {
  const { t } = useI18n();
  const sections: { key: keyof PaperAnalysis; title: string; icon: typeof FileText }[] = [
    { key: "taskDefinition", title: t("paper.analysis.taskDefinition"), icon: ClipboardList },
    { key: "researchQuestions", title: t("paper.analysis.researchQuestions"), icon: FileQuestion },
    { key: "methodOverview", title: t("paper.analysis.methodOverview"), icon: Compass },
    { key: "metrics", title: t("paper.analysis.metrics"), icon: BarChart3 },
    { key: "conclusion", title: t("paper.analysis.conclusion"), icon: FlagTriangleRight },
    { key: "notes", title: t("paper.analysis.notes"), icon: StickyNote },
  ];

  const visible = sections.filter((s) => analysis[s.key] && analysis[s.key]!.trim().length > 0);

  if (visible.length === 0) return <EmptyAnalysis />;

  return (
    <>
      {visible.map(({ key, title, icon: Icon }) => (
        <section key={key} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">{title}</h3>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
            {analysis[key]}
          </p>
        </section>
      ))}
    </>
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
