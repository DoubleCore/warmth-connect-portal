-- Hermes 指令中心三张表退役：command 模块（对接 Hermes Agent 控制面 :8642 的代理）
-- 已整体移除，项目仅保留 FastClaw 通道。这里把残留的表一并 DROP。
--
-- 顺序：先删带外键引用的子表，最后删被引用的 command_sessions。
-- 手写迁移（与 0002_rag_fts5.sql 同类），不由 drizzle-kit 生成。
DROP TABLE IF EXISTS `command_events`;
--> statement-breakpoint
DROP TABLE IF EXISTS `commands`;
--> statement-breakpoint
DROP TABLE IF EXISTS `command_sessions`;
