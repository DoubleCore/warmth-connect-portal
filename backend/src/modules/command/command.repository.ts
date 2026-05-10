import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client.js";
import {
  commandEvents,
  commandSessions,
  commands,
  type CommandEventRow,
  type CommandRow,
  type CommandSessionRow,
} from "@/db/schema.js";
import type { CommandStatus, CommandStreamEvent } from "./command.dto.js";

/**
 * command_events 表是普通 SQLite 表，一定有隐式 rowid 且严格单调。
 * 我们不能只靠 UUID 主键做游标排序（UUID v4 字典序与插入顺序无关），
 * 也不能只靠 createdAt（CURRENT_TIMESTAMP 精度只到秒，同秒内冲突）。
 * 故所有事件查询都显式按 rowid 排序，并把 rowid 作为 seq 暴露给上层。
 */
type CommandEventRowWithSeq = CommandEventRow & { seq: number };
const EVENT_SELECT = {
  id: commandEvents.id,
  commandId: commandEvents.commandId,
  eventType: commandEvents.eventType,
  payloadJson: commandEvents.payloadJson,
  createdAt: commandEvents.createdAt,
  seq: sql<number>`${commandEvents}.rowid`.as("seq"),
} as const;

// ---------- sessions ----------

export async function insertSession(input: {
  entry: string | null;
  initialContext: Record<string, unknown>;
  userId: string | null;
}): Promise<CommandSessionRow> {
  const [row] = await db
    .insert(commandSessions)
    .values({
      entry: input.entry,
      initialContextJson: JSON.stringify(input.initialContext ?? {}),
      userId: input.userId,
    })
    .returning();
  if (!row) throw new Error("Failed to insert command session");
  return row;
}

export async function getSessionById(id: string): Promise<CommandSessionRow | null> {
  const rows = await db
    .select()
    .from(commandSessions)
    .where(eq(commandSessions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// ---------- commands ----------

export async function insertCommand(input: {
  sessionId: string;
  userId: string | null;
  userMessage: string;
  context: Record<string, unknown>;
}): Promise<CommandRow> {
  const [row] = await db
    .insert(commands)
    .values({
      sessionId: input.sessionId,
      userId: input.userId,
      userMessage: input.userMessage,
      status: "pending",
      contextJson: JSON.stringify(input.context ?? {}),
    })
    .returning();
  if (!row) throw new Error("Failed to insert command");
  return row;
}

export async function getCommandById(id: string): Promise<CommandRow | null> {
  const rows = await db.select().from(commands).where(eq(commands.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateCommandStatus(
  id: string,
  status: CommandStatus,
): Promise<void> {
  await db
    .update(commands)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(commands.id, id));
}

/**
 * 写入 Hermes 非流式调用的最终结果。result/error 二选一：
 *  - 完成：status=completed，写 result_json
 *  - 失败：status=failed，写 error_json
 *
 * Phase 2 SSE 成熟后，中间态（running / waiting_confirmation）会分别单独更新。
 */
export async function finalizeCommand(
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
  await db.update(commands).set(set).where(eq(commands.id, id));
}

// ---------- events ----------

export async function appendEvent(
  commandId: string,
  event: CommandStreamEvent,
): Promise<CommandEventRowWithSeq> {
  const [row] = await db
    .insert(commandEvents)
    .values({
      commandId,
      eventType: event.type,
      payloadJson: JSON.stringify(event),
    })
    .returning({
      id: commandEvents.id,
      commandId: commandEvents.commandId,
      eventType: commandEvents.eventType,
      payloadJson: commandEvents.payloadJson,
      createdAt: commandEvents.createdAt,
      seq: sql<number>`${commandEvents}.rowid`,
    });
  if (!row) throw new Error("Failed to append command event");
  return row as CommandEventRowWithSeq;
}

export async function listEventsByCommand(
  commandId: string,
): Promise<CommandEventRowWithSeq[]> {
  const rows = await db
    .select(EVENT_SELECT)
    .from(commandEvents)
    .where(eq(commandEvents.commandId, commandId))
    .orderBy(asc(sql`${commandEvents}.rowid`));
  return rows as CommandEventRowWithSeq[];
}

/**
 * 拉取"某个 seq 之后"的所有事件。seq = rowid，严格单调递增，无同值冲突。
 */
export async function listEventsAfter(
  commandId: string,
  afterSeq: number,
): Promise<CommandEventRowWithSeq[]> {
  const rows = await db
    .select(EVENT_SELECT)
    .from(commandEvents)
    .where(
      and(
        eq(commandEvents.commandId, commandId),
        gt(sql`${commandEvents}.rowid`, afterSeq),
      ),
    )
    .orderBy(asc(sql`${commandEvents}.rowid`));
  return rows as CommandEventRowWithSeq[];
}

/** 根据事件 UUID 定位 seq，用于 Last-Event-ID 重连 */
export async function getEventById(
  id: string,
): Promise<CommandEventRowWithSeq | null> {
  const rows = await db
    .select(EVENT_SELECT)
    .from(commandEvents)
    .where(eq(commandEvents.id, id))
    .limit(1);
  return (rows[0] as CommandEventRowWithSeq | undefined) ?? null;
}

export type { CommandEventRowWithSeq };
