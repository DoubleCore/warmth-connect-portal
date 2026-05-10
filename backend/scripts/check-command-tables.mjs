import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, "..", "data", "app.db");
const db = new Database(dbPath, { readonly: true });
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('command_sessions','commands','command_events') ORDER BY name",
  )
  .all();
const columns = {};
for (const t of tables) {
  columns[t.name] = db.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name);
}
console.log(JSON.stringify({ dbPath, tables, columns }, null, 2));
db.close();
