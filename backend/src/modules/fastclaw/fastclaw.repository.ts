import { and, asc, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db/client.js";
import {
  fastclawEvents,
  fastclawRuns,
  fastclawSessions,
  type FastClawEventRow,
  type FastClawRunRow,
  type FastClawSessionRow,
} from "@/db/schema.js";
import type { FastClawAgentRole, FastClawRunStatus, CommandStreamEvent } from "./fastclaw.dto.js";

export type FastClawEventRowWithSeq = FastClawEventRow & { seq: number };

const EVENT_SELECT = {
  id: fastclawEvents.id,
  runId: fastclawEvents.runId,
  eventType: fastclawEvents.eventType,
  payloadJson: fastclawEvents.payloadJson,
  createdAt: fastclawEvents.createdAt,
  seq: sql<number>`${fastclawEvents}.rowid`.as("seq"),
} as const;

export async function insertSession(input: {
  entry: string | null;
  initialContext: Record<string, unknown>;
  agentRole: FastClawAgentRole | null;
  agentId: string | null;
  userId: string | null;
}): Promise<FastClawSessionRow> {
  const [row] = await db
    .insert(fastclawSessions)
    .values({
      entry: input.entry,
      initialContextJson: JSON.stringify(input.initialContext ?? {}),
      agentRole: input.agentRole,
      agentId: input.agentId,
      userId: input.userId,
    })
    .returning();
  if (!row) throw new Error("Failed to insert FastClaw session");
  return row;
}

export async function getSessionById(id: string): Promise<FastClawSessionRow | null> {
  const rows = await db.select().from(fastclawSessions).where(eq(fastclawSessions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function insertRun(input: {
  sessionId: string;
  userId: string | null;
  userMessage: string;
  context: Record<string, unknown>;
  agentRole: FastClawAgentRole | null;
  agentId: string | null;
}): Promise<FastClawRunRow> {
  const [row] = await db
    .insert(fastclawRuns)
    .values({
      sessionId: input.sessionId,
      userId: input.userId,
      userMessage: input.userMessage,
      contextJson: JSON.stringify(input.context ?? {}),
      agentRole: input.agentRole,
      agentId: input.agentId,
      status: "pending",
    })
    .returning();
  if (!row) throw new Error("Failed to insert FastClaw run");
  return row;
}

export async function getRunById(id: string): Promise<FastClawRunRow | null> {
  const rows = await db.select().from(fastclawRuns).where(eq(fastclawRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listRunsBySession(
  sessionId: string,
  excludeId?: string,
): Promise<FastClawRunRow[]> {
  const whereExpr = excludeId
    ? and(eq(fastclawRuns.sessionId, sessionId), ne(fastclawRuns.id, excludeId))
    : eq(fastclawRuns.sessionId, sessionId);
  return db.select().from(fastclawRuns).where(whereExpr).orderBy(asc(fastclawRuns.createdAt));
}

export async function updateRunStatus(id: string, status: FastClawRunStatus): Promise<void> {
  await db
    .update(fastclawRuns)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(fastclawRuns.id, id));
}

export async function finalizeRun(
  id: string,
  patch:
    | { status: "completed"; result: unknown }
    | { status: "failed"; error: { code?: string; message: string } }
    | { status: "cancelled" },
): Promise<void> {
  const set: Record<string, unknown> = {
    status: patch.status,
    updatedAt: new Date().toISOString(),
  };
  if (patch.status === "completed") {
    set.resultJson = JSON.stringify(patch.result ?? null);
  }
  if (patch.status === "failed") {
    set.errorJson = JSON.stringify(patch.error);
  }
  await db.update(fastclawRuns).set(set).where(eq(fastclawRuns.id, id));
}

export async function appendEvent(
  runId: string,
  event: CommandStreamEvent,
): Promise<FastClawEventRowWithSeq> {
  const [row] = await db
    .insert(fastclawEvents)
    .values({
      runId,
      eventType: event.type,
      payloadJson: JSON.stringify(event),
    })
    .returning({
      id: fastclawEvents.id,
      runId: fastclawEvents.runId,
      eventType: fastclawEvents.eventType,
      payloadJson: fastclawEvents.payloadJson,
      createdAt: fastclawEvents.createdAt,
      seq: sql<number>`${fastclawEvents}.rowid`,
    });
  if (!row) throw new Error("Failed to append FastClaw event");
  return row as FastClawEventRowWithSeq;
}

export async function listEventsByRun(runId: string): Promise<FastClawEventRowWithSeq[]> {
  const rows = await db
    .select(EVENT_SELECT)
    .from(fastclawEvents)
    .where(eq(fastclawEvents.runId, runId))
    .orderBy(asc(sql`${fastclawEvents}.rowid`));
  return rows as FastClawEventRowWithSeq[];
}

export async function listEventsAfter(
  runId: string,
  afterSeq: number,
): Promise<FastClawEventRowWithSeq[]> {
  const rows = await db
    .select(EVENT_SELECT)
    .from(fastclawEvents)
    .where(and(eq(fastclawEvents.runId, runId), gt(sql`${fastclawEvents}.rowid`, afterSeq)))
    .orderBy(asc(sql`${fastclawEvents}.rowid`));
  return rows as FastClawEventRowWithSeq[];
}

export async function listEventsByRunIds(runIds: string[]): Promise<FastClawEventRowWithSeq[]> {
  if (runIds.length === 0) return [];
  const rows = await db
    .select(EVENT_SELECT)
    .from(fastclawEvents)
    .where(
      sql`${fastclawEvents.runId} IN (${sql.join(
        runIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .orderBy(asc(sql`${fastclawEvents}.rowid`));
  return rows as FastClawEventRowWithSeq[];
}

export async function getEventById(id: string): Promise<FastClawEventRowWithSeq | null> {
  const rows = await db
    .select(EVENT_SELECT)
    .from(fastclawEvents)
    .where(eq(fastclawEvents.id, id))
    .limit(1);
  return (rows[0] as FastClawEventRowWithSeq | undefined) ?? null;
}
