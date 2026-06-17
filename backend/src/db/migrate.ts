import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client.js";
import { logger } from "@/shared/logger.js";

// 相对模块自身定位迁移目录，而不是 cwd —— 这样从任意工作目录或编译产物运行都能找到。
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

try {
  migrate(db, { migrationsFolder });
  logger.info({ migrationsFolder }, "Migrations applied successfully");
  process.exit(0);
} catch (error) {
  logger.error({ err: error, migrationsFolder }, "Migration failed");
  process.exit(1);
}
