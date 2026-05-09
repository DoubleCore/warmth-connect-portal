-- FTS5 全文索引：英文论文 title + abstract 关键词搜索。
--
-- 采用 external-content 模式（rag_papers 是真实源，FTS 表只存倒排索引），
-- 并用三个 trigger 自动同步 insert / update / delete。
--
-- tokenize=porter unicode61：
--   · unicode61 提供基础的 Unicode 大小写归一和分词（对纯英文足够）
--   · porter    叠加英文词干提取（model / models / modeling 归一匹配）

CREATE VIRTUAL TABLE `rag_papers_fts` USING fts5(
	title,
	abstract,
	content='rag_papers',
	content_rowid='id',
	tokenize='porter unicode61'
);--> statement-breakpoint
CREATE TRIGGER `rag_papers_ai` AFTER INSERT ON `rag_papers` BEGIN
	INSERT INTO `rag_papers_fts`(rowid, title, abstract)
	VALUES (new.id, new.title, new.abstract);
END;--> statement-breakpoint
CREATE TRIGGER `rag_papers_ad` AFTER DELETE ON `rag_papers` BEGIN
	INSERT INTO `rag_papers_fts`(`rag_papers_fts`, rowid, title, abstract)
	VALUES ('delete', old.id, old.title, old.abstract);
END;--> statement-breakpoint
CREATE TRIGGER `rag_papers_au` AFTER UPDATE ON `rag_papers` BEGIN
	INSERT INTO `rag_papers_fts`(`rag_papers_fts`, rowid, title, abstract)
	VALUES ('delete', old.id, old.title, old.abstract);
	INSERT INTO `rag_papers_fts`(rowid, title, abstract)
	VALUES (new.id, new.title, new.abstract);
END;
