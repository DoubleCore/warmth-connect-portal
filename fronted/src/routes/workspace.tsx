import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  HardDrive,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Server,
  Loader2,
  AlertTriangle,
  PowerOff,
} from "lucide-react";
import { Shell } from "@/components/hermes/Shell";
import { DeviceDeleteButton } from "@/components/hermes/DeviceDeleteButton";
import { DeviceFormDialog } from "@/components/hermes/DeviceFormDialog";
import { DeviceStatusPicker } from "@/components/hermes/DeviceStatusPicker";
import { ReproductionDeleteButton } from "@/components/hermes/ReproductionDeleteButton";
import { ReproductionFormDialog } from "@/components/hermes/ReproductionFormDialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { listDevices } from "@/api/devices";
import { listReproductionRecords } from "@/api/reproduction";
import { ApiError, isNetworkError } from "@/lib/api-client";
import type { Device, DeviceStatus } from "@/types/device";
import type { ReproductionRecord, ReproductionStatus } from "@/types/reproduction";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Hermes AI" },
      { name: "description", content: "Manage GPU resources and monitor active training tasks." },
    ],
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const { t } = useI18n();

  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: listDevices,
  });
  const recordsQuery = useQuery({
    queryKey: ["reproduction-records"],
    queryFn: listReproductionRecords,
  });

  const devices = useMemo(() => devicesQuery.data?.items ?? [], [devicesQuery.data]);
  const records = useMemo(() => recordsQuery.data?.items ?? [], [recordsQuery.data]);

  const stats = useMemo(() => {
    const by: Record<DeviceStatus, number> = {
      idle: 0,
      running: 0,
      offline: 0,
      error: 0,
    };
    for (const d of devices) by[d.status] += 1;
    return by;
  }, [devices]);

  return (
    <Shell active="Workspace">
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <header>
          <h1 className="text-4xl font-semibold tracking-tight">{t("workspace.title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("workspace.subtitle")}</p>
        </header>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("workspace.devicesHeading")}</h2>
            <DeviceFormDialog />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label={t("workspace.stat.totalDevices")}
              value={devices.length}
              icon={HardDrive}
              accent="text-muted-foreground"
            />
            <StatCard
              label={t("workspace.stat.idle")}
              value={stats.idle}
              icon={CheckCircle2}
              accent="text-[oklch(0.74_0.18_155)]"
            />
            <StatCard
              label={t("workspace.stat.running")}
              value={stats.running}
              icon={RefreshCw}
              accent="text-primary"
            />
            <StatCard
              label={t("workspace.stat.offline")}
              value={stats.offline}
              icon={PowerOff}
              accent="text-muted-foreground"
            />
            <StatCard
              label={t("workspace.stat.error")}
              value={stats.error}
              icon={AlertCircle}
              accent="text-destructive"
            />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr_80px] gap-4 border-b border-border bg-card/60 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <div>{t("workspace.device.name")}</div>
              <div>{t("workspace.device.type")}</div>
              <div>{t("workspace.device.status")}</div>
              <div>{t("workspace.device.location")}</div>
              <div>{t("workspace.device.description")}</div>
              <div className="text-right">{t("workspace.device.actions")}</div>
            </div>
            {devicesQuery.isLoading ? (
              <BlockMessage loading text={t("workspace.loading")} />
            ) : devicesQuery.isError && !isNetworkError(devicesQuery.error) ? (
              <BlockMessage
                tone="error"
                text={t("workspace.loadError", { message: getErrorMessage(devicesQuery.error) })}
              />
            ) : devices.length === 0 ? (
              <BlockMessage text={t("workspace.empty")} />
            ) : (
              devices.map((d) => <DeviceRow key={d.id} device={d} />)
            )}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("workspace.recordsHeading")}</h2>
            <ReproductionFormDialog mode="create" />
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-[2fr_1fr_1fr_1.4fr_1fr_1fr_96px] gap-4 border-b border-border bg-card/60 px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <div>{t("workspace.record.paper")}</div>
              <div>{t("workspace.record.device")}</div>
              <div>{t("workspace.record.status")}</div>
              <div>{t("workspace.record.progress")}</div>
              <div>{t("workspace.record.startedAt")}</div>
              <div>{t("workspace.record.finishedAt")}</div>
              <div className="text-right">{t("workspace.record.actions")}</div>
            </div>
            {recordsQuery.isLoading ? (
              <BlockMessage loading text={t("workspace.loading")} />
            ) : recordsQuery.isError && !isNetworkError(recordsQuery.error) ? (
              <BlockMessage
                tone="error"
                text={t("workspace.loadError", { message: getErrorMessage(recordsQuery.error) })}
              />
            ) : records.length === 0 ? (
              <BlockMessage text={t("workspace.empty")} />
            ) : (
              records.map((r) => <RecordRow key={r.id} record={r} />)
            )}
          </div>
        </section>
      </div>
    </Shell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof HardDrive;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className={cn("h-4 w-4", accent)} />
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function DeviceRow({ device }: { device: Device }) {
  return (
    <Link
      to="/manager"
      className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr_80px] items-center gap-4 border-b border-border bg-card px-6 py-4 last:border-0 cursor-pointer transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{device.name}</span>
      </div>
      <div className="truncate text-sm text-muted-foreground">{device.deviceType ?? "—"}</div>
      <div>
        <DeviceStatusPicker device={device} />
      </div>
      <div className="truncate text-sm text-muted-foreground">{device.location ?? "—"}</div>
      <div className="truncate text-sm text-muted-foreground">{device.description ?? "—"}</div>
      <div className="flex justify-end" onClick={(e) => e.preventDefault()}>
        <DeviceDeleteButton deviceId={device.id} deviceName={device.name} />
      </div>
    </Link>
  );
}

const recordStatusStyles: Record<ReproductionStatus, { chip: string; bar: string }> = {
  not_started: {
    chip: "bg-muted text-muted-foreground ring-border",
    bar: "bg-muted",
  },
  running: {
    chip: "bg-primary/15 text-primary ring-primary/30",
    bar: "bg-primary",
  },
  success: {
    chip: "bg-[oklch(0.74_0.18_155)]/15 text-[oklch(0.74_0.18_155)] ring-[oklch(0.74_0.18_155)]/30",
    bar: "bg-[oklch(0.74_0.18_155)]",
  },
  failed: {
    chip: "bg-destructive/15 text-destructive ring-destructive/30",
    bar: "bg-destructive",
  },
  paused: {
    chip: "bg-secondary text-muted-foreground ring-border",
    bar: "bg-muted",
  },
};

function RecordRow({ record }: { record: ReproductionRecord }) {
  const { t } = useI18n();
  const style = recordStatusStyles[record.status];
  return (
    <Link
      to="/manager"
      search={{ runId: record.id }}
      className="grid grid-cols-[2fr_1fr_1fr_1.4fr_1fr_1fr_96px] items-center gap-4 border-b border-border bg-card px-6 py-4 last:border-0 cursor-pointer transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{record.paper.title}</div>
        <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{record.id}</div>
      </div>
      <div className="truncate text-sm text-muted-foreground">{record.device?.name ?? "—"}</div>
      <div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
            style.chip,
          )}
        >
          {t(`repro.status.${record.status}`)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn("h-full rounded-full transition-all", style.bar)}
            style={{ width: `${Math.max(0, Math.min(100, record.progress))}%` }}
          />
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {record.progress}%
        </span>
      </div>
      <div className="truncate text-xs text-muted-foreground">{formatTs(record.startedAt)}</div>
      <div className="truncate text-xs text-muted-foreground">{formatTs(record.finishedAt)}</div>
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.preventDefault()}>
        <ReproductionFormDialog mode="edit" record={record} />
        <ReproductionDeleteButton recordId={record.id} paperTitle={record.paper.title} />
      </div>
    </Link>
  );
}

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function BlockMessage({
  text,
  loading = false,
  tone = "muted",
}: {
  text: string;
  loading?: boolean;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 bg-card px-6 py-12 text-sm",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {tone === "error" && !loading && <AlertTriangle className="h-4 w-4" />}
      {text}
    </div>
  );
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
