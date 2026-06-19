// Copy non-TS runtime assets that `tsc` does not emit into dist/.
// Currently: Drizzle .sql migrations + meta journal, which migrate.ts resolves
// relative to its own compiled location (dist/db/migrations).
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const src = resolve(root, "src/db/migrations");
const dest = resolve(root, "dist/db/migrations");

await mkdir(dirname(dest), { recursive: true });
await cp(src, dest, { recursive: true });

console.log(`[copy-assets] migrations -> ${dest}`);
