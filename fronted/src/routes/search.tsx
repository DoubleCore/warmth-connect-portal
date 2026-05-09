import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, CornerDownLeft, BookOpen, Database, Quote } from "lucide-react";
import { z } from "zod";
import { Shell } from "@/components/hermes/Shell";
import { useDebounce } from "@/hooks/use-debounce";

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

const results = [
  {
    title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness",
    authors: "Tri Dao et al.",
    venue: "NeurIPS 2022",
    relevance: 0.94,
    excerpt:
      "We propose FlashAttention, a new attention algorithm that computes exact attention with far fewer memory accesses. We aim to avoid reading and writing the attention matrix to and from HBM. This requires (i) computing the softmax reduction without access to the whole input, and (ii) not storing the large intermediate attention matrix for the backward pass.",
  },
  {
    title: "GQA: Training Generalized Multi-Query Attention",
    authors: "Joshua Ainslie et al.",
    venue: "ArXiv 2023",
    relevance: 0.89,
    excerpt:
      "Multi-query attention (MQA) reduces decoder memory bandwidth by sharing key and value heads. We propose grouped-query attention (GQA), an interpolation of multi-head and multi-query attention with a single key and value head per group, achieving quality close to MHA with comparable speed to MQA.",
  },
  {
    title: "Mixture-of-Experts with Expert Choice Routing",
    authors: "Yanqi Zhou et al.",
    venue: "NeurIPS 2022",
    relevance: 0.81,
    excerpt:
      "We propose a heterogeneous mixture-of-experts model where experts choose tokens rather than tokens choosing experts, leading to perfect load balance and better downstream task performance under the same compute budget.",
  },
];

function RagSearchPage() {
  const { q: urlQuery } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [q, setQ] = useState(urlQuery ?? "Find common themes in LLM efficiency");
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
    // Debounced effect handles URL sync; submit just blurs & ensures trigger.
    (e.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>("input")?.blur();
  };

  return (
    <Shell active="None">
      <div className="mx-auto w-full max-w-7xl px-8 py-12">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-semibold tracking-tight">Search across all papers…</h1>
          <p className="mt-4 text-muted-foreground">
            Query the global corpus using natural language. Semantic retrieval powered by
            Hermes-7B.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mx-auto mt-10 max-w-3xl"
          role="search"
        >
          <div className="group relative">
            <div
              className="absolute -inset-px rounded-2xl opacity-60 blur-md transition-opacity group-focus-within:opacity-100"
              style={{ background: "var(--gradient-primary)" }}
              aria-hidden
            />
            <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
              <Search className="h-5 w-5 text-primary" aria-hidden />
              <label htmlFor="rag-query" className="sr-only">
                RAG search query
              </label>
              <input
                id="rag-query"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Find common themes in LLM efficiency"
                autoComplete="off"
              />
              <button
                type="submit"
                aria-label="Run search"
                className="rounded-lg bg-secondary p-2 text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                disabled={!q.trim()}
              >
                <CornerDownLeft className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent
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
              <h2 className="text-2xl font-semibold tracking-tight">Synthesized Results</h2>
              <span className="text-sm text-muted-foreground">
                Top {results.length} sources retrieved
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-5">
              {results.map((r) => (
                <article
                  key={r.title}
                  className="rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-[var(--shadow-glow)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold leading-snug text-primary hover:underline">
                        {r.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-mono text-muted-foreground">{r.authors}</span>
                        <span className="text-muted-foreground" aria-hidden>
                          •
                        </span>
                        <span className="font-mono text-muted-foreground">{r.venue}</span>
                        <span className="text-muted-foreground" aria-hidden>
                          •
                        </span>
                        <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                          Relevance: {r.relevance.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-primary-foreground transition-transform hover:scale-105"
                      style={{ background: "var(--gradient-primary)" }}
                    >
                      <BookOpen className="h-3.5 w-3.5" aria-hidden /> View Source
                    </button>
                  </div>
                  <blockquote className="mt-4 rounded-xl border-l-2 border-primary/60 bg-secondary/40 p-4 text-sm leading-relaxed text-muted-foreground">
                    <Quote className="mb-2 h-4 w-4 text-primary/60" aria-hidden />
                    {r.excerpt}
                  </blockquote>
                </article>
              ))}
            </div>
          </section>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="text-lg font-semibold">Search Scope</h3>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Papers Indexed
                  </div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums">245</div>
                </div>
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Total Tokens
                  </div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums">14.2M</div>
                </div>
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Active Collections
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {["Core ML", "Efficiency"].map((c) => (
                      <span
                        key={c}
                        className="rounded-md bg-primary/15 px-2 py-1 text-xs font-medium text-primary ring-1 ring-primary/30"
                      >
                        {c}
                      </span>
                    ))}
                    <span className="rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                      +3 more
                    </span>
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
