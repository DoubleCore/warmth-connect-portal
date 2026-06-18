"use strict";

// Stage all runtime resources into desktop/resources-staged/ so both
// `electron .` (dev) and electron-builder (packaged via extraResources) see an
// identical layout:
//
//   resources-staged/
//     node/node.exe              bundled Node runtime (ABI matches better-sqlite3)
//     backend/dist + node_modules(prod) + package.json
//     frontend/dist + frontend-server.mjs
//     fastclaw/fastclaw.exe      (optional — non-fatal if absent)
//
// Run from the desktop/ directory: `node scripts/prepare-resources.mjs`.

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DESKTOP = resolve(here, "..");
const REPO = resolve(DESKTOP, "..");
const FRONTEND_SRC = join(REPO, "fronted");
const BACKEND_SRC = join(REPO, "backend");
const STAGE = join(DESKTOP, "resources-staged");

// Desktop backend port — must match electron/main.js BACKEND_PORT.
const DESKTOP_BACKEND_PORT = 18787;
const BACKED_API_BASE = `http://127.0.0.1:${DESKTOP_BACKEND_PORT}`;

function step(msg) {
  process.stdout.write(`\n=== ${msg} ===\n`);
}

function run(cmd, cwd, env) {
  process.stdout.write(`$ ${cmd}  (cwd=${cwd})\n`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

// ---------------------------------------------------------------------------
step("0. Reset staging dir");
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

// ---------------------------------------------------------------------------
step("1. Bundle Node runtime");
const nodeExe = process.execPath;
mkdirSync(join(STAGE, "node"), { recursive: true });
copyFileSync(nodeExe, join(STAGE, "node", "node.exe"));
process.stdout.write(`node.exe copied from ${nodeExe}\n`);

// ---------------------------------------------------------------------------
step("2. Build frontend (Node SSR target, desktop API base baked in)");
// vite.config.electron.ts disables the Cloudflare plugin -> plain Node SSR build.
run("npx vite build --config vite.config.electron.ts", FRONTEND_SRC, {
  VITE_API_BASE_URL: BACKED_API_BASE,
});
mkdirSync(join(STAGE, "frontend"), { recursive: true });
cpSync(join(FRONTEND_SRC, "dist"), join(STAGE, "frontend", "dist"), { recursive: true });
copyFileSync(
  join(DESKTOP, "electron", "frontend-server.mjs"),
  join(STAGE, "frontend", "frontend-server.mjs"),
);
// Mark the frontend dir as ESM so node parses .js SSR chunks without the
// MODULE_TYPELESS_PACKAGE_JSON reparse warning/overhead.
writeFileSync(join(STAGE, "frontend", "package.json"), JSON.stringify({ type: "module" }, null, 2));

// ---------------------------------------------------------------------------
step("3. Build backend (tsc + alias rewrite + migration copy)");
run("npm run build", BACKEND_SRC);

step("4. Stage backend + production node_modules");
const stagedBackend = join(STAGE, "backend");
mkdirSync(stagedBackend, { recursive: true });
cpSync(join(BACKEND_SRC, "dist"), join(stagedBackend, "dist"), { recursive: true });
copyFileSync(join(BACKEND_SRC, "package.json"), join(stagedBackend, "package.json"));
copyFileSync(join(BACKEND_SRC, "package-lock.json"), join(stagedBackend, "package-lock.json"));
// Production-only deps (keeps better-sqlite3's prebuilt .node, drops dev tooling).
run("npm ci --omit=dev --ignore-scripts=false", stagedBackend);

// ---------------------------------------------------------------------------
step("5. Stage FastClaw binary (optional)");
const fastclawCandidates = [
  join(REPO, "fastclaw", ".upgrade", "fastclaw.exe"),
  // worktree case: binary lives in the primary checkout, not the worktree.
  join(REPO, "..", "..", "..", "fastclaw", ".upgrade", "fastclaw.exe"),
  join(REPO, "..", "fastclaw", ".upgrade", "fastclaw.exe"),
];
const fastclawExe = fastclawCandidates.find((p) => existsSync(p));
if (fastclawExe) {
  mkdirSync(join(STAGE, "fastclaw"), { recursive: true });
  copyFileSync(fastclawExe, join(STAGE, "fastclaw", "fastclaw.exe"));
  process.stdout.write(`fastclaw.exe copied from ${fastclawExe}\n`);
} else {
  process.stdout.write(
    "fastclaw.exe not found in any candidate path — skipping (chat features disabled, non-fatal)\n",
  );
}

step("DONE — resources staged at " + STAGE);
