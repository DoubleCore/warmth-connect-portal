-- Hermes 指令中心三张表
-- 详见 Hermes_Command_Center_HTTP_直连可用版.md §11 与 src/db/schema.ts
-- 手写迁移（参考 0002_rag_fts5.sql 的做法）：drizzle-kit 历史 snapshot
-- 链上存在一个已有冲突，自动生成不可行。SQL 与 schema.ts 的 Drizzle
-- 定义一一对应。
CREATE TABLE `command_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry` text,
	`initial_context_json` text DEFAULT '{}' NOT NULL,
	`user_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text,
	`user_message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`context_json` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`error_json` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `command_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `commands_session_id_idx` ON `commands` (`session_id`);--> statement-breakpoint
CREATE INDEX `commands_status_idx` ON `commands` (`status`);--> statement-breakpoint
CREATE INDEX `commands_created_at_idx` ON `commands` (`created_at`);--> statement-breakpoint
CREATE TABLE `command_events` (
	`id` text PRIMARY KEY NOT NULL,
	`command_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`command_id`) REFERENCES `commands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `command_events_command_id_idx` ON `command_events` (`command_id`);--> statement-breakpoint
CREATE INDEX `command_events_command_id_created_at_idx` ON `command_events` (`command_id`,`created_at`);
