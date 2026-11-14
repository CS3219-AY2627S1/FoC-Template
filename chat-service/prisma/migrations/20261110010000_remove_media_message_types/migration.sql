-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-11-10
-- Scope: Implemented user-specified removal of IMAGE and VIDEO from the message type enum.
-- No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: tng wen xi
ALTER TABLE `messages`
  MODIFY COLUMN `type` ENUM('TEXT', 'SYSTEM') NOT NULL;
