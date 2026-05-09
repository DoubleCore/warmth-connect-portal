import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client.js";
import {
  ragConversations,
  ragMessages,
  type RagConversationRow,
  type RagMessageRow,
} from "@/db/schema.js";

export async function listConversationsByPaperId(paperId: string): Promise<RagConversationRow[]> {
  return db
    .select()
    .from(ragConversations)
    .where(eq(ragConversations.paperId, paperId))
    .orderBy(desc(ragConversations.createdAt));
}

export async function getConversationById(id: string): Promise<RagConversationRow | null> {
  const rows = await db
    .select()
    .from(ragConversations)
    .where(eq(ragConversations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertConversation(
  paperId: string,
  title: string | null,
): Promise<RagConversationRow> {
  const [row] = await db
    .insert(ragConversations)
    .values({ paperId, title })
    .returning();
  if (!row) throw new Error("Failed to insert conversation");
  return row;
}

export async function touchConversation(id: string): Promise<void> {
  await db
    .update(ragConversations)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(ragConversations.id, id));
}

export async function listMessages(conversationId: string): Promise<RagMessageRow[]> {
  return db
    .select()
    .from(ragMessages)
    .where(eq(ragMessages.conversationId, conversationId))
    .orderBy(asc(ragMessages.createdAt), asc(ragMessages.id));
}

export async function insertMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<RagMessageRow> {
  const [row] = await db
    .insert(ragMessages)
    .values({ conversationId, role, content })
    .returning();
  if (!row) throw new Error("Failed to insert message");
  return row;
}
