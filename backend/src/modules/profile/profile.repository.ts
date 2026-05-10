import { eq } from "drizzle-orm";
import { db } from "@/db/client.js";
import { userProfile, type UserProfileRow } from "@/db/schema.js";

const PROFILE_ROW_ID = 1;

export async function getProfile(): Promise<UserProfileRow | null> {
  const rows = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.id, PROFILE_ROW_ID))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Upsert the single profile row. Uses SQLite's `ON CONFLICT DO UPDATE` via
 * drizzle so the operation is atomic and idempotent.
 */
export async function upsertProfile(username: string | null): Promise<UserProfileRow> {
  const nowIso = new Date().toISOString();
  const [row] = await db
    .insert(userProfile)
    .values({ id: PROFILE_ROW_ID, username, updatedAt: nowIso })
    .onConflictDoUpdate({
      target: userProfile.id,
      set: { username, updatedAt: nowIso },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert profile");
  return row;
}
