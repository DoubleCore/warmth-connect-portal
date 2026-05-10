-- rag_paper_embeddings：rag_papers 的向量缓存，支撑 POST /api/rag/query
-- 对应 Design_SQLite_Abstract_RAG.md §7.2 与 src/db/schema.ts::ragPaperEmbeddings
--
-- 设计取舍：
--   · paper_id 同时是主键和 FK（ON DELETE CASCADE）——一篇论文最多一条 embedding，
--     删除主表行时自动级联
--   · embedding_json 存 number[] 的 JSON 文本。SQLite 没有向量类型；abstract 规模下
--     JSON parse + 内存 cosine 足够快，等到百万级再考虑 sqlite-vec 之类扩展
--   · embedding_model 留着是为了换模型时能筛出"老模型"条目批量重建
--
-- 手写迁移（延续 0002 / 0005 / 0006 的风格）避免触发 drizzle-kit 历史 snapshot 冲突。
CREATE TABLE `rag_paper_embeddings` (
	`paper_id` integer PRIMARY KEY NOT NULL,
	`embedding_text` text NOT NULL,
	`embedding_json` text NOT NULL,
	`embedding_model` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `rag_papers`(`id`) ON UPDATE no action ON DELETE cascade
);
