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

  app.notFound((c) => {
    const rid = c.get("requestId");
    return c.json<ErrorEnvelope>(
      toErrorPayload("NOT_FOUND", "Route not found", rid),
      404,
    );
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
