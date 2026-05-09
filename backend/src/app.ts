import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { ZodError } from "zod";
import { corsOrigins, env } from "@/config/env.js";
import { AppError } from "@/shared/errors.js";
import { logger } from "@/shared/logger.js";
import { papersRouter } from "@/modules/papers/papers.routes.js";
import { devicesRouter } from "@/modules/devices/devices.routes.js";
import { reproductionRouter } from "@/modules/reproduction/reproduction.routes.js";
import { paperRagRouter, ragRouter } from "@/modules/rag/rag.routes.js";

export function createApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: corsOrigins === "*" ? "*" : corsOrigins,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: corsOrigins !== "*",
    }),
  );

  if (env.NODE_ENV !== "test") {
    app.use("*", honoLogger((message) => logger.info(message)));
  }

  app.get("/health", (c) =>
    c.json({ status: "ok", uptime: process.uptime(), env: env.NODE_ENV }),
  );

  // Paper-scoped RAG endpoints live under /api/papers/:paperId/rag/...
  // so mount the paper-rag router before the generic papers router is matched
  // for those paths. Hono picks routes by path order, so both work under /api/papers.
  app.route("/api/papers", paperRagRouter);
  app.route("/api/papers", papersRouter);

  app.route("/api/rag", ragRouter);
  app.route("/api/devices", devicesRouter);
  app.route("/api/reproduction-records", reproductionRouter);

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.statusCode as Parameters<typeof c.json>[1],
      );
    }
    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request",
            details: err.flatten(),
          },
        },
        400,
      );
    }
    // Hono's HTTPException has status
    const status = (err as { status?: number }).status;
    if (typeof status === "number" && status >= 400 && status < 600) {
      logger.warn({ err, status }, "HTTP error");
      return c.json(
        { error: { code: "HTTP_ERROR", message: err.message } },
        status as Parameters<typeof c.json>[1],
      );
    }
    logger.error({ err }, "Unhandled error");
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: env.NODE_ENV === "development" ? err.message : "Internal server error",
        },
      },
      500,
    );
  });

  return app;
}
