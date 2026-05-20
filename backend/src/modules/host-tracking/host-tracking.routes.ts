import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";

import { createHostSchema, metricsQuerySchema, updateHostSchema } from "./host-tracking.dto.js";
import * as service from "./host-tracking.service.js";

export const hostTrackingRouter = createRouter();

/** 列出所有主机（含最新一次快照） */
hostTrackingRouter.get("/hosts", async (c) => {
  const result = await service.listHosts();
  return ok(c, result);
});

/** 创建主机（绑定到已存在的 device） */
hostTrackingRouter.post("/hosts", zv("json", createHostSchema), async (c) => {
  const body = c.req.valid("json");
  const host = await service.createHost(body);
  return created(c, host);
});

/** 单台主机详情 + 最新快照 */
hostTrackingRouter.get("/hosts/:deviceId", async (c) => {
  const deviceId = c.req.param("deviceId");
  const host = await service.getHost(deviceId);
  return ok(c, host);
});

/** 更新主机（修改 IP / 端口 / 凭证 / 是否追踪） */
hostTrackingRouter.patch("/hosts/:deviceId", zv("json", updateHostSchema), async (c) => {
  const deviceId = c.req.param("deviceId");
  const body = c.req.valid("json");
  const host = await service.updateHost(deviceId, body);
  return ok(c, host);
});

/** 删除主机（级联清理 metrics 快照） */
hostTrackingRouter.delete("/hosts/:deviceId", async (c) => {
  const deviceId = c.req.param("deviceId");
  await service.deleteHost(deviceId);
  return c.body(null, 204);
});

/** 历史指标查询（图表数据） */
hostTrackingRouter.get("/hosts/:deviceId/metrics", zv("query", metricsQuerySchema), async (c) => {
  const deviceId = c.req.param("deviceId");
  const query = c.req.valid("query");
  const result = await service.listMetrics(deviceId, query);
  return ok(c, result);
});

/** 立即触发一次采集（不等 cron） */
hostTrackingRouter.post("/hosts/:deviceId/probe", async (c) => {
  const deviceId = c.req.param("deviceId");
  const metrics = await service.probeHostById(deviceId, "manual");
  return ok(c, metrics);
});
