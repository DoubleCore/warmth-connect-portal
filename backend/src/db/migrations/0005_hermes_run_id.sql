-- 为 commands 表补上 Hermes Runs API 的 run_id 关联。
-- 详见 src/db/schema.ts::commands.hermesRunId
-- 背景：切到 Hermes 官方 Runs API（POST /v1/runs）后，后续的
--      /v1/runs/{id}/stop 与 /v1/runs/{id}/approval 都要用 run_id 定位。
-- 手写迁移以避免触发 drizzle-kit 历史 snapshot 冲突，风格与 0004_commands.sql 保持一致。
ALTER TABLE `commands` ADD COLUMN `hermes_run_id` text;
--> statement-breakpoint
CREATE INDEX `commands_hermes_run_id_idx` ON `commands` (`hermes_run_id`);
