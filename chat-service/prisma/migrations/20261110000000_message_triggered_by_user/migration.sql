-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-11-10
-- Scope: Implemented the user-specified replacement of message metadata with triggeredByUserId.
-- No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: tng wen xi
ALTER TABLE `messages`
  DROP COLUMN `metadata`,
  ADD COLUMN `triggered_by_user_id` CHAR(36) NULL;
