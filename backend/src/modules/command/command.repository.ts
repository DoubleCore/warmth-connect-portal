import { asc, eq } from "drizzle-orm";
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
): Promise<CommandEventRow> {
  const [row] = await db
    .insert(commandEvents)
    .values({
      commandId,
      eventType: event.type,
      payloadJson: JSON.stringify(event),
    })
    .returning();
  if (!row) throw new Error("Failed to append command event");
  return row;
}

export async function listEventsByCommand(commandId: string): Promise<CommandEventRow[]> {
  return db
    .select()
    .from(commandEvents)
    .where(eq(commandEvents.commandId, commandId))
    .orderBy(asc(commandEvents.createdAt), asc(commandEvents.id));
}
