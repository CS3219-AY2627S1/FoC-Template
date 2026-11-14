-- AI Assistance Disclosure:
-- Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
-- Scope: Adds users.preferred_lang (ISO 639-1, default 'en') as specified by the team.
--        No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review:
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_lang VARCHAR(2) NOT NULL DEFAULT 'en';
