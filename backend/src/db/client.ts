import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "@/config/env.js";
import * as schema from "./schema.js";

const dbPath = resolve(env.DATABASE_URL);

// Ensure directory exists before better-sqlite3 opens the file.
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);

// Safer defaults for a local-first service.
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");

export const db = drizzle(sqlite, { schema, casing: "snake_case" });
export const rawDb = sqlite;
export { schema };
