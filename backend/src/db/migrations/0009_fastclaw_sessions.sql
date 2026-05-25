CREATE TABLE `fastclaw_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry` text,
	`agent_role` text,
	`agent_id` text,
	`initial_context_json` text DEFAULT '{}' NOT NULL,
	`user_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fastclaw_sessions_entry_idx` ON `fastclaw_sessions` (`entry`);
--> statement-breakpoint
CREATE INDEX `fastclaw_sessions_agent_role_idx` ON `fastclaw_sessions` (`agent_role`);
--> statement-breakpoint
CREATE TABLE `fastclaw_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text,
	`user_message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`agent_role` text,
	`agent_id` text,
	`context_json` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`error_json` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `fastclaw_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fastclaw_runs_session_id_idx` ON `fastclaw_runs` (`session_id`);
--> statement-breakpoint
CREATE INDEX `fastclaw_runs_status_idx` ON `fastclaw_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `fastclaw_runs_created_at_idx` ON `fastclaw_runs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `fastclaw_runs_agent_role_idx` ON `fastclaw_runs` (`agent_role`);
--> statement-breakpoint
CREATE TABLE `fastclaw_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `fastclaw_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fastclaw_events_run_id_idx` ON `fastclaw_events` (`run_id`);
--> statement-breakpoint
CREATE INDEX `fastclaw_events_run_id_created_at_idx` ON `fastclaw_events` (`run_id`,`created_at`);
