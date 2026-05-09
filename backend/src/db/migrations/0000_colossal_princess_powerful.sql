CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`device_type` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`location` text,
	`description` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paper_analysis` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`task_definition` text,
	`research_questions` text,
	`method_overview` text,
	`metrics` text,
	`conclusion` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paper_analysis_paper_id_unique` ON `paper_analysis` (`paper_id`);--> statement-breakpoint
CREATE TABLE `paper_reproduction_records` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`device_id` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`result_summary` text,
	`artifact_url` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reproduction_paper_id_idx` ON `paper_reproduction_records` (`paper_id`);--> statement-breakpoint
CREATE INDEX `reproduction_device_id_idx` ON `paper_reproduction_records` (`device_id`);--> statement-breakpoint
CREATE INDEX `reproduction_status_idx` ON `paper_reproduction_records` (`status`);--> statement-breakpoint
CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`authors_json` text DEFAULT '[]' NOT NULL,
	`abstract` text,
	`field` text,
	`source` text,
	`published_year` integer,
	`paper_url` text,
	`pdf_url` text,
	`pdf_storage_path` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `papers_title_idx` ON `papers` (`title`);--> statement-breakpoint
CREATE INDEX `papers_field_idx` ON `papers` (`field`);--> statement-breakpoint
CREATE INDEX `papers_source_idx` ON `papers` (`source`);--> statement-breakpoint
CREATE INDEX `papers_year_idx` ON `papers` (`published_year`);--> statement-breakpoint
CREATE TABLE `rag_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`title` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rag_conversations_paper_id_idx` ON `rag_conversations` (`paper_id`);--> statement-breakpoint
CREATE TABLE `rag_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `rag_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rag_messages_conversation_id_idx` ON `rag_messages` (`conversation_id`);