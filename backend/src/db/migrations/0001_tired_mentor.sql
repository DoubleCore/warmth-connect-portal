CREATE TABLE `rag_papers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`abstract` text NOT NULL,
	`authors_json` text DEFAULT '[]' NOT NULL,
	`venue` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rag_papers_title_idx` ON `rag_papers` (`title`);--> statement-breakpoint
DROP TABLE `rag_conversations`;--> statement-breakpoint
DROP TABLE `rag_messages`;