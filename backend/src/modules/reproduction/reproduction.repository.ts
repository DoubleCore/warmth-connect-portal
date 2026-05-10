import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client.js";
import {
  devices,
  paperReproductionRecords,
  papers,
  type DeviceRow,
  type PaperRow,
  type ReproductionRecordRow,
} from "@/db/schema.js";
import type {
  CreateReproductionInput,
  UpdateReproductionInput,
} from "./reproduction.dto.js";

export type ReproductionJoinedRow = {
  record: ReproductionRecordRow;
  paper: Pick<PaperRow, "id" | "title"> | null;
  device: Pick<DeviceRow, "id" | "name"> | null;
};

export async function listRecords(): Promise<ReproductionJoinedRow[]> {
  const rows = await db
    .select({
      record: paperReproductionRecords,
      paper: { id: papers.id, title: papers.title },
      device: { id: devices.id, name: devices.name },
    })
    .from(paperReproductionRecords)
    .leftJoin(papers, eq(paperReproductionRecords.paperId, papers.id))
    .leftJoin(devices, eq(paperReproductionRecords.deviceId, devices.id))
    .orderBy(desc(paperReproductionRecords.createdAt));

  return rows.map((r) => ({
    record: r.record,
    paper: r.paper && r.paper.id !== null ? (r.paper as { id: string; title: string }) : null,
    device: r.device && r.device.id !== null ? (r.device as { id: string; name: string }) : null,
  }));
}

export async function getRecordById(id: string): Promise<ReproductionJoinedRow | null> {
  const rows = await db
    .select({
      record: paperReproductionRecords,
      paper: { id: papers.id, title: papers.title },
      device: { id: devices.id, name: devices.name },
    })
    .from(paperReproductionRecords)
    .leftJoin(papers, eq(paperReproductionRecords.paperId, papers.id))
    .leftJoin(devices, eq(paperReproductionRecords.deviceId, devices.id))
    .where(eq(paperReproductionRecords.id, id))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    record: r.record,
    paper: r.paper && r.paper.id !== null ? (r.paper as { id: string; title: string }) : null,
    device: r.device && r.device.id !== null ? (r.device as { id: string; name: string }) : null,
  };
}

export async function insertRecord(
  input: CreateReproductionInput,
): Promise<ReproductionRecordRow> {
  const [row] = await db
    .insert(paperReproductionRecords)
    .values({
      paperId: input.paperId,
      deviceId: input.deviceId ?? null,
      status: input.status,
      progress: input.progress,
      resultSummary: input.resultSummary ?? null,
      artifactUrl: input.artifactUrl ?? null,
      trainingNotes: input.trainingNotes ?? null,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to insert reproduction record");
  return row;
}

export async function updateRecord(
  id: string,
  input: UpdateReproductionInput,
): Promise<ReproductionRecordRow | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.deviceId !== undefined) patch.deviceId = input.deviceId ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.progress !== undefined) patch.progress = input.progress;
  if (input.resultSummary !== undefined) patch.resultSummary = input.resultSummary ?? null;
  if (input.artifactUrl !== undefined) patch.artifactUrl = input.artifactUrl ?? null;
  if (input.trainingNotes !== undefined) patch.trainingNotes = input.trainingNotes ?? null;
  if (input.startedAt !== undefined) patch.startedAt = input.startedAt ?? null;
  if (input.finishedAt !== undefined) patch.finishedAt = input.finishedAt ?? null;

  const [row] = await db
    .update(paperReproductionRecords)
    .set(patch)
    .where(eq(paperReproductionRecords.id, id))
    .returning();
  return row ?? null;
}

export async function deleteRecord(id: string): Promise<boolean> {
  const result = await db
    .delete(paperReproductionRecords)
    .where(eq(paperReproductionRecords.id, id))
    .returning({ id: paperReproductionRecords.id });
  return result.length > 0;
}
