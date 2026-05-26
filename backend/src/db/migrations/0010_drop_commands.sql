-- claw-only 分支：拆掉 Hermes 指令中心表。
-- 这三张表只服务于已删除的 backend/src/modules/command/，留着会让 schema diff 持续不一致。
-- 注意：FastClaw runs / events / sessions（fastclaw_*）是另一套表，与本迁移无关。

DROP TABLE IF EXISTS `command_events`;
--> statement-breakpoint
DROP TABLE IF EXISTS `commands`;
--> statement-breakpoint
DROP TABLE IF EXISTS `command_sessions`;
