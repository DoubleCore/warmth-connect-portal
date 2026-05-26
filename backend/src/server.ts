import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./shared/logger.js";
import {
  startHostTrackingScheduler,
  stopHostTrackingScheduler,
} from "./modules/host-tracking/host-tracking.scheduler.js";
import { bootstrapAgents } from "./modules/agents/agents.service.js";

const app = createApp();

// 启动期：补齐种子 agent.json 并渲染 fastclaw.json。
// 失败不阻塞 HTTP 起服 — 用户仍可以从 settings 页继续修配置。
bootstrapAgents().catch((err) => {
  logger.error({ err }, "bootstrapAgents failed");
});

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
