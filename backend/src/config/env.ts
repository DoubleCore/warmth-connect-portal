import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1).default("./data/app.db"),
  PDF_STORAGE_DIR: z.string().min(1).default("./storage/pdfs"),
  CORS_ORIGIN: z.string().default("*"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // ---------- Hermes Agent 同机 HTTP 直连 ----------
  // 详见 Hermes_Command_Center_HTTP_直连可用版.md §2 / §7
  HERMES_BASE_URL: z.string().url().default("http://127.0.0.1:8642"),
  HERMES_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // 可选。Hermes 侧若启用 token 鉴权，则通过 Authorization: Bearer <key> 携带。
  HERMES_API_KEY: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins =
  env.CORS_ORIGIN === "*"
    ? "*"
    : env.CORS_ORIGIN.split(",")
        .map((s) => s.trim())
        .filter(Boolean);

/** Hard limit for uploaded PDF body size. Tunable via env if we ever need to. */
export const PDF_MAX_BYTES = 26 * 1024 * 1024; // 26 MB
