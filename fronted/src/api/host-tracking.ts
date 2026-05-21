import { apiFetch } from "@/lib/api-client";

export type GpuMetrics = {
  index: number;
  name: string;
  utilizationPct: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  temperatureC: number | null;
  powerW: number | null;
};

export type HostMetricsDto = {
  id: string;
  deviceId: string;
  online: boolean;
  latencyMs: number | null;
  hostname: string | null;
  kernel: string | null;
  uptimeSeconds: number | null;
  cpuLoad1m: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  diskUsedPct: number | null;
  gpus: GpuMetrics[] | null;
  errorMessage: string | null;
  collectedAt: string;
};

export type HostWithLatestMetricsDto = {
  deviceId: string;
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  keyFile: string | null;
  hostLabel: string | null;
  trackingEnabled: boolean;
  consecutiveFailures: number;
  lastError: string | null;
  lastSeenAt: string | null;
  latestMetrics: HostMetricsDto | null;
};

export async function getHostDetail(deviceId: string) {
  return apiFetch<HostWithLatestMetricsDto>(
    `/api/host-tracking/hosts/${encodeURIComponent(deviceId)}`,
  );
}

export async function getHostMetricsHistory(
  deviceId: string,
  options?: { limit?: number; since?: string },
) {
  return apiFetch<{ items: HostMetricsDto[] }>(
    `/api/host-tracking/hosts/${encodeURIComponent(deviceId)}/metrics`,
    { query: { limit: options?.limit ?? 30, since: options?.since } },
  );
}

export async function probeHost(deviceId: string) {
  return apiFetch<HostMetricsDto>(
    `/api/host-tracking/hosts/${encodeURIComponent(deviceId)}/probe`,
    { method: "POST" },
  );
}
