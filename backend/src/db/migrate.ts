import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client.js";
import { logger } from "@/shared/logger.js";

try {
  migrate(db, { migrationsFolder: "./src/db/migrations" });
  logger.info("Migrations applied successfully");
  process.exit(0);
} catch (error) {
  logger.error({ err: error }, "Migration failed");
  process.exit(1);
}
