import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db } from "./client.js";
import { logger } from "@/shared/logger.js";

/**
 * Run drizzle migrations at startup.
 *
 * 路径解析挑战：
 *   - dev (`tsx src/server.ts`)：__dirname 指向 `backend/src/db/`，迁移文件在
 *     `backend/src/db/migrations/`（相对当前文件 `./migrations`）。
 *   - prod (`node dist/server.js`)：__dirname 指向 `backend/dist/db/`，迁移文件
 *     **必须在打包脚本里同步拷贝到** `backend/dist/db/migrations/`，否则启动期立刻
 *     fatal。launcher 也指望这条路径在装包后存在。
 *
 * 为了不假设单一布局，按"当前文件相邻目录 → 仓库源码目录"的顺序找到第一个能用的。
 */
export function runMigrations(): void {
  const candidates = candidateMigrationDirs();
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    try {
      logger.info({ migrationsFolder: dir }, "Applying database migrations");
      migrate(db, { migrationsFolder: dir });
      logger.info("Database migrations applied");
      return;
    } catch (err) {
      // 单点 migration 失败是 fatal — 让 server 退出比带着不完整 schema 起服更安全。
      throw new Error(
        `Failed to run migrations from ${dir}: ${(err as Error).message}`,
        { cause: err },
      );
    }
  }
  throw new Error(
    `No migrations folder found. Looked in: ${candidates.join(", ")}. ` +
      `Make sure src/db/migrations is shipped alongside dist/db/.`,
  );
}

function candidateMigrationDirs(): string[] {
  // import.meta.url → file:// 路径 → __dirname 等价物
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    // 1) 与本模块同级（dev 的 src/db/migrations，prod 的 dist/db/migrations）
    resolve(here, "migrations"),
    // 2) prod 时被打包脚本拷到 dist/migrations 而不是 dist/db/migrations 也兼容
    resolve(here, "..", "migrations"),
    // 3) 兜底：从 cwd 找源码（最不可靠，仅救急）
    resolve(process.cwd(), "src", "db", "migrations"),
    resolve(process.cwd(), "dist", "db", "migrations"),
  ];
}
