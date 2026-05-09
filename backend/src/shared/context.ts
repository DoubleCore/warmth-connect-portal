import type { Logger } from "pino";
import { Hono } from "hono";

/**
 * Hono app 的全局 Variables 约定。
 * - requestId: 由 hono/request-id 中间件写入，响应头同时会带 X-Request-Id
 * - logger:    由 app.ts 中的日志中间件写入，是 pino 主 logger 的 child，
 *              绑定了当前请求的 requestId，所有 handler 内部的日志都建议用它
 */
export type AppVariables = {
  requestId: string;
  logger: Logger;
};

export type AppEnv = {
  Variables: AppVariables;
};

/**
 * 统一使用的 Hono 工厂，确保每一个 router 都带上 AppVariables 的类型推导，
 * 从而 c.get("requestId") / c.get("logger") 都是强类型的。
 */
export function createRouter() {
  return new Hono<AppEnv>();
}
