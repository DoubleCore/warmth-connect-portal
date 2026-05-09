import { zValidator as baseZValidator } from "@hono/zod-validator";
import type { ZodSchema } from "zod";
import type { ErrorEnvelope } from "./response.js";

type Target = "json" | "query" | "param" | "header" | "form" | "cookie";

/**
 * 统一 zod 校验：失败时返回我们的错误信封，避免 @hono/zod-validator
 * 默认响应形状污染对外 API。
 */
export function zv<T extends ZodSchema>(target: Target, schema: T) {
  return baseZValidator(target, schema, (result, c) => {
    if (!result.success) {
      const payload: ErrorEnvelope = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          details: result.error.flatten(),
        },
      };
      return c.json(payload, 400);
    }
    return undefined;
  });
}
