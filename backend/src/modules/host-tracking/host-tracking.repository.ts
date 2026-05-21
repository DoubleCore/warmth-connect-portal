/**
 * Host Tracking 数据访问层
 *
 * 只做纯 SQL 操作；密码加解密、业务校验都在 service 层。
 */

import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db/client.js";
import {
  hostCredentials,
  hostMetricsSnapshot,
  type HostCredentialRow,
  type HostMetricsSnapshotRow,
  type NewHostCredentialRow,
  type NewHostMetricsSnapshotRow,
} from "@/db/schema.js";

// ============================================================
// host_credentials
// ============================================================

export async function listHostCredentials(): Promise<HostCredentialRow[]> {
  return db.select().from(hostCredentials).orderBy(asc(hostCredentials.createdAt));
}

export async function listTrackingHostCredentials(): Promise<HostCredentialRow[]> {
  return db
    .select()
    .from(hostCredentials)
    .where(eq(hostCredentials.trackingEnabled, true))
    .orderBy(asc(hostCredentials.createdAt));
}

export async function getHostCredentialById(deviceId: string): Promise<HostCredentialRow | null> {
  const rows = await db
    .select()
    .from(hostCredentials)
    .where(eq(hostCredentials.deviceId, deviceId))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertHostCredential(
  input: NewHostCredentialRow,
): Promise<HostCredentialRow> {
  const [row] = await db.insert(hostCredentials).values(input).returning();
  if (!row) throw new Error("Failed to insert host_credentials row");
  return row;
}

export async function updateHostCredential(
  deviceId: string,
  patch: Partial<NewHostCredentialRow>,
): Promise<HostCredentialRow | null> {
  const merged = { ...patch, updatedAt: new Date().toISOString() };
  const [row] = await db
    .update(hostCredentials)
    .set(merged)
    .where(eq(hostCredentials.deviceId, deviceId))
    .returning();
  return row ?? null;
}

export async function deleteHostCredential(deviceId: string): Promise<boolean> {
  const result = await db
    .delete(hostCredentials)
    .where(eq(hostCredentials.deviceId, deviceId))
    .returning({ deviceId: hostCredentials.deviceId });
  return result.length > 0;
}

// ============================================================
// host_metrics_snapshot
// ============================================================

export async function insertMetricsSnapshot(
  input: NewHostMetricsSnapshotRow,
): Promise<HostMetricsSnapshotRow> {
  const [row] = await db.insert(hostMetricsSnapshot).values(input).returning();
  if (!row) throw new Error("Failed to insert host_metrics_snapshot row");
  return row;
}

export async function getLatestSnapshot(deviceId: string): Promise<HostMetricsSnapshotRow | null> {
  const rows = await db
    .select()
    .from(hostMetricsSnapshot)
    .where(eq(hostMetricsSnapshot.deviceId, deviceId))
    .orderBy(desc(hostMetricsSnapshot.collectedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 一次性取多台主机最新快照。批量主页加载时用，避免 N+1。
 *
 * 实现方式：用 SQL 子查询拿每台 device 的最新 collected_at，再 join 回主表。
 * Drizzle 原生不支持 lateral / window 函数，先简单实现：在 repo 层并发调用
 * getLatestSnapshot —— 主机数 ≤ 几十台时这是 OK 的。
 */
export async function getLatestSnapshotsByDeviceIds(
  deviceIds: string[],
): Promise<Map<string, HostMetricsSnapshotRow>> {
  const map = new Map<string, HostMetricsSnapshotRow>();
  await Promise.all(
    deviceIds.map(async (id) => {
      const snap = await getLatestSnapshot(id);
      if (snap) map.set(id, snap);
    }),
  );
  return map;
}

export async function listSnapshots(
  deviceId: string,
  options: { since?: string; until?: string; limit: number },
): Promise<HostMetricsSnapshotRow[]> {
  const conditions = [eq(hostMetricsSnapshot.deviceId, deviceId)];
  if (options.since) conditions.push(gte(hostMetricsSnapshot.collectedAt, options.since));
  if (options.until) conditions.push(lte(hostMetricsSnapshot.collectedAt, options.until));
  return db
    .select()
    .from(hostMetricsSnapshot)
    .where(and(...conditions))
    .orderBy(desc(hostMetricsSnapshot.collectedAt))
    .limit(options.limit);
}
