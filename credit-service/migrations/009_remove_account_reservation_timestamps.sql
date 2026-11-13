-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
-- Scope: Removed account and reservation timestamps as specified by the human.
-- Author review: The fields I requested to be removed are no longer necessary for the current business logic, and their removal will help streamline the database schema.
-- Prompts/key responses: ../ai/usage-log.md, entry 040.

ALTER TABLE credit_accounts
    DROP COLUMN created_at,
    DROP COLUMN updated_at;

ALTER TABLE reservations
    DROP COLUMN created_at,
    DROP COLUMN updated_at;
