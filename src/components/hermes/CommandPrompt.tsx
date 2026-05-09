import { useState } from "react";
import { Sparkles, CornerDownLeft, Search, FileText, MessageSquare, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

const quickActions = [
  { label: "Search Papers", icon: Search },
  { label: "Analyze PDF", icon: FileText },
  { label: "Chat with RAG", icon: MessageSquare },
  { label: "Manage Training", icon: Cpu },
];

const recent = [
  {
    title: "Attention Is All You Need",
    meta: "Analyzed 2 hours ago • Extraction Complete",
    tag: "PDF",
    icon: FileText,
    accent: "text-muted-foreground",
  },
  {
    title: "Model Training: Hermes-V2",
    meta: "Running • Epoch 42/100 • Loss: 0.24",
    tag: "TASK",
    icon: Sparkles,
    accent: "text-[oklch(0.74_0.18_155)]",
  },
];

export function CommandPrompt() {
  const [value, setValue] = useState("");

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-14">
      <div className="text-center">
        <h2 className="text-5xl font-semibold tracking-tight">What shall we analyze today?</h2>
        <p className="mt-4 text-muted-foreground">
          Enter a command, natural language query, or drop a PDF.
        </p>
      </div>

      <div className="mt-10 group relative">
        <div className="absolute -inset-px rounded-2xl opacity-60 blur-md transition-opacity group-focus-within:opacity-100" style={{ background: "var(--gradient-primary)" }} />
        <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Summarize recent advancements in transformer architectures…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button className="rounded-lg bg-secondary p-2 text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground">
            <CornerDownLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {quickActions.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-6 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-glow)]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-12">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          <button className="text-sm text-primary hover:underline">View All</button>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {recent.map((r) => (
            <div
              key={r.title}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/40"
            >
              <r.icon className={cn("h-5 w-5", r.accent)} />
              <div className="flex-1">
                <div className="font-medium">{r.title}</div>
                <div className="text-xs text-muted-foreground">{r.meta}</div>
              </div>
              <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground">
                {r.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}