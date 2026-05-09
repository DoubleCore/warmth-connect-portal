import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronRight, Download, Sparkles, FileText, ClipboardList, Compass, BarChart3, MessageSquare, ChevronDown, ArrowLeft } from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { getPaper, type Paper } from "@/lib/papers";

export const Route = createFileRoute("/library/$paperId")({
  loader: ({ params }): Paper => {
    const paper = getPaper(params.paperId);
    if (!paper) throw notFound();
    return paper;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} — Hermes Library` },
          { name: "description", content: loaderData.analysis.summary.slice(0, 160) },
        ]
      : [{ title: "Paper — Hermes Library" }],
  }),
  notFoundComponent: () => (
    <Shell active="Library">
      <div className="mx-auto max-w-2xl px-8 py-20 text-center">
        <h1 className="text-3xl font-semibold">Paper not found</h1>
        <p className="mt-3 text-muted-foreground">The paper you're looking for isn't in the library.</p>
        <Link to="/library" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Library
        </Link>
      </div>
    </Shell>
  ),
  errorComponent: ({ error }) => (
    <Shell active="Library">
      <div className="mx-auto max-w-2xl px-8 py-20 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </Shell>
  ),
  component: PaperDetailPage,
});

function PaperDetailPage() {
  const paper: Paper = Route.useLoaderData();

  return (
    <Shell active="Library">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px]">
        {/* Left: paper content */}
        <div className="min-w-0 px-8 py-10">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/library" className="hover:text-foreground">Library</Link>
            <ChevronRight className="h-4 w-4" />
            <span className="truncate text-foreground">{paper.title}</span>
          </nav>

          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {paper.domains.map((d) => (
                <span key={d} className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/30">
                  {d}
                </span>
              ))}
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">{paper.source}</span>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">{paper.year}</span>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          </div>

          <h1 className="mt-6 text-5xl font-semibold tracking-tight leading-[1.05]">{paper.title}</h1>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            {paper.authors.map((a, i) => (
              <span key={a}>
                <span className="text-foreground">{a}</span>
                {i < paper.authors.length - 1 && <span>, </span>}
              </span>
            ))}
          </p>

          <div className="my-8 h-px bg-border" />

          <section>
            <h2 className="flex items-center gap-2 text-2xl font-semibold">
              <Sparkles className="h-5 w-5 text-primary" />
              Abstract
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-7 text-foreground/90">
              {paper.abstract.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        </div>

        {/* Right: analysis panel */}
        <aside className="border-l border-border bg-[oklch(0.16_0.01_260)] px-6 py-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Analysis</h2>
              <p className="text-xs text-muted-foreground">Extracted structured data</p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Start RAG Chat
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <Card icon={FileText} title="Summary">
              <p className="text-sm leading-6 text-foreground/85">{paper.analysis.summary}</p>
            </Card>

            <Card icon={ClipboardList} title="Task Definition" defaultOpen>
              <ul className="space-y-2 text-sm leading-6 text-foreground/85">
                <li><span className="font-semibold">Primary Task:</span> {paper.analysis.task.primary}</li>
                <li><span className="font-semibold">Datasets:</span> {paper.analysis.task.datasets}</li>
                <li><span className="font-semibold">Goal:</span> {paper.analysis.task.goal}</li>
              </ul>
            </Card>

            <Card icon={Compass} title="Method Overview">
              <p className="text-sm leading-6 text-foreground/70">Architecture, attention formulation, and training recipe details extracted from the source paper.</p>
            </Card>

            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <BarChart3 className="h-4 w-4 text-primary" />
                Key Metrics
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {paper.analysis.metrics.map((m) => (
                  <div key={m.label} className="rounded-xl border border-border bg-card p-4 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</div>
                    <div className="mt-2 text-2xl font-semibold">{m.value}</div>
                    {m.note && <div className="mt-1 text-[11px] text-[oklch(0.74_0.18_155)]">↑ {m.note}</div>}
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-border bg-card p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Training Cost</div>
                    <div className="mt-1 text-sm font-medium">{paper.analysis.training.cost}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Hardware</div>
                    <div className="mt-1 text-sm font-medium">{paper.analysis.training.hardware}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Card({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-border bg-card p-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold">{title}</span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}