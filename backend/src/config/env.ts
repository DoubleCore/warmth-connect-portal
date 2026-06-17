import "dotenv/config";
import { z } from "zod";

/**
 * 把 "" 视作 undefined。
 *
 * .env 里常见写法 `LLM_API_KEY=` 会被 dotenv 解析成空字符串而不是缺失，
 * 直接套 `.optional()` 的话空字符串会走到内层 `.min(1)` 报错。
 * 对所有"允许留空"的可选 key 都套一层这个，让"缺失"和"留空"等价。
 */
const optionalString = () =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(1).optional(),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1).default("./data/app.db"),
  PDF_STORAGE_DIR: z.string().min(1).default("./storage/pdfs"),
  CORS_ORIGIN: z.string().default("*"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // ---------- Hermes Agent 同机 HTTP 直连 ----------
  // 详见 Hermes_Command_Center_HTTP_直连可用版.md §2 / §7
  HERMES_BASE_URL: z.string().url().default("http://127.0.0.1:8642"),
  HERMES_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // 可选。Hermes 侧若启用 token 鉴权，则通过 Authorization: Bearer <key> 携带。
  HERMES_API_KEY: optionalString(),

  // ---------- FastClaw Agent（轻量对话通道） ----------
  // 详见 fastclaw/ARCHITECTURE.md — OpenAI 兼容 /v1/chat/completions
  FASTCLAW_BASE_URL: z.string().url().default("http://127.0.0.1:18953"),
  FASTCLAW_API_KEY: optionalString(),
  FASTCLAW_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  /** FastClaw 上要对话的 Agent ID（agt_xxx），留空则用默认 Agent */
  FASTCLAW_AGENT_ID: optionalString(),
  /** 论文部署 Agent */
  FASTCLAW_AGENT_DEPLOY: optionalString(),
  /** 论文解析 Agent */
  FASTCLAW_AGENT_PAPER_ANALYSE: optionalString(),
  /** 论文研究/阅读 Agent */
  FASTCLAW_AGENT_RESEARCHER: optionalString(),

  // ---------- RAG LLM / Embedding ----------
  // 详见 Design_SQLite_Abstract_RAG.md §7 / §9 / §11
  // 任意 OpenAI 兼容的服务都行（OpenAI / DeepSeek / 本地 ollama / DashScope 兼容模式）。
  // *_API_KEY 留空 → 整个 RAG LLM 链路被禁用，POST /api/rag/query 会 503，
  // 但 GET /api/rag/search（FTS5 关键词）照常工作。
  //
  // DeepSeek 注意：其 OpenAI 兼容面只有 /chat/completions，没有 /embeddings。
  // 用 DeepSeek 时把 LLM_EMBEDDINGS_ENABLED 设为 false，问答走 FTS5 召回 + LLM 生成。
  LLM_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_API_KEY: optionalString(),
  LLM_CHAT_MODEL: z.string().min(1).default("gpt-4o-mini"),
  LLM_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /**
   * 该 LLM 后端是否提供 /embeddings 接口。
   * OpenAI / DashScope 兼容模式有 → 留 true。
   * DeepSeek 只有 /chat/completions（无 embeddings）→ 设为 false，
   * RAG 会直接跳过 embedding 生成与语义重排，只靠 FTS5 关键词召回，
   * 避免每次录入/查询都打一个必然失败的 /embeddings 请求。
   */
  LLM_EMBEDDINGS_ENABLED: z
    .preprocess((v) => (typeof v === "string" ? v.toLowerCase() !== "false" : v), z.boolean())
    .default(true),

  // ---------- Host Tracking ----------
  // 主机 SSH 凭证加密密钥：32 字节 hex（64 字符）。生成方式：
  //   npm run host:keygen
  // 留空 → 创建/读取主机时不会做加密，POST /api/host-tracking 创建带密码的主机会 503。
  HOST_CRED_KEY: optionalString(),
  /** 采集调度 cron 表达式，默认每分钟一次。设置为 disabled 可关闭定时采集（测试场景）。 */
  HOST_TRACKING_CRON: z.string().min(1).default("* * * * *"),
  /** 连续采集失败 N 次后切换到退避周期。 */
  HOST_TRACKING_BACKOFF_THRESHOLD: z.coerce.number().int().positive().default(3),
  /** 退避时长（毫秒），默认 5 分钟。 */
  HOST_TRACKING_BACKOFF_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60 * 1000),
  /** 单次 SSH 采集总超时（毫秒）。 */
  HOST_TRACKING_PROBE_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  /** 是否在服务启动时自动启用调度器。测试 / 开发可设 false。 */
  HOST_TRACKING_ENABLED: z
    .preprocess((v) => (typeof v === "string" ? v.toLowerCase() !== "false" : v), z.boolean())
    .default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
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
