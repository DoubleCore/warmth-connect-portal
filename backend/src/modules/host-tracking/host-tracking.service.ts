/**
 * Host Tracking 业务层
 *
 * 职责：
 *   - 凭证加解密 (encryptSecret / decryptSecret)
 *   - DTO 序列化（永不返回密文）
 *   - 单次采集 (probeHost)：被 routes 的"立即触发"路径和 scheduler 共用
 *   - 退避策略：连续失败 N 次后打开 backoffUntil 窗口
 */

import { env } from "@/config/env.js";
import type {
  HostCredentialRow,
  HostMetricsSnapshotRow,
  NewHostCredentialRow,
  NewHostMetricsSnapshotRow,
} from "@/db/schema.js";
import { AppError, NotFoundError } from "@/shared/errors.js";
import { logger } from "@/shared/logger.js";

import { decryptSecret, encryptSecret } from "./crypto.js";
import { collectMetrics, type CollectResult } from "./host-tracking.collector.js";
import type {
  CreateHostInput,
  GpuMetrics,
  HostDto,
  HostMetricsDto,
  HostWithLatestMetricsDto,
  MetricsQueryInput,
  UpdateHostInput,
} from "./host-tracking.dto.js";
import * as repo from "./host-tracking.repository.js";

// ============================================================
// DTO 序列化
// ============================================================

export function toHostDto(row: HostCredentialRow): HostDto {
  return {
    deviceId: row.deviceId,
    host: row.host,
    port: row.port,
    username: row.username,
    hasPassword: Boolean(row.encryptedPassword),
    keyFile: row.keyFile,
    hostLabel: row.hostLabel,
    trackingEnabled: Boolean(row.trackingEnabled),
    consecutiveFailures: row.consecutiveFailures,
    backoffUntil: row.backoffUntil,
    lastError: row.lastError,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMetricsDto(row: HostMetricsSnapshotRow): HostMetricsDto {
  let gpus: GpuMetrics[] | null = null;
  if (row.gpusJson) {
    try {
      gpus = JSON.parse(row.gpusJson) as GpuMetrics[];
    } catch (err) {
      logger.warn({ err, deviceId: row.deviceId }, "host metrics: failed to parse gpus_json");
    }
  }
  return {
    id: row.id,
    deviceId: row.deviceId,
    online: Boolean(row.online),
    latencyMs: row.latencyMs,
    hostname: row.hostname,
    kernel: row.kernel,
    uptimeSeconds: row.uptimeSeconds,
    cpuLoad1m: row.cpuLoad1m,
    memoryUsedMb: row.memoryUsedMb,
    memoryTotalMb: row.memoryTotalMb,
    diskUsedPct: row.diskUsedPct,
    gpus,
    errorMessage: row.errorMessage,
    collectedAt: row.collectedAt,
  };
}

// ============================================================
// CRUD
// ============================================================

export async function listHosts(): Promise<{ items: HostWithLatestMetricsDto[] }> {
  const rows = await repo.listHostCredentials();
  if (rows.length === 0) return { items: [] };
  const ids = rows.map((r) => r.deviceId);
  const latest = await repo.getLatestSnapshotsByDeviceIds(ids);
  const items = rows.map((r) => ({
    ...toHostDto(r),
    latestMetrics: latest.has(r.deviceId) ? toMetricsDto(latest.get(r.deviceId)!) : null,
  }));
  return { items };
}

export async function getHost(deviceId: string): Promise<HostWithLatestMetricsDto> {
  const row = await repo.getHostCredentialById(deviceId);
  if (!row) throw new NotFoundError("Host", deviceId);
  const snap = await repo.getLatestSnapshot(deviceId);
  return {
    ...toHostDto(row),
    latestMetrics: snap ? toMetricsDto(snap) : null,
  };
}

export async function createHost(input: CreateHostInput): Promise<HostDto> {
  // 业务唯一性检查 — 一个 device 最多一条凭证 (主键约束兜底)
  const existing = await repo.getHostCredentialById(input.deviceId);
  if (existing) {
    throw new AppError(
      `Host credential for device ${input.deviceId} already exists`,
      409,
      "HOST_ALREADY_EXISTS",
    );
  }

  const payload: NewHostCredentialRow = {
    deviceId: input.deviceId,
    host: input.host,
    port: input.port,
    username: input.username,
    encryptedPassword: input.password ? encryptSecret(input.password) : null,
    keyFile: input.keyFile ?? null,
    hostLabel: input.hostLabel ?? null,
    trackingEnabled: input.trackingEnabled,
  };
  const row = await repo.insertHostCredential(payload);
  return toHostDto(row);
}

export async function updateHost(deviceId: string, input: UpdateHostInput): Promise<HostDto> {
  const existing = await repo.getHostCredentialById(deviceId);
  if (!existing) throw new NotFoundError("Host", deviceId);

  const patch: Partial<NewHostCredentialRow> = {};
  if (input.host !== undefined) patch.host = input.host;
  if (input.port !== undefined) patch.port = input.port;
  if (input.username !== undefined) patch.username = input.username;
  if (input.password !== undefined) {
    patch.encryptedPassword = input.password === null ? null : encryptSecret(input.password);
  }
  if (input.keyFile !== undefined) {
    patch.keyFile = input.keyFile === null ? null : input.keyFile;
  }
  if (input.hostLabel !== undefined) patch.hostLabel = input.hostLabel ?? null;
  if (input.trackingEnabled !== undefined) patch.trackingEnabled = input.trackingEnabled;

  // 任何凭证 / 主机变更都重置退避状态
  if (
    input.host !== undefined ||
    input.port !== undefined ||
    input.username !== undefined ||
    input.password !== undefined ||
    input.keyFile !== undefined
  ) {
    patch.consecutiveFailures = 0;
    patch.backoffUntil = null;
    patch.lastError = null;
  }

  const row = await repo.updateHostCredential(deviceId, patch);
  if (!row) throw new NotFoundError("Host", deviceId);
  return toHostDto(row);
}

export async function deleteHost(deviceId: string): Promise<void> {
  const ok = await repo.deleteHostCredential(deviceId);
  if (!ok) throw new NotFoundError("Host", deviceId);
}

// ============================================================
// 历史指标
// ============================================================

export async function listMetrics(
  deviceId: string,
  query: MetricsQueryInput,
): Promise<{ items: HostMetricsDto[] }> {
  // 校验主机存在
  const host = await repo.getHostCredentialById(deviceId);
  if (!host) throw new NotFoundError("Host", deviceId);

  const rows = await repo.listSnapshots(deviceId, {
    since: query.since,
    until: query.until,
    limit: query.limit,
  });
  return { items: rows.map(toMetricsDto) };
}

// ============================================================
// 单次 probe — 共用入口（被 scheduler 与 REST 手动触发共用）
// ============================================================

interface ProbeContext {
  reason: "scheduled" | "manual";
}

export async function probeHost(
  cred: HostCredentialRow,
  context: ProbeContext,
): Promise<HostMetricsDto> {
  const log = logger.child({ deviceId: cred.deviceId, host: cred.host, reason: context.reason });
  log.debug("host-tracking probe start");

  // 密码从数据库读出并解密
  let password: string | undefined;
  if (cred.encryptedPassword) {
    password = decryptSecret(cred.encryptedPassword);
  }

  const result: CollectResult = await collectMetrics({
    host: cred.host,
    port: cred.port,
    username: cred.username,
    auth: {
      password,
      keyFile: cred.keyFile ?? undefined,
    },
    timeoutMs: env.HOST_TRACKING_PROBE_TIMEOUT_MS,
  });

  if (result.online) {
    const snap = await repo.insertMetricsSnapshot({
      deviceId: cred.deviceId,
      online: true,
      latencyMs: result.latencyMs,
      hostname: result.hostname,
      kernel: result.kernel,
      uptimeSeconds: result.uptimeSeconds,
      cpuLoad1m: result.cpuLoad1mPct,
      memoryUsedMb: result.memoryUsedMb,
      memoryTotalMb: result.memoryTotalMb,
      diskUsedPct: result.diskUsedPct,
      gpusJson: result.gpus ? JSON.stringify(result.gpus) : null,
    } satisfies NewHostMetricsSnapshotRow);

    await repo.updateHostCredential(cred.deviceId, {
      consecutiveFailures: 0,
      backoffUntil: null,
      lastError: null,
      lastSeenAt: snap.collectedAt,
    });
    log.debug(
      { latencyMs: result.latencyMs, gpuCount: result.gpus?.length ?? 0 },
      "host-tracking probe success",
    );
    return toMetricsDto(snap);
  }

  log.warn({ errorMessage: result.errorMessage }, "host-tracking probe failed");
  const snap = await persistFailure(cred, result.errorMessage, result.latencyMs, context.reason);
  return toMetricsDto(snap);
}

async function persistFailure(
  cred: HostCredentialRow,
  errorMessage: string,
  latencyMs: number | null,
  _reason: "scheduled" | "manual",
): Promise<HostMetricsSnapshotRow> {
  const snap = await repo.insertMetricsSnapshot({
    deviceId: cred.deviceId,
    online: false,
    latencyMs,
    errorMessage,
  } satisfies NewHostMetricsSnapshotRow);

  const nextFailures = cred.consecutiveFailures + 1;
  const backoffUntil =
    nextFailures >= env.HOST_TRACKING_BACKOFF_THRESHOLD
      ? new Date(Date.now() + env.HOST_TRACKING_BACKOFF_MS).toISOString()
      : cred.backoffUntil;

  await repo.updateHostCredential(cred.deviceId, {
    consecutiveFailures: nextFailures,
    backoffUntil,
    lastError: errorMessage,
  });
  return snap;
}

export async function probeHostById(
  deviceId: string,
  reason: "scheduled" | "manual" = "manual",
): Promise<HostMetricsDto> {
  const cred = await repo.getHostCredentialById(deviceId);
  if (!cred) throw new NotFoundError("Host", deviceId);
  return probeHost(cred, { reason });
}

// ============================================================
// Scheduler 用：批量取该 tick 应该跑的主机
// ============================================================

export async function listDueHostsForTick(now = new Date()): Promise<HostCredentialRow[]> {
  const all = await repo.listTrackingHostCredentials();
  return all.filter((cred) => {
    if (!cred.backoffUntil) return true;
    return new Date(cred.backoffUntil).getTime() <= now.getTime();
  });
}
