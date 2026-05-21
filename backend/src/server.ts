import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./shared/logger.js";
import {
  startHostTrackingScheduler,
  stopHostTrackingScheduler,
} from "./modules/host-tracking/host-tracking.scheduler.js";

const app = createApp();

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info(`Backend listening on http://localhost:${info.port} (${env.NODE_ENV})`);
    // Host tracking 在 HTTP 启动后才拉起 — 避免 backend 还没准备好就被 metrics 调用拖累
    startHostTrackingScheduler();
  },
);

function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down...`);
  stopHostTrackingScheduler();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
