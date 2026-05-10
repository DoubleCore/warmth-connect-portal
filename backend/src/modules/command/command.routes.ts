import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import { baseLogger } from "@/shared/logger.js";
import {
  createCommandSessionSchema,
  sendCommandMessageSchema,
} from "./command.dto.js";
import * as service from "./command.service.js";
import { hermesClient } from "./hermes.client.js";

/**
 * 挂在 /api/command 上。
 * 对应 Hermes_Command_Center_HTTP_直连可用版.md §5。
 *
 * Phase 1 路由：
 *   POST /api/command/sessions                          创建会话
 *   POST /api/command/sessions/:sessionId/messages      发送一条指令（非流式）
 *   GET  /api/command/commands/:commandId/events        事件回放（调试 + Phase 2 SSE 重连的基础）
 *   GET  /api/command/_debug/hermes-ping                快速确认 Backend 能否连通 Hermes
 *
 * Phase 2 再新增：
 *   GET  /api/command/commands/:commandId/stream        SSE 推送
 *   POST /api/command/confirmations/:confirmationId     确认卡片
 */
export const commandRouter = createRouter();

// ---------- sessions ----------

commandRouter.post(
  "/sessions",
  zv("json", createCommandSessionSchema),
  async (c) => {
    const body = c.req.valid("json");
    const session = await service.createSession(body);
    return created(c, session);
  },
);

// ---------- messages（Phase 1 非流式） ----------

commandRouter.post(
  "/sessions/:sessionId/messages",
  zv("json", sendCommandMessageSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = c.req.valid("json");
    const logger = c.get("logger") ?? baseLogger;
    const result = await service.sendMessage(sessionId, body, logger);
    return ok(c, result);
  },
);

// ---------- events（调试 + Phase 2 重连基础） ----------

commandRouter.get("/commands/:commandId/events", async (c) => {
  const commandId = c.req.param("commandId");
  const events = await service.listEvents(commandId);
  return ok(c, { commandId, events });
});

// ---------- 调试：联调 Hermes 是否可达 ----------

commandRouter.get("/_debug/hermes-ping", async (c) => {
  const logger = c.get("logger") ?? baseLogger;
  const reachable = await hermesClient.ping(logger);
  return ok(c, { reachable });
});
