import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

/**
 * SQLite 没有原生 UUID 类型，统一在应用层生成。
 * 这里内联定义是为了让 drizzle-kit（CJS）能直接解析 schema，无需处理路径别名。
 */
const newId = () => randomUUID();

/**
 * papers：论文基础信息表
 * 对应设计文档 4.1
 *
 * 注意：SQLite 没有原生数组类型，authors 使用 JSON 字符串存储，
 * 仓储层负责 parse/stringify，对外暴露 string[]。
 */
export const papers = sqliteTable(
  "papers",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    title: text("title").notNull(),
    // JSON string of string[]
    authorsJson: text("authors_json").notNull().default("[]"),
    abstract: text("abstract"),
    field: text("field"),
    source: text("source"),
    publishedYear: integer("published_year"),
    paperUrl: text("paper_url"),
    pdfUrl: text("pdf_url"),
    // 代码仓库 URL（如 GitHub/GitLab），由 paper-code-finder / repo-backfill 回写
    repoUrl: text("repo_url"),
    // 本地 PDF 文件的相对路径（存在则 /api/papers/:id/pdf 从本地读取）
    pdfStoragePath: text("pdf_storage_path"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    titleIdx: index("papers_title_idx").on(t.title),
    fieldIdx: index("papers_field_idx").on(t.field),
    sourceIdx: index("papers_source_idx").on(t.source),
    yearIdx: index("papers_year_idx").on(t.publishedYear),
  }),
);

/**
 * paper_analysis：论文结构化分析表
 * 对应设计文档 4.2
 */
export const paperAnalysis = sqliteTable(
  "paper_analysis",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    paperId: text("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    taskDefinition: text("task_definition"),
    researchQuestions: text("research_questions"),
    methodOverview: text("method_overview"),
    metrics: text("metrics"),
    conclusion: text("conclusion"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    paperUnique: uniqueIndex("paper_analysis_paper_id_unique").on(t.paperId),
  }),
);

/**
 * rag_papers：独立的 RAG 知识库表（对应 Design_SQLite_Abstract_RAG.md §5）
 *
 * 和 `papers` 表刻意解耦：RAG 搜索只需要 title + abstract（以及方便 UI 展示的
 * authors/venue），不依赖 papers 表里的 pdf/field/复现/分析那套完整档案。
 *
 * INTEGER 主键是为了能搭 FTS5 external-content 虚表（rowid 必须是整数）。
 * FTS5 `rag_papers_fts` 虚表 + 三个同步 trigger 不在 Drizzle schema 里描述，
 * 放在单独的手写迁移 `0002_rag_fts5.sql` 中。
 */
export const ragPapers = sqliteTable(
  "rag_papers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    abstract: text("abstract").notNull(),
    // JSON string of string[]；repository 层负责 parse/stringify
    authorsJson: text("authors_json").notNull().default("[]"),
    venue: text("venue"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    titleIdx: index("rag_papers_title_idx").on(t.title),
  }),
);

/**
 * rag_paper_embeddings：rag_papers 的向量缓存。
 * 对应 Design_SQLite_Abstract_RAG.md §7.2。
 *
 * SQLite 没有原生向量类型，embedding 用 JSON 字符串存 (number[])，
 * service 层负责 parse / cosine similarity。字段少、写入稀疏，单表即可。
 *
 * `paperId` 作主键 = 一篇论文最多一条 embedding。重新生成（换模型 / 重索引）
 * 走 UPSERT（DELETE + INSERT 或 INSERT ON CONFLICT DO UPDATE）。
 */
export const ragPaperEmbeddings = sqliteTable("rag_paper_embeddings", {
  paperId: integer("paper_id")
    .primaryKey()
    .references(() => ragPapers.id, { onDelete: "cascade" }),
  // 生成 embedding 用的原文（title + abstract 拼接后的结果），方便调试与回填
  embeddingText: text("embedding_text").notNull(),
  // 向量 JSON（number[]）
  embeddingJson: text("embedding_json").notNull(),
  // 使用的模型名，换模型时可用来判断哪些条目需要重建
  embeddingModel: text("embedding_model").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * devices：设备管理表
 * 对应设计文档 4.5
 */
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  deviceType: text("device_type"),
  status: text("status", { enum: ["idle", "running", "offline", "error"] })
    .notNull()
    .default("idle"),
  location: text("location"),
  description: text("description"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * host_credentials：主机 SSH 凭证 + 追踪配置（与 devices 1:1）
 *
 * 设计取舍：
 *   · 与 devices 拆表：凭证生命周期（少改、敏感）和 metrics 快照（高频写入）
 *     完全不同，避免主表被频繁锁定。
 *   · 密码字段加密存储：encryptedPassword 使用 AES-256-GCM，密钥来自
 *     env.HOST_CRED_KEY（hex 编码 32 字节）。明文只在采集时解密、不持久化。
 *   · keyFile 路径仍以明文存储——它本身指向私钥文件而非私钥内容，泄漏风险有限。
 *   · trackingEnabled = 是否被 scheduler 拉起；离线 / 维护场景临时关掉。
 *   · backoffUntil = 连续采集失败时的冷却到期时刻（ISO 文本），到期前 scheduler 跳过此主机。
 */
export const hostCredentials = sqliteTable(
  "host_credentials",
  {
    deviceId: text("device_id")
      .primaryKey()
      .references(() => devices.id, { onDelete: "cascade" }),
    // Tailscale 内网 IP 或常规 IP/主机名
    host: text("host").notNull(),
    port: integer("port").notNull().default(22),
    username: text("username").notNull(),
    // AES-256-GCM 密文（Base64），可空 — 用密钥认证时为空
    encryptedPassword: text("encrypted_password"),
    // 私钥文件绝对路径（或 ~ 开头），可空 — 用密码认证时为空
    keyFile: text("key_file"),
    // 主机标签备注（如 "RTX 3080"），方便面板辨识，与 devices.name 互补
    hostLabel: text("host_label"),
    // 是否参与定时采集
    trackingEnabled: integer("tracking_enabled", { mode: "boolean" }).notNull().default(true),
    // 连续失败次数（成功一次清零；触发指数退避）
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    // 退避截止时间（ISO 文本，scheduler 在此之前跳过此主机）
    backoffUntil: text("backoff_until"),
    // 上次采集的状态信息（成功/失败摘要）
    lastError: text("last_error"),
    // 上次成功采集的时间（ISO）
    lastSeenAt: text("last_seen_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    trackingIdx: index("host_credentials_tracking_idx").on(t.trackingEnabled),
  }),
);

/**
 * host_metrics_snapshot：主机状态快照（每分钟一条/主机）
 *
 * 设计取舍：
 *   · 一条记录 = 一次采集。GPU 多卡时把所有卡的指标编码进 gpusJson（一次采集 = 一条
 *     主行，里面包含所有 GPU 的子记录），避免主行 × 卡数的笛卡尔膨胀。
 *   · online=false 时大多数指标字段允许 NULL（采集失败的占位记录，便于查"什么时候掉线了"）。
 *   · 老数据靠定期清理脚本截断（保留 N 天），暂不写入 schema。
 */
export const hostMetricsSnapshot = sqliteTable(
  "host_metrics_snapshot",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    // 是否成功 SSH 上去
    online: integer("online", { mode: "boolean" }).notNull(),
    // SSH 握手 + 命令执行总耗时
    latencyMs: integer("latency_ms"),
    // 远端 hostname 命令的输出
    hostname: text("hostname"),
    // 内核版本（uname -r 头部）
    kernel: text("kernel"),
    // 主机已运行秒数
    uptimeSeconds: integer("uptime_seconds"),
    // 1 分钟平均 CPU 负载（百分比；可超过 100% 多核场景）
    cpuLoad1m: integer("cpu_load_1m_pct"),
    memoryUsedMb: integer("memory_used_mb"),
    memoryTotalMb: integer("memory_total_mb"),
    // root 分区使用率（百分比 0-100）
    diskUsedPct: integer("disk_used_pct"),
    // GPU 多卡数据 JSON：[{ index, name, utilizationPct, memoryUsedMb, memoryTotalMb,
    //   temperatureC, powerW }, ...]；nvidia-smi 不可用时为 null
    gpusJson: text("gpus_json"),
    // 失败原因（online=false 时填）
    errorMessage: text("error_message"),
    collectedAt: text("collected_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    deviceCollectedIdx: index("host_metrics_device_collected_idx").on(t.deviceId, t.collectedAt),
    collectedIdx: index("host_metrics_collected_idx").on(t.collectedAt),
  }),
);

export type HostCredentialRow = typeof hostCredentials.$inferSelect;
export type NewHostCredentialRow = typeof hostCredentials.$inferInsert;
export type HostMetricsSnapshotRow = typeof hostMetricsSnapshot.$inferSelect;
export type NewHostMetricsSnapshotRow = typeof hostMetricsSnapshot.$inferInsert;

/**
 * paper_reproduction_records：论文复现情况表
 * 对应设计文档 4.6
 */
export const paperReproductionRecords = sqliteTable(
  "paper_reproduction_records",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    paperId: text("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    deviceId: text("device_id").references(() => devices.id, { onDelete: "set null" }),
    status: text("status", {
      enum: ["not_started", "running", "success", "failed", "paused"],
    })
      .notNull()
      .default("not_started"),
    progress: integer("progress").notNull().default(0),
    resultSummary: text("result_summary"),
    artifactUrl: text("artifact_url"),
    // 训练修改记录（超参数调整、数据清洗、改动点等自由文本），由 reproduction-tracker skill 回写
    trainingNotes: text("training_notes"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    paperIdx: index("reproduction_paper_id_idx").on(t.paperId),
    deviceIdx: index("reproduction_device_id_idx").on(t.deviceId),
    statusIdx: index("reproduction_status_idx").on(t.status),
  }),
);

export type PaperRow = typeof papers.$inferSelect;
export type NewPaperRow = typeof papers.$inferInsert;
export type PaperAnalysisRow = typeof paperAnalysis.$inferSelect;
export type NewPaperAnalysisRow = typeof paperAnalysis.$inferInsert;
export type RagPaperRow = typeof ragPapers.$inferSelect;
export type NewRagPaperRow = typeof ragPapers.$inferInsert;
export type RagPaperEmbeddingRow = typeof ragPaperEmbeddings.$inferSelect;
export type NewRagPaperEmbeddingRow = typeof ragPaperEmbeddings.$inferInsert;
export type DeviceRow = typeof devices.$inferSelect;
export type NewDeviceRow = typeof devices.$inferInsert;
export type ReproductionRecordRow = typeof paperReproductionRecords.$inferSelect;
export type NewReproductionRecordRow = typeof paperReproductionRecords.$inferInsert;

/**
 * user_profile：单行用户 profile 表
 *
 * MVP 阶段只存一个用户名。id 锁成 1 以保证全表最多一行，避免多余的
 * "find first by rowid" 逻辑。
 */
export const userProfile = sqliteTable("user_profile", {
  id: integer("id")
    .primaryKey()
    .$defaultFn(() => 1),
  username: text("username"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type UserProfileRow = typeof userProfile.$inferSelect;
export type NewUserProfileRow = typeof userProfile.$inferInsert;
