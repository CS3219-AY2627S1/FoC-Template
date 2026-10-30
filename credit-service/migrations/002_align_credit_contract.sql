-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
-- Scope: Implemented the human-requested reservation schema alignment with the shared credit contract.
-- Author review: Based on the gaps from the first migration, I have updated the reservations table.
-- Prompts and key responses: ../ai/usage-log.md, entry 007.

ALTER TABLE reservations RENAME COLUMN requestor_id TO requester_id;

ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;

UPDATE reservations SET status = 'SETTLED' WHERE status = 'transferred';

ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
    CHECK (status IN ('reserved', 'released', 'SETTLED'));
