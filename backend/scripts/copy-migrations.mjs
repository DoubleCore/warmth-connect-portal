#!/usr/bin/env node
/**
 * Post-build: 把 src/db/migrations/ 拷到 dist/db/migrations/。
 *
 * 为什么要单独写这个：
 *   - tsc 只处理 .ts 文件，不会拷贝 .sql 资源。
 *   - drizzle-orm 的 migrator 在运行时读 .sql 文件，prod 下没文件就崩。
 *   - npm 不带 native cp -r，写一个 5 行 Node script 比依赖 shx 之类的更省事。
 *
 * 增量行为：每次完整覆盖目标目录 — migrations 数量很少，复制成本可忽略。
 */
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const src = resolve(projectRoot, "src", "db", "migrations");
const dst = resolve(projectRoot, "dist", "db", "migrations");

await rm(dst, { recursive: true, force: true });
await mkdir(dirname(dst), { recursive: true });
await cp(src, dst, { recursive: true });

console.log(`copied migrations: ${src} -> ${dst}`);
