import pino from "pino";
import { env } from "@/config/env.js";

export const baseLogger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

/**
 * Alias kept for backwards compatibility with modules that imported `logger`
 * before the request-scoped logger was introduced. In HTTP handlers prefer
 * `c.get("logger")` which is a child logger bound to the current requestId.
 */
export const logger = baseLogger;
