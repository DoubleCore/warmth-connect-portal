import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { ZodError } from "zod";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { corsOrigins, env } from "@/config/env.js";
import type { AppEnv } from "@/shared/context.js";
import { AppError } from "@/shared/errors.js";
import { baseLogger } from "@/shared/logger.js";
import type { ErrorEnvelope } from "@/shared/response.js";
import { papersRouter } from "@/modules/papers/papers.routes.js";
import { devicesRouter } from "@/modules/devices/devices.routes.js";
import { reproductionRouter } from "@/modules/reproduction/reproduction.routes.js";
import { ragRouter } from "@/modules/rag/rag.routes.js";
import { profileRouter } from "@/modules/profile/profile.routes.js";
import { fastclawRouter } from "@/modules/fastclaw/fastclaw.routes.js";
import { hostTrackingRouter } from "@/modules/host-tracking/host-tracking.routes.js";
import { agentsRouter } from "@/modules/agents/agents.routes.js";

function toErrorPayload(
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): ErrorEnvelope {
  const error: ErrorEnvelope["error"] = { code, message };
  if (details !== undefined) error.details = details;
  // Surface requestId on the error so clients can report issues without
  // needing to parse response headers.
  (error as Record<string, unknown>).requestId = requestId;
  return { success: false, error };
}

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    cors({
      origin: corsOrigins === "*" ? "*" : corsOrigins,
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id"],
      credentials: corsOrigins !== "*",
    }),
  );

  // Generate / propagate X-Request-Id. Hono writes it to c.get("requestId")
  // and automatically mirrors the header in the response.
  app.use("*", requestId());

  // Per-request child logger + structured access log.
  app.use("*", async (c, next) => {
    const rid = c.get("requestId");
    const reqLogger = baseLogger.child({ requestId: rid });
    c.set("logger", reqLogger);

    const start = Date.now();
    const { method } = c.req;
    const path = c.req.path;

    try {
      await next();
    } finally {
      const durationMs = Date.now() - start;
      const status = c.res.status;
      if (env.NODE_ENV !== "test") {
        reqLogger.info({ method, path, status, durationMs }, "request");
      }
    }
  });

  app.get("/health", (c) =>
    c.json({
      success: true,
      data: {
        status: "ok",
        uptime: process.uptime(),
        env: env.NODE_ENV,
        requestId: c.get("requestId"),
      },
    }),
  );

  // Paper detail / analysis / PDF endpoints.
  app.route("/api/papers", papersRouter);

  app.route("/api/rag", ragRouter);
  app.route("/api/devices", devicesRouter);
  app.route("/api/reproduction-records", reproductionRouter);
  app.route("/api/profile", profileRouter);
  app.route("/api/fastclaw", fastclawRouter);
  app.route("/api/host-tracking", hostTrackingRouter);
  app.route("/api/agents", agentsRouter);

  // ---------- 静态前端（仅桌面安装包） ----------
  // 仅在 FRONTEND_STATIC_DIR 显式配置时启用。开发模式由 vite dev server 服务前端，
  // 不应被 backend 截胡（避免 HMR / SSR 资源被 404 兜底）。
  //
  // 路由顺序很重要：必须排在所有 /api/* 之后、404 之前。
  // serveStatic 会把 c.req.path 与磁盘上的文件直接对应（带 index.html 兜底），
  // 第二个 SPA fallback 用 c.req.path 改写成 `/index.html` 来支持 TanStack Router 的客户端路由。
  if (env.FRONTEND_STATIC_DIR) {
    const staticRoot = isAbsolute(env.FRONTEND_STATIC_DIR)
      ? env.FRONTEND_STATIC_DIR
      : resolve(process.cwd(), env.FRONTEND_STATIC_DIR);

    let staticReady = false;
    try {
      staticReady = existsSync(staticRoot) && statSync(staticRoot).isDirectory();
    } catch {
      staticReady = false;
    }

    if (!staticReady) {
      // 不抛 — 让 backend 起得来；前端访问根路径会落到下面的 404，能看到提示。
      baseLogger.warn(
        { staticRoot },
        "FRONTEND_STATIC_DIR is set but the directory is missing; static frontend disabled.",
      );
    } else {
      // serveStatic 的 root 必须是 cwd 的相对路径。这里我们手动转换：把绝对路径
      // 还原成"相对于 cwd"的路径串。serveStatic 内部最终会用 path.join(root, requestPath)。
      const cwd = process.cwd();
      const rootForServe = isAbsolute(staticRoot)
        ? staticRoot.startsWith(cwd)
          ? staticRoot.slice(cwd.length).replace(/^[\\/]+/, "")
          : staticRoot
        : staticRoot;

      // 1) 直接命中现成文件（assets/index-XXXX.js, /index.html, ...）
      app.use(
        "/*",
        serveStatic({
          root: rootForServe,
        }),
      );

      // 2) SPA fallback —— 任何未命中的 GET 路由（不是 API、不是已知静态文件）
      //    都把 index.html 喂出去，让客户端 router 接管。
      app.use("/*", async (c, next) => {
        if (c.finalized) return next();
        if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
        if (c.req.path.startsWith("/api/")) return next();
        return serveStatic({ root: rootForServe, path: "index.html" })(c, next);
      });

      baseLogger.info({ staticRoot }, "Static frontend mounted");
    }
  }

  app.notFound((c) => {
    const rid = c.get("requestId");
    return c.json<ErrorEnvelope>(toErrorPayload("NOT_FOUND", "Route not found", rid), 404);
  });

  app.onError((err, c) => {
    const rid = c.get("requestId");
    const reqLogger = c.get("logger") ?? baseLogger;

    if (err instanceof AppError) {
      return c.json<ErrorEnvelope>(
        toErrorPayload(err.code, err.message, rid, err.details),
        err.statusCode as ContentfulStatusCode,
      );
    }

    if (err instanceof ZodError) {
      return c.json<ErrorEnvelope>(
        toErrorPayload("VALIDATION_ERROR", "Invalid request", rid, err.flatten()),
        400,
      );
    }

    const status = (err as { status?: number }).status;
    if (typeof status === "number" && status >= 400 && status < 600) {
      reqLogger.warn({ err, status }, "HTTP error");
      return c.json<ErrorEnvelope>(
        toErrorPayload("HTTP_ERROR", err.message, rid),
        status as ContentfulStatusCode,
      );
    }

    reqLogger.error({ err }, "Unhandled error");
    return c.json<ErrorEnvelope>(
      toErrorPayload(
        "INTERNAL_ERROR",
        env.NODE_ENV === "development" ? err.message : "Internal server error",
        rid,
      ),
      500,
    );
  });

  return app;
}
