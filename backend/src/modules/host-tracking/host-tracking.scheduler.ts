/**
 * Host Tracking 定时调度器
 *
 * 用 node-cron 在 backend 进程内每分钟跑一次采集 — 不需要外置 cron，
 * 重启 backend 自动恢复。
 *
 * 关键设计：
 *   - 互斥执行：上一轮没跑完就跳过这一轮 (避免堆积 + 资源爆炸)
 *   - 多主机并发 SSH：每台主机独立 promise，单台失败不影响其它
 *   - 未捕获异常隔离：Promise.allSettled，全部完成后才结束 tick
 */

import cron, { type ScheduledTask } from "node-cron";

import { env } from "@/config/env.js";
import { logger } from "@/shared/logger.js";

import { listDueHostsForTick, probeHost } from "./host-tracking.service.js";

let task: ScheduledTask | null = null;
let running = false;
/** 当前在跑的 tick promise（用于优雅关闭时 drain） */
let inflight: Promise<void> | null = null;

async function runTick(): Promise<void> {
  if (running) {
    logger.debug("host-tracking tick: previous run still in progress, skip");
    return;
  }
  running = true;
  const tickStart = Date.now();
  try {
    const due = await listDueHostsForTick();
    if (due.length === 0) {
      logger.debug("host-tracking tick: no hosts due");
      return;
    }
    logger.debug({ count: due.length }, "host-tracking tick: starting probes");

    const settled = await Promise.allSettled(
      due.map((cred) => probeHost(cred, { reason: "scheduled" })),
    );

    let success = 0;
    let failure = 0;
    for (const r of settled) {
      if (r.status === "fulfilled") {
        if (r.value.online) success++;
        else failure++;
      } else {
        failure++;
        logger.warn({ err: r.reason }, "host-tracking probe rejected unexpectedly");
      }
    }
    logger.info(
      { count: due.length, success, failure, durationMs: Date.now() - tickStart },
      "host-tracking tick completed",
    );
  } catch (err) {
    logger.error({ err }, "host-tracking tick failed");
  } finally {
    running = false;
  }
}

/**
 * 启动调度器。重复调用幂等。
 *
 * @returns 启动是否成功（false 表示被显式禁用）
 */
export function startHostTrackingScheduler(): boolean {
  if (!env.HOST_TRACKING_ENABLED) {
    logger.info("host-tracking scheduler is disabled by HOST_TRACKING_ENABLED=false");
    return false;
  }
  if (env.HOST_TRACKING_CRON.toLowerCase() === "disabled") {
    logger.info("host-tracking scheduler is disabled by HOST_TRACKING_CRON=disabled");
    return false;
  }
  if (task) {
    logger.debug("host-tracking scheduler already started");
    return true;
  }

  if (!cron.validate(env.HOST_TRACKING_CRON)) {
    logger.error({ cron: env.HOST_TRACKING_CRON }, "host-tracking: invalid cron expression");
    return false;
  }

  task = cron.schedule(env.HOST_TRACKING_CRON, () => {
    inflight = runTick().finally(() => {
      inflight = null;
    });
  });

  logger.info({ cron: env.HOST_TRACKING_CRON }, "host-tracking scheduler started");
  return true;
}

/** 停止调度器（用于优雅关闭）。取消未来触发，并 await 正在跑的 tick 跑完。 */
export async function stopHostTrackingScheduler(): Promise<void> {
  if (task) {
    task.stop();
    task = null;
    logger.info("host-tracking scheduler stopped");
  }
  // drain：让在跑的 probe 把 DB 写完，避免关机时截断快照。
  if (inflight) {
    try {
      await inflight;
    } catch {
      // runTick 自己已 catch 并记日志，这里只是等它结束
    }
  }
}

/** 测试 / 手工触发：立即跑一轮 (不等 cron) */
export async function triggerTickNow(): Promise<void> {
  inflight = runTick().finally(() => {
    inflight = null;
  });
  await inflight;
}
