import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { ZodError } from "zod";
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
import { llmConfigRouter } from "@/modules/llm-config/llm-config.routes.js";
import { fastclawRouter } from "@/modules/fastclaw/fastclaw.routes.js";
import { hostTrackingRouter } from "@/modules/host-tracking/host-tracking.routes.js";

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

/**
 * Resolve the HTTP status a thrown error will map to — mirrors the branches in
 * app.onError. Used by the access-log middleware, whose `finally` runs while the
 * exception is still unwinding (before onError replaces c.res), so reading
 * c.res.status there would otherwise log the default 200 for failed requests.
 */
function errorStatus(err: unknown): number {
  if (err instanceof AppError) return err.statusCode;
  if (err instanceof ZodError) return 400;
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 600) return status;
  return 500;
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

    let errStatus: number | undefined;
    try {
      await next();
    } catch (err) {
      // onError hasn't run yet during unwinding; capture the real status here
      // and re-throw so onError still builds the response body.
      errStatus = errorStatus(err);
      throw err;
    } finally {
      const durationMs = Date.now() - start;
      const status = errStatus ?? c.res.status;
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
  app.route("/api/llm-config", llmConfigRouter);
  app.route("/api/fastclaw", fastclawRouter);
  app.route("/api/host-tracking", hostTrackingRouter);

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
        toErrorPayload(
          "HTTP_ERROR",
          // 生产环境不回传原始 message——上游 fetch 错误常带内部 URL/主机名。
          env.NODE_ENV === "development" ? err.message : "Upstream request failed",
          rid,
        ),
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
