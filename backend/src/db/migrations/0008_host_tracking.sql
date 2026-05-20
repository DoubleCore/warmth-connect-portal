-- host_tracking：主机 SSH 凭证 + 每分钟状态快照
-- 对应 src/db/schema.ts::hostCredentials / hostMetricsSnapshot
--
-- 设计取舍：
--   · host_credentials.device_id 同时是主键和外键 (CASCADE) — 1:1 绑定 devices
--   · encrypted_password 存 AES-256-GCM 密文 (Base64)，密钥来自 env.HOST_CRED_KEY
--   · host_metrics_snapshot.gpus_json 把多卡 GPU 数据序列化进单条记录，避免行膨胀
--   · 双索引 (device_id, collected_at) + (collected_at) 兼顾"看某主机历史"和"找最近 N 分钟全局快照"
--
-- 手写迁移延续 0002 / 0005 / 0006 / 0007 风格，避免与 drizzle-kit 历史 snapshot 冲突。

CREATE TABLE `host_credentials` (
	`device_id` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`encrypted_password` text,
	`key_file` text,
	`host_label` text,
	`tracking_enabled` integer DEFAULT 1 NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`backoff_until` text,
	`last_error` text,
	`last_seen_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `host_credentials_tracking_idx` ON `host_credentials` (`tracking_enabled`);
--> statement-breakpoint
CREATE TABLE `host_metrics_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`online` integer NOT NULL,
	`latency_ms` integer,
	`hostname` text,
	`kernel` text,
	`uptime_seconds` integer,
	`cpu_load_1m_pct` integer,
	`memory_used_mb` integer,
	`memory_total_mb` integer,
	`disk_used_pct` integer,
	`gpus_json` text,
	`error_message` text,
	`collected_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `host_metrics_device_collected_idx` ON `host_metrics_snapshot` (`device_id`,`collected_at`);
--> statement-breakpoint
CREATE INDEX `host_metrics_collected_idx` ON `host_metrics_snapshot` (`collected_at`);
