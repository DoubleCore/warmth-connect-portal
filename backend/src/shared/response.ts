import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * 成功响应信封：
 * {
 *   "success": true,
 *   "data": <actual payload>
 * }
 */
export type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

/**
 * 错误响应信封：
 * {
 *   "success": false,
 *   "error": { "code": "...", "message": "...", "details"?: ... }
 * }
 */
export type ErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = SuccessEnvelope<T> | ErrorEnvelope;

/** 200 OK 成功响应 */
export function ok<T>(c: Context, data: T) {
  return c.json<SuccessEnvelope<T>>({ success: true, data });
}

/** 指定状态码的成功响应（常用于 201 Created） */
export function okWith<T>(c: Context, data: T, status: ContentfulStatusCode) {
  return c.json<SuccessEnvelope<T>>({ success: true, data }, status);
}

/** 201 Created 便捷函数 */
export function created<T>(c: Context, data: T) {
  return okWith(c, data, 201);
}
