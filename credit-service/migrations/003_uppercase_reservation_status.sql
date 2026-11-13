-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
-- Scope: Implemented the human-confirmed uppercase reservation statuses and default.
-- Author review: I have modified the reservations table to ensure that the status values are stored in uppercase and set a default value for new entries.
-- Prompts and key responses: ../ai/usage-log.md, entry 008.

ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;

UPDATE reservations SET status = upper(status);

ALTER TABLE reservations ALTER COLUMN status SET DEFAULT 'RESERVED';

ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
    CHECK (status IN ('RESERVED', 'RELEASED', 'SETTLED'));
