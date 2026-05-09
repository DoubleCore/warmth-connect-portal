import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  Settings,
  Search,
  ChevronLeft,
  FileText,
  Tag,
  MessageSquareText,
  HelpCircle,
  ExternalLink,
  Star,
  ArrowRight,
} from "lucide-react";
import { Sidebar } from "@/components/hermes/Sidebar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — Hermes AI" },
      { name: "description", content: "Getting started with Openpaper and the Hermes RAG engine." },
    ],
  }),
  component: DocsPage,
});

const navSections = [
  {
    title: "Introduction",
    items: [
      { label: "Getting Started", active: true },
      { label: "Architecture" },
      { label: "Installation" },
    ],
  },
  {
    title: "Core Features",
    items: [
      { label: "Semantic Search" },
      { label: "RAG Engine" },
      { label: "Paper Graph" },
      { label: "Collaboration" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { label: "Authentication" },
      { label: "Endpoints" },
      { label: "Webhooks" },
    ],
  },
  {
    title: "Resources",
    items: [{ label: "Tutorials" }, { label: "FAQ" }, { label: "Changelog" }],
  },
];

const onThisPage = ["Quick Start", "Analyzing Your First Paper", "Using RAG Search"];
const resources = ["Video Tutorials", "API Playground", "Sample Datasets"];

function DocsPage() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        {/* Docs top bar */}
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/docs" className="text-muted-foreground hover:text-foreground">
              Docs
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">Getting Started</span>
          </nav>

          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search Openpaper documentation..."
              className="w-full rounded-lg border border-border bg-background/40 py-2 pl-9 pr-16 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              CMD K
            </kbd>
          </div>

          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Bell className="h-5 w-5" />
            </button>
            <Link
              to="/settings"
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Settings className="h-5 w-5" />
            </Link>
            <div
              className="h-9 w-9 rounded-full ring-2 ring-primary/40"
              style={{ background: "linear-gradient(135deg,oklch(0.4_0.05_270),oklch(0.6_0.1_290))" }}
            />
          </div>
        </header>

        <div className="flex flex-1">
          {/* Docs left nav */}
          <aside className="hidden w-64 shrink-0 border-r border-border px-6 py-8 lg:block">
            <div className="space-y-7">
              {navSections.map((section) => (
                <div key={section.title}>
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </div>
                  <ul className="space-y-1.5">
                    {section.items.map((item) => (
                      <li key={item.label}>
                        <a
                          href="#"
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
                            item.active
                              ? "border-l-2 border-primary pl-2 font-medium text-primary"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 px-10 py-10">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <ChevronLeft className="h-3.5 w-3.5" /> Overview
              </div>
              <h1 className="mt-4 text-5xl font-bold tracking-tight">Getting Started with Openpaper</h1>
              <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                Openpaper is a high-performance research platform designed to automate the synthesis of
                academic literature using Hermes RAG engines.
              </p>

              {/* 01 Quick Start */}
              <Section number="01" title="Quick Start" />
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                To begin your first research project, initialize the Openpaper CLI and connect your citation
                library (Zotero or Mendeley).
              </p>
              <CodeBlock
                lang="bash"
                lines={[
                  { c: "muted", t: "# Install the Openpaper Hermes CLI" },
                  { c: "code", t: <><span className="text-[oklch(0.78_0.16_30)]">npm</span> install -g @openpaper/hermes-cli</> },
                  { c: "spacer" },
                  { c: "muted", t: "# Initialize your local workspace" },
                  { c: "code", t: <><span className="text-[oklch(0.78_0.16_30)]">hermes</span> init my-research-project</> },
                  { c: "code", t: <>? Enter project description: <span className="text-[oklch(0.74_0.18_155)]">Quantum computing impact on cryptography</span></> },
                ]}
              />

              {/* 02 Analyzing */}
              <Section number="02" title="Analyzing Your First Paper" />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <FeatureCard
                  icon={<FileText className="h-5 w-5 text-primary" />}
                  title="Bulk Upload"
                  desc="Drag and drop hundreds of PDFs at once. Hermes auto-extracts citations, abstracts, and metadata instantly."
                />
                <FeatureCard
                  icon={<Tag className="h-5 w-5 text-[oklch(0.74_0.18_155)]" />}
                  title="Automated Tagging"
                  desc="Semantic tags are generated based on content, allowing precise filtering across thousands of documents."
                />
              </div>
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                Once uploaded, use the <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">analyze</code>{" "}
                command to trigger the Hermes extraction pipeline.
              </p>
              <CodeBlock
                lang="hermes.py"
                lines={[
                  { c: "code", t: <><span className="text-[oklch(0.7_0.2_300)]">import</span> hermes_core</> },
                  { c: "spacer" },
                  { c: "muted", t: "# Initialize analysis for a specific CID" },
                  { c: "code", t: <>paper = hermes_core.Paper(<span className="text-[oklch(0.74_0.18_155)]">"CID_88421_TRANS"</span>)</> },
                  { c: "code", t: <>results = paper.extract_key_findings(model=<span className="text-[oklch(0.74_0.18_155)]">"hermes-v2-max"</span>)</> },
                  { c: "spacer" },
                  { c: "code", t: <><span className="text-[oklch(0.7_0.2_300)]">print</span>(results.summary)</> },
                ]}
              />

              {/* 03 RAG */}
              <Section number="03" title="Using RAG Search" />
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Retrieval-Augmented Generation (RAG) allows you to "talk" to your paper library. Unlike standard
                LLMs, RAG only uses your uploaded research as the source of truth, eliminating hallucinations.
              </p>

              <div
                className="mt-6 overflow-hidden rounded-2xl border border-border"
                style={{
                  background:
                    "radial-gradient(circle at 30% 50%, oklch(0.35 0.15 300 / 0.5), transparent 60%), radial-gradient(circle at 70% 50%, oklch(0.4 0.18 280 / 0.4), transparent 60%), oklch(0.18 0.04 280)",
                }}
              >
                <div className="flex h-48 items-end p-5">
                  <div className="flex w-full items-start gap-3 rounded-xl bg-background/70 p-4 backdrop-blur">
                    <MessageSquareText className="mt-0.5 h-5 w-5 text-primary" />
                    <p className="text-sm font-medium">
                      "What are the consensus limitations of the 2023 GPT-4 architecture?"
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer cards */}
              <div className="mt-10 border-t border-border pt-10" />
              <div className="grid gap-4 sm:grid-cols-2">
                <CtaCard
                  title="Need Help?"
                  desc="Our research support team is ready to assist with onboarding, integration, and complex query design."
                  cta="Contact Support"
                  iconBg="oklch(0.45 0.18 300 / 0.4)"
                  icon={<HelpCircle className="h-7 w-7 text-primary" />}
                />
                <CtaCard
                  title="Community"
                  desc="Join our growing community of researchers and engineers on the Openpaper Discord server."
                  cta="Discord Server"
                  iconBg="oklch(0.45 0.18 155 / 0.3)"
                  icon={<MessageSquareText className="h-7 w-7 text-[oklch(0.74_0.18_155)]" />}
                />
              </div>

              {/* Prev/Next */}
              <div className="mt-10 flex items-center justify-between border-t border-border pt-6 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Previous
                  </div>
                  <div className="mt-1 text-muted-foreground">None</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Next
                  </div>
                  <div className="mt-1 font-medium">Architecture Overview</div>
                </div>
              </div>
            </div>
          </main>

          {/* Right rail */}
          <aside className="hidden w-64 shrink-0 px-6 py-10 xl:block">
            <div>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                On This Page
              </div>
              <ul className="space-y-2 text-sm">
                {onThisPage.map((s, i) => (
                  <li key={s}>
                    <a
                      href="#"
                      className={cn(
                        "block transition-colors",
                        i === 0 ? "text-primary" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Resources
              </div>
              <ul className="space-y-2 text-sm">
                {resources.map((s) => (
                  <li key={s}>
                    <a
                      href="#"
                      className="flex items-center justify-between text-muted-foreground hover:text-foreground"
                    >
                      {s} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 rounded-2xl border border-border bg-card p-5 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary/15">
                <Star className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3 text-sm font-medium">Love Openpaper?</div>
              <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold uppercase tracking-wider text-background hover:opacity-90">
                Star on GitHub <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Section({ number, title }: { number: string; title: string }) {
  return (
    <div className="mt-14 flex items-center gap-4">
      <span className="rounded-md bg-primary/15 px-2.5 py-1 text-sm font-semibold text-primary">
        {number}
      </span>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3">{icon}</div>
      <div className="font-semibold">{title}</div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

type CodeLine =
  | { c: "muted" | "code"; t: React.ReactNode }
  | { c: "spacer"; t?: undefined };

function CodeBlock({ lang, lines }: { lang: string; lines: CodeLine[] }) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-[oklch(0.18_0.02_280)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs">
        <span className="text-muted-foreground">{lang}</span>
        <button className="text-muted-foreground hover:text-foreground">Copy</button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-6">
        {lines.map((l, i) => {
          if (l.c === "spacer") return <div key={i}>&nbsp;</div>;
          return (
            <div
              key={i}
              className={l.c === "muted" ? "text-muted-foreground" : "text-foreground"}
            >
              {l.t}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function CtaCard({
  title,
  desc,
  cta,
  icon,
  iconBg,
}: {
  title: string;
  desc: string;
  cta: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div
        className="absolute -right-6 -top-6 grid h-24 w-24 place-items-center rounded-full"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
      <p className="mt-2 max-w-[80%] text-xs leading-relaxed text-muted-foreground">{desc}</p>
      <button className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground hover:text-primary">
        {cta} <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}