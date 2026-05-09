/**
 * Thin wrapper over `fetch` that:
 *  - Prefixes requests with `VITE_API_BASE_URL` (default http://localhost:8787).
 *  - Unwraps the backend success envelope `{ success: true, data }` into `data`.
 *  - Converts `{ success: false, error }` envelopes and non-2xx responses into `ApiError`.
 *  - Handles 204 No Content by resolving with `undefined`.
 *  - Preserves the server-issued `requestId` so UI can surface it in error toasts.
 *
 * Intentionally has no coupling to TanStack Query; that integration lives in
 * `src/api/*.ts` modules which return plain promises for `queryFn`.
 */

export type ApiErrorDetails = unknown;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetails;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ApiErrorDetails,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
    if (requestId !== undefined) this.requestId = requestId;
  }
}

type SuccessEnvelope<T> = { success: true; data: T };
type ErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

function isEnvelope<T>(body: unknown): body is SuccessEnvelope<T> | ErrorEnvelope {
  return (
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    typeof (body as { success: unknown }).success === "boolean"
  );
}

export function getApiBaseUrl(): string {
  const raw = (import.meta.env?.VITE_API_BASE_URL as string | undefined) ?? "";
  return raw.replace(/\/$/, "") || "http://localhost:8787";
}

export type ApiFetchInit = Omit<RequestInit, "body"> & {
  /** When provided, will be JSON-stringified and Content-Type set automatically. */
  json?: unknown;
  /** Query string parameters appended to the URL. */
  query?: Record<string, string | number | boolean | null | undefined>;
};

function buildUrl(path: string, query?: ApiFetchInit["query"]): string {
  const base = path.startsWith("http") ? path : `${getApiBaseUrl()}${path}`;
  if (!query) return base;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { json, query, headers, ...rest } = init;

  const finalHeaders = new Headers(headers);
  let body: BodyInit | undefined;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!finalHeaders.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json");
    }
  }

  const url = buildUrl(path, query);
  const res = await fetch(url, { ...rest, headers: finalHeaders, body });

  // 204 No Content — used by DELETE endpoints.
  if (res.status === 204) {
    return undefined as T;
  }

  const requestId = res.headers.get("X-Request-Id") ?? undefined;
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    if (!res.ok) {
      throw new ApiError(
        res.status,
        "HTTP_ERROR",
        res.statusText || `Request failed with status ${res.status}`,
        undefined,
        requestId,
      );
    }
    return undefined as T;
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new ApiError(res.status, "PARSE_ERROR", "Failed to parse JSON response", undefined, requestId);
  }

  if (!isEnvelope<T>(parsed)) {
    if (!res.ok) {
      throw new ApiError(res.status, "HTTP_ERROR", res.statusText, parsed, requestId);
    }
    // Legacy shape — return as-is (shouldn't happen in this codebase).
    return parsed as T;
  }

  if (parsed.success) {
    return parsed.data;
  }

  // Error envelope — backend may have already echoed its own requestId inside
  // the body; prefer that over the header value.
  const err = parsed.error;
  throw new ApiError(
    res.status,
    err.code ?? "UNKNOWN",
    err.message ?? "Unknown error",
    err.details,
    err.requestId ?? requestId,
  );
}

/**
 * Absolute URL helper for endpoints the browser should load directly
 * (e.g. binary PDF download or 302 redirect targets).
 */
export function apiUrl(path: string): string {
  return path.startsWith("http") ? path : `${getApiBaseUrl()}${path}`;
}
