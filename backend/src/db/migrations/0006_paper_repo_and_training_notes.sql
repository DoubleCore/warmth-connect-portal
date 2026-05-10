-- papers.repo_url：论文对应的代码仓库 URL
--   来源：paper-code-finder / repo-backfill / ingest-phase1 等 skill 回写
-- paper_reproduction_records.training_notes：复现时的训练修改记录（自由文本）
--   来源：reproduction-tracker skill 回写
-- 手写迁移以保持与 0002 / 0004 / 0005 的风格一致，避免触发 drizzle-kit 历史 snapshot 冲突。
ALTER TABLE `papers` ADD COLUMN `repo_url` text;
--> statement-breakpoint
ALTER TABLE `paper_reproduction_records` ADD COLUMN `training_notes` text;
