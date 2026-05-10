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


/**
 * Hermes 指令中心 —— 三张表
 * 对应 Hermes_Command_Center_HTTP_直连可用版.md §11
 *
 * 设计文档用 PostgreSQL 风格（UUID + JSONB），在 SQLite 里统一降级为 text：
 *   - UUID       → text，主键值由应用层 newId() 生成
 *   - JSONB      → text，repo 层 JSON.parse / JSON.stringify
 *   - TIMESTAMP  → text + (CURRENT_TIMESTAMP)，与其他表保持同一风格
 *
 * command_sessions 表在设计文档里没有显式出现，但 §5.1 的 POST /sessions
 * 需要一个持久化锚点：保留它方便后续绑定登录用户、追溯同一个会话里的多条指令。
 */
export const commandSessions = sqliteTable("command_sessions", {
  id: text("id").primaryKey().$defaultFn(newId),
  // 会话入口，例如 "home" / "paper_detail" / "reproduction_list"，用于埋点与行为分析
  entry: text("entry"),
  // 初始上下文快照（JSON 字符串）。后续每条 command 也有自己的 context。
  initialContextJson: text("initial_context_json").notNull().default("{}"),
  userId: text("user_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * commands：一次用户自然语言指令的主记录。
 *
 * status 枚举严格对齐设计文档 §11.1：
 *   pending / running / waiting_confirmation / completed / failed / cancelled
 */
export const commands = sqliteTable(
  "commands",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    sessionId: text("session_id")
      .notNull()
      .references(() => commandSessions.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    userMessage: text("user_message").notNull(),
    status: text("status", {
      enum: [
        "pending",
        "running",
        "waiting_confirmation",
        "completed",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("pending"),
    // 前端发消息时带的页面上下文，例如 { currentPage, paperId, trainingListId, deviceId }
    contextJson: text("context_json").notNull().default("{}"),
    // Hermes Runs API 的 run_id。POST /v1/runs 成功后写入，之后的 approval/stop
    // 都要用它定位。可能为空（创建 run 前、或使用非 runs 路径的早期版本数据）。
    hermesRunId: text("hermes_run_id"),
    // Hermes final 事件里的 result payload（JSON 字符串，可能为空）
    resultJson: text("result_json"),
    // 错误信息，包含 { code, message }
    errorJson: text("error_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    sessionIdx: index("commands_session_id_idx").on(t.sessionId),
    statusIdx: index("commands_status_idx").on(t.status),
    createdIdx: index("commands_created_at_idx").on(t.createdAt),
    hermesRunIdx: index("commands_hermes_run_id_idx").on(t.hermesRunId),
  }),
);

/**
 * command_events：Backend 推送给前端的每一个 CommandStreamEvent。
 *
 * 第一阶段非流式链路只会写入 final / error 两类事件；第二阶段加入 SSE 后
 * 会扩展为 thinking / agent_message / tool_start / tool_result / need_confirmation / final。
 * 提前把表落下来，避免 Phase 2 还要再来一次迁移。
 */
export const commandEvents = sqliteTable(
  "command_events",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    commandId: text("command_id")
      .notNull()
      .references(() => commands.id, { onDelete: "cascade" }),
    // 事件类型名与前端 CommandStreamEvent.type 严格一致，方便重放。
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    commandIdx: index("command_events_command_id_idx").on(t.commandId),
    // 重连场景下按 commandId + createdAt 顺序回放事件
    commandCreatedIdx: index("command_events_command_id_created_at_idx").on(
      t.commandId,
      t.createdAt,
    ),
  }),
);

export type CommandSessionRow = typeof commandSessions.$inferSelect;
export type NewCommandSessionRow = typeof commandSessions.$inferInsert;
export type CommandRow = typeof commands.$inferSelect;
export type NewCommandRow = typeof commands.$inferInsert;
export type CommandEventRow = typeof commandEvents.$inferSelect;
export type NewCommandEventRow = typeof commandEvents.$inferInsert;
