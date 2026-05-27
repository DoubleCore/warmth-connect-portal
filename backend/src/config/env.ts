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

  // ---------- FastClaw Agent（轻量对话通道） ----------
  // 详见 fastclaw/ARCHITECTURE.md — OpenAI 兼容 /v1/chat/completions
  FASTCLAW_BASE_URL: z.string().url().default("http://127.0.0.1:18953"),
  FASTCLAW_API_KEY: optionalString(),
  FASTCLAW_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  /** FastClaw 上要对话的 Agent ID（agt_xxx），留空则用默认 Agent */
  FASTCLAW_AGENT_ID: optionalString(),
  /** 论文部署 Agent */
  FASTCLAW_AGENT_DEPLOY: optionalString(),
  /** RAG 论文阅读 Agent */
  FASTCLAW_AGENT_PAPER_ANALYSE: optionalString(),
  /** 论文搜索 Agent */
  FASTCLAW_AGENT_RESEARCHER: optionalString(),

  // ---------- Agent 配置（per-agent agent.json 持久化） ----------
  /**
   * Agent 配置目录。每个 agent 一份子目录：
   *   <AGENTS_DIR>/<agent-id>/agent.json
   *   <AGENTS_DIR>/<agent-id>/skills/...
   *   <AGENTS_DIR>/<agent-id>/memory/...
   *   <AGENTS_DIR>/<agent-id>/conversations/...
   *
   * 默认相对 backend 根目录。打包后启动器会把 data/agents 的绝对路径塞进来。
   */
  AGENTS_DIR: z.string().min(1).default("./data/agents"),
  /**
   * 渲染给 FastClaw `-config` 的 JSON 路径。后端启动 / agent 配置变更时会写入这个文件，
   * 启动器读取它再拉起 hermes-fastclaw.exe。运行期可以由 backend 自己重启 fastclaw 子进程
   * （v1 不重启，下一阶段补）。
   */
  FASTCLAW_CONFIG_PATH: z.string().min(1).default("./data/config/fastclaw.json"),
  /**
   * FastClaw 的 defaultAgentId。当请求未指定 agent 时回退到这一项。
   * 不填则取 FASTCLAW_AGENT_ID；再不填就用 paper-search agent。
   */
  FASTCLAW_DEFAULT_AGENT_ID: optionalString(),

  // ---------- 前端静态托管（仅桌面安装包用） ----------
  /**
   * 桌面打包后由启动器塞进来：指向 `app/frontend/`（含 prerender 出来的 index.html
   * 和 `assets/...`）。留空 → backend 不挂载静态资源（开发场景由 vite dev server 服务前端）。
   *
   * 路径必须可被 fs 访问；启动期 `bootstrap` 阶段会做存在性检查并把日志带出来，避免
   * "桌面包装好之后用户访问根路径只看到 404" 这种沉默失败。
   */
  FRONTEND_STATIC_DIR: optionalString(),

  // ---------- Hermes Launcher 控制通道 ----------
  /**
   * 桌面安装包模式下，由 Hermes.exe 启动器注入。指向 launcher 的本地控制 HTTP，
   * 仅 127.0.0.1 监听。backend 在用户改完 agent 配置后会请求 `/control/fastclaw/restart`
   * 让 launcher 把 fastclaw 子进程重启一次，让新的 API Key / model 立即生效。
   *
   * 留空 → backend 不调用（dev 场景或者 launcher 没有用到时）。
   */
  HERMES_LAUNCHER_CONTROL_URL: optionalString(),

  // ---------- RAG LLM / Embedding ----------
  // 详见 Design_SQLite_Abstract_RAG.md §7 / §9 / §11
  // 任意 OpenAI 兼容的服务都行（OpenAI / DeepSeek / 本地 ollama / DashScope 兼容模式）。
  // 三个 *_MODEL 和 *_BASE_URL / *_API_KEY 都留空 → 整个 RAG LLM 链路被禁用，
  // POST /api/rag/query 会 503，但 GET /api/rag/search（FTS5 关键词）照常工作。
  LLM_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_API_KEY: optionalString(),
  LLM_CHAT_MODEL: z.string().min(1).default("gpt-4o-mini"),
  LLM_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

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
