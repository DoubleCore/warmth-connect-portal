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
 * rag_conversations：RAG 对话会话表
 * 对应设计文档 4.3
 */
export const ragConversations = sqliteTable(
  "rag_conversations",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    paperId: text("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    paperIdx: index("rag_conversations_paper_id_idx").on(t.paperId),
  }),
);

/**
 * rag_messages：RAG 对话消息表
 * 对应设计文档 4.4
 */
export const ragMessages = sqliteTable(
  "rag_messages",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => ragConversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    conversationIdx: index("rag_messages_conversation_id_idx").on(t.conversationId),
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
export type RagConversationRow = typeof ragConversations.$inferSelect;
export type NewRagConversationRow = typeof ragConversations.$inferInsert;
export type RagMessageRow = typeof ragMessages.$inferSelect;
export type NewRagMessageRow = typeof ragMessages.$inferInsert;
export type DeviceRow = typeof devices.$inferSelect;
export type NewDeviceRow = typeof devices.$inferInsert;
export type ReproductionRecordRow = typeof paperReproductionRecords.$inferSelect;
export type NewReproductionRecordRow = typeof paperReproductionRecords.$inferInsert;
