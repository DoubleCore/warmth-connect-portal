"use strict";

// Self-contained Node HTTP server for the TanStack Start SSR build.
//
// The production build emits:
//   dist/client/**          static assets (JS/CSS/images)
//   dist/server/server.js   default export { fetch(request, env, ctx) }
//
// We serve static files directly and forward everything else to the SSR fetch
// handler. We reuse @hono/node-server (shipped with the backend) to bridge
// Node's req/res to the Web Fetch API — its path is provided via HONO_NODE_SERVER
// so the frontend payload carries zero node_modules of its own.

import { stat, readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 15173);
const DIST = process.env.FRONTEND_DIST || join(process.cwd(), "dist");
const CLIENT_DIR = normalize(join(DIST, "client"));
const SERVER_ENTRY = join(DIST, "server", "server.js");
const HONO = process.env.HONO_NODE_SERVER;

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function log(...p) {
  process.stdout.write(`[frontend] ${p.join(" ")}\n`);
}

const { serve } = await import(pathToFileURL(HONO).href);
const ssrModule = await import(pathToFileURL(SERVER_ENTRY).href);
const ssr = ssrModule.default;

async function tryStatic(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = normalize(join(CLIENT_DIR, decoded));
  // Guard against path traversal outside the client dir.
  if (!candidate.startsWith(CLIENT_DIR)) return null;
  try {
    const s = await stat(candidate);
    if (!s.isFile()) return null;
    const buf = await readFile(candidate);
    const type = MIME[extname(candidate).toLowerCase()] || "application/octet-stream";
    const headers = { "content-type": type };
    // Hashed asset files are immutable; cache hard.
    if (candidate.includes(`${normalize("/assets/")}`)) {
      headers["cache-control"] = "public, max-age=31536000, immutable";
    }
    return new Response(buf, { headers });
  } catch {
    return null;
  }
}

serve(
  {
    port: PORT,
    hostname: "127.0.0.1",
    fetch: async (request) => {
      const url = new URL(request.url);
      if (request.method === "GET" || request.method === "HEAD") {
        const asset = await tryStatic(url.pathname);
        if (asset) return asset;
      }
      try {
        return await ssr.fetch(request, {}, {});
      } catch (err) {
        log("SSR error:", err && err.stack ? err.stack : String(err));
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },
  (info) => log(`SSR server listening on http://127.0.0.1:${info.port} (dist=${DIST})`),
);
