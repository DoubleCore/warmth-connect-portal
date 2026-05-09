import { createFileRoute } from "@tanstack/react-router";
import { HardDrive, CheckCircle2, RefreshCw, AlertCircle, Filter, Server } from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Hermes AI" },
      { name: "description", content: "Manage GPU resources and monitor active training tasks." },
    ],
  }),
  component: WorkspacePage,
});

const stats = [
  { label: "Total Devices", value: "24", icon: HardDrive, accent: "text-muted-foreground" },
  { label: "Available", value: "8", icon: CheckCircle2, accent: "text-[oklch(0.74_0.18_155)]" },
  { label: "Running", value: "15", icon: RefreshCw, accent: "text-primary" },
  { label: "Error", value: "1", icon: AlertCircle, accent: "text-destructive" },
];

type Status = "Running" | "Pending" | "Success" | "Failed";

const tasks: {
  title: string;
  runId: string;
  status: Status;
  device: string | null;
  progress: number;
}[] = [
  { title: "Attention Is All You Need: Replication", runId: "run-id-7a8b9c", status: "Running", device: "node-04-gpu-1", progress: 65 },
  { title: "BERT Pre-training Fine-tune", runId: "run-id-1d2e3f", status: "Pending", device: null, progress: 0 },
  { title: "ResNet50 Baseline Eval", runId: "run-id-9x8y7z", status: "Success", device: "node-01-gpu-3", progress: 100 },
  { title: "GPT-2 Sparse Attention Test", runId: "run-id-4p5q6r", status: "Failed", device: "node-02-gpu-0", progress: 42 },
];

const statusStyles: Record<Status, { dot: string; chip: string; bar: string; label: string }> = {
  Running: {
    dot: "bg-[oklch(0.74_0.18_155)]",
    chip: "bg-[oklch(0.74_0.18_155)]/15 text-[oklch(0.74_0.18_155)] ring-[oklch(0.74_0.18_155)]/30",
    bar: "bg-primary",
    label: "Running",
  },
  Pending: {
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground ring-border",
    bar: "bg-muted",
    label: "Pending",
  },
  Success: {
    dot: "bg-primary",
    chip: "bg-primary/15 text-primary ring-primary/30",
    bar: "bg-primary",
    label: "Success",
  },
  Failed: {
    dot: "bg-destructive",
    chip: "bg-destructive/15 text-destructive ring-destructive/30",
    bar: "bg-destructive",
    label: "Failed",
  },
};

function WorkspacePage() {
  return (
    <Shell active="Workspace">
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <header>
          <h1 className="text-4xl font-semibold tracking-tight">Workspace Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Manage GPU resources and monitor active training tasks.</p>
        </header>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Device Overview</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <s.icon className={cn("h-4 w-4", s.accent)} />
                  {s.label}
                </div>
                <div className="mt-3 text-3xl font-semibold tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Training Tasks</h2>
            <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              <Filter className="h-4 w-4" /> Filter
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-[2fr_140px_180px_1fr_80px] gap-4 border-b border-border bg-card/60 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <div>Paper Title / Task</div>
              <div>Status</div>
              <div>Assigned Device</div>
              <div>Progress</div>
              <div className="text-right">Actions</div>
            </div>
            {tasks.map((t) => {
              const s = statusStyles[t.status];
              return (
                <div
                  key={t.runId}
                  className="grid grid-cols-[2fr_140px_180px_1fr_80px] items-center gap-4 border-b border-border bg-card px-6 py-4 transition-colors last:border-0 hover:bg-secondary/40"
                >
                  <div>
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">{t.runId}</div>
                  </div>
                  <div>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1", s.chip)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                      {s.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {t.device ? (
                      <>
                        <Server className="h-3.5 w-3.5" />
                        <span className="font-mono text-xs">{t.device}</span>
                      </>
                    ) : (
                      <span className="italic">Queued</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full transition-all", s.bar)}
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{t.progress}%</span>
                  </div>
                  <div className="text-right">
                    <button className="text-xs text-primary hover:underline">Logs</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Shell>
  );
}