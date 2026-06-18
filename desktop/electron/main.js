"use strict";

// Hermes AI desktop shell — Electron main process.
//
// Responsibilities (mirrors WINDOWS_PACKAGING_ENGINEERING_LOOP §6):
//   1. Resolve resource locations via process.resourcesPath (packaged) or the
//      monorepo layout (dev). Never hard-code machine paths.
//   2. Apply DB migrations, then spawn the Hono backend under the bundled Node
//      runtime (better-sqlite3's native binary is ABI-matched to that Node, so
//      no electron-rebuild is needed).
//   3. Spawn the TanStack Start SSR frontend server under the bundled Node.
//   4. Best-effort spawn the FastClaw gateway (non-fatal if absent).
//   5. Write all logs to app.getPath("userData")/logs.
//   6. Kill every child on quit so nothing lingers.

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

// Pin the app name so userData lands in %APPDATA%\HermesAI regardless of the
// package.json "name" field. collect-logs.ps1 reads from the same location.
app.setName("HermesAI");

// ---- Fixed desktop ports (isolated from the dev environment) ----------------
const BACKEND_PORT = 18787;
const FRONTEND_PORT = 15173;
const FASTCLAW_PORT = 18953;
const BACKEND_HEALTH = `http://127.0.0.1:${BACKEND_PORT}/health`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}/`;

// ---- Paths ------------------------------------------------------------------
const isPackaged = app.isPackaged;

/**
 * Root of the bundled runtime resources.
 *  - packaged: <install>/resources   (electron-builder extraResources)
 *  - dev:      <repo>/desktop/resources-staged (produced by prepare-resources)
 */
function resourcesRoot() {
  if (isPackaged) return process.resourcesPath;
  return path.join(__dirname, "..", "resources-staged");
}

const RES = resourcesRoot();
const NODE_BIN = path.join(RES, "node", process.platform === "win32" ? "node.exe" : "node");
const BACKEND_DIR = path.join(RES, "backend");
const FRONTEND_DIR = path.join(RES, "frontend");
const FASTCLAW_EXE = path.join(RES, "fastclaw", "fastclaw.exe");

const USER_DATA = app.getPath("userData");
const LOG_DIR = path.join(USER_DATA, "logs");
const DB_PATH = path.join(USER_DATA, "data", "app.db");
const PDF_DIR = path.join(USER_DATA, "storage", "pdfs");
const FASTCLAW_HOME = path.join(USER_DATA, "fastclaw");

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(PDF_DIR, { recursive: true });

// ---- Logging ----------------------------------------------------------------
const mainLogStream = fs.createWriteStream(path.join(LOG_DIR, "main.log"), { flags: "a" });

function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(" ")}\n`;
  mainLogStream.write(line);
  process.stdout.write(line);
}

function childLogStream(name) {
  return fs.createWriteStream(path.join(LOG_DIR, `${name}.log`), { flags: "a" });
}

log("==== Hermes desktop starting ====");
log(`isPackaged=${isPackaged}`);
log(`resourcesPath=${process.resourcesPath}`);
log(`RES=${RES}`);
log(`NODE_BIN=${NODE_BIN}`);
log(`USER_DATA=${USER_DATA}`);
log(`DB_PATH=${DB_PATH}`);

// Surface any otherwise-silent main-process crash into the log file.
process.on("uncaughtException", (err) => {
  log(`[FATAL] uncaughtException: ${err && err.stack ? err.stack : String(err)}`);
});
process.on("unhandledRejection", (reason) => {
  log(`[FATAL] unhandledRejection: ${reason && reason.stack ? reason.stack : String(reason)}`);
});

// ---- Child process registry -------------------------------------------------
/** @type {import("node:child_process").ChildProcess[]} */
const children = [];
let quitting = false;

function track(child, name) {
  children.push(child);
  child.on("exit", (code, signal) => {
    log(`[${name}] exited code=${code} signal=${signal}`);
    if (!quitting && (name === "backend" || name === "frontend") && code !== 0) {
      log(`[${name}] crashed unexpectedly`);
    }
  });
  child.on("error", (err) => log(`[${name}] spawn error: ${err.message}`));
  return child;
}

function backendEnv() {
  return {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(BACKEND_PORT),
    DATABASE_URL: DB_PATH,
    PDF_STORAGE_DIR: PDF_DIR,
    CORS_ORIGIN: FRONTEND_URL.replace(/\/$/, ""),
    LOG_LEVEL: "info",
    // host-tracking does outbound SSH on a cron; keep it off for a clean desktop boot.
    HOST_TRACKING_ENABLED: "false",
    FASTCLAW_BASE_URL: `http://127.0.0.1:${FASTCLAW_PORT}`,
  };
}

// ---- Spawns -----------------------------------------------------------------
function runMigrations() {
  return new Promise((resolve) => {
    const migrateEntry = path.join(BACKEND_DIR, "dist", "db", "migrate.js");
    if (!fs.existsSync(migrateEntry)) {
      log(`[migrate] entry missing: ${migrateEntry} — skipping`);
      return resolve(false);
    }
    log("[migrate] applying migrations...");
    const stream = childLogStream("backend");
    const child = spawn(NODE_BIN, [migrateEntry], {
      cwd: BACKEND_DIR,
      env: backendEnv(),
      windowsHide: true,
    });
    child.stdout.pipe(stream);
    child.stderr.pipe(stream);
    child.on("exit", (code) => {
      log(`[migrate] exit code=${code}`);
      resolve(code === 0);
    });
    child.on("error", (err) => {
      log(`[migrate] error: ${err.message}`);
      resolve(false);
    });
  });
}

function startBackend() {
  const entry = path.join(BACKEND_DIR, "dist", "server.js");
  log(`[backend] starting ${entry} on :${BACKEND_PORT}`);
  const stream = childLogStream("backend");
  const child = spawn(NODE_BIN, [entry], {
    cwd: BACKEND_DIR,
    env: backendEnv(),
    windowsHide: true,
  });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  track(child, "backend");
}

function startFrontend() {
  const entry = path.join(FRONTEND_DIR, "frontend-server.mjs");
  log(`[frontend] starting ${entry} on :${FRONTEND_PORT}`);
  const stream = childLogStream("frontend");
  const child = spawn(NODE_BIN, [entry], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(FRONTEND_PORT),
      FRONTEND_DIST: path.join(FRONTEND_DIR, "dist"),
      // SSR server forwards /api/* to the backend.
      BACKEND_ORIGIN: `http://127.0.0.1:${BACKEND_PORT}`,
      HONO_NODE_SERVER: path.join(
        BACKEND_DIR,
        "node_modules",
        "@hono",
        "node-server",
        "dist",
        "index.mjs",
      ),
    },
    windowsHide: true,
  });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  track(child, "frontend");
}

function startFastclaw() {
  if (!fs.existsSync(FASTCLAW_EXE)) {
    log(`[fastclaw] binary not found at ${FASTCLAW_EXE} — skipping (non-fatal)`);
    return;
  }
  fs.mkdirSync(FASTCLAW_HOME, { recursive: true });
  log(`[fastclaw] starting gateway on :${FASTCLAW_PORT}`);
  const stream = childLogStream("fastclaw");
  const child = spawn(FASTCLAW_EXE, ["gateway", "--port", String(FASTCLAW_PORT)], {
    cwd: path.dirname(FASTCLAW_EXE),
    env: {
      ...process.env,
      FASTCLAW_HOME,
      FASTCLAW_PORT: String(FASTCLAW_PORT),
      // No Docker Desktop on target machines — enable the host_exec escape hatch
      // so agent exec tool calls fall back to the Windows host.
      FASTCLAW_ALLOW_HOST_EXEC: "true",
    },
    windowsHide: true,
  });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  track(child, "fastclaw");
}

// ---- Health polling ---------------------------------------------------------
function waitForHttp(url, { tries = 40, intervalMs = 500 } = {}) {
  return new Promise((resolve) => {
    let n = 0;
    const attempt = () => {
      n += 1;
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          log(`[health] ${url} -> ${res.statusCode} (attempt ${n})`);
          return resolve(true);
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (n >= tries) {
        log(`[health] ${url} never became ready after ${tries} attempts`);
        return resolve(false);
      }
      setTimeout(attempt, intervalMs);
    };
    attempt();
  });
}

// ---- Window -----------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // External links open in the user's browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(FRONTEND_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function boot() {
  log("[boot] whenReady fired — starting runtimes");
  const migrated = await runMigrations();
  if (!migrated) log("[boot] migrations did not succeed cleanly — continuing, backend may fail");

  startBackend();
  startFrontend();
  startFastclaw();

  const [beOk, feOk] = await Promise.all([
    waitForHttp(BACKEND_HEALTH),
    waitForHttp(FRONTEND_URL),
  ]);
  log(`[boot] backend healthy=${beOk} frontend healthy=${feOk}`);

  createWindow();
}

// ---- Lifecycle --------------------------------------------------------------
// NOTE: no single-instance lock. It added a stale-lock failure mode (a hard-
// killed prior instance leaves the lock wedged, making every relaunch quit with
// gotLock=false) without being a v0.1 requirement. Revisit in v0.2 with proper
// stale-lock recovery if multi-launch guarding is actually needed.
app.whenReady().then(boot).catch((err) => {
  log(`[FATAL] boot threw: ${err && err.stack ? err.stack : String(err)}`);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

function killChildren() {
  quitting = true;
  for (const child of children) {
    if (child.killed || child.exitCode !== null) continue;
    try {
      if (process.platform === "win32" && child.pid) {
        // Kill the whole tree — node/fastclaw may spawn grandchildren.
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      } else {
        child.kill("SIGTERM");
      }
    } catch (err) {
      log(`[shutdown] failed to kill pid=${child.pid}: ${err.message}`);
    }
  }
}

app.on("before-quit", () => {
  log("[shutdown] before-quit — terminating children");
  killChildren();
});

process.on("exit", killChildren);
