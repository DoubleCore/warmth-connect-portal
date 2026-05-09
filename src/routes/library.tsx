import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, FileText, Folder, CalendarDays, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
});

type Paper = {
  title: string;
  authors: string;
  domains: string[];
  source: string;
  year: number;
};

const papers: Paper[] = [
  { title: "Attention Is All You Need", authors: "Vaswani et al.", domains: ["NLP"], source: "NeurIPS", year: 2017 },
  { title: "Language Models are Few-Shot Learners", authors: "Brown et al.", domains: ["NLP", "LLM"], source: "NeurIPS", year: 2020 },
  { title: "Deep Residual Learning for Image Recognition", authors: "He et al.", domains: ["CV"], source: "CVPR", year: 2016 },
  { title: "BERT: Pre-training of Deep Bidirectional Transformers", authors: "Devlin et al.", domains: ["NLP"], source: "NAACL", year: 2019 },
  { title: "An Image is Worth 16x16 Words", authors: "Dosovitskiy et al.", domains: ["CV"], source: "ICLR", year: 2021 },
  { title: "LLaMA: Open and Efficient Foundation LMs", authors: "Touvron et al.", domains: ["LLM"], source: "arXiv", year: 2023 },
];

function FilterButton({ icon: Icon, label }: { icon: typeof Folder; label: string }) {
  return (
    <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <ChevronDown className="h-4 w-4 opacity-60" />
    </button>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/30">
      {label}
      <button onClick={onRemove} className="opacity-70 hover:opacity-100">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function LibraryPage() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>(["NLP", "2023"]);
  const [page, setPage] = useState(1);

  const visible = useMemo(
    () => papers.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()) || p.authors.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  const removeFilter = (f: string) => setFilters((prev) => prev.filter((x) => x !== f));

  return (
    <Shell active="Library">
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <header>
          <h1 className="text-4xl font-semibold tracking-tight">Library</h1>
          <p className="mt-2 text-muted-foreground">Browse, filter, and analyze imported research papers.</p>
        </header>

        <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, authors, or keywords…"
              className="w-full rounded-xl bg-transparent py-3 pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterButton icon={Folder} label="Domain" />
            <FilterButton icon={Folder} label="Source" />
            <FilterButton icon={CalendarDays} label="Year" />
          </div>
        </div>

        {filters.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <Chip key={f} label={f} onRemove={() => removeFilter(f)} />
            ))}
            <button onClick={() => setFilters([])} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Clear all
            </button>
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[1fr_120px_120px_80px_80px] gap-4 border-b border-border bg-card/60 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div>Title & Authors</div>
            <div>Domain</div>
            <div>Source</div>
            <div>Year</div>
            <div className="text-right">Actions</div>
          </div>
          {visible.map((p) => (
            <div
              key={p.title}
              className="grid grid-cols-[1fr_120px_120px_80px_80px] items-center gap-4 border-b border-border bg-card px-6 py-4 transition-colors last:border-0 hover:bg-secondary/40"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[oklch(0.35_0.15_25)]/30 text-[oklch(0.78_0.18_30)]">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.authors}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {p.domains.map((d) => (
                  <span key={d} className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/30">
                    {d}
                  </span>
                ))}
              </div>
              <div className="text-sm text-muted-foreground">{p.source}</div>
              <div className="text-sm text-muted-foreground">{p.year}</div>
              <div className="text-right">
                <button className="text-xs text-primary hover:underline">Open</button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Showing 1 to {visible.length} of 245 papers</div>
          <div className="flex items-center gap-2">
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-lg border text-sm transition-colors",
                  page === n ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                {n}
              </button>
            ))}
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}