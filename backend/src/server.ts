import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { rawDb } from "./db/client.js";
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

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return; // 防重入：双 Ctrl+C / SIGINT 后又 SIGTERM
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`);

  // 10s 兜底：若优雅关闭卡住，强制退出。
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  try {
    // 1) 停调度器并 drain 在跑的 probe（把 DB 写完）
    await stopHostTrackingScheduler();
    // 2) 停止接收新请求
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // 3) 关闭 SQLite（WAL checkpoint），避免 -wal 段无限增长 / 锁残留
    rawDb.close();
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
