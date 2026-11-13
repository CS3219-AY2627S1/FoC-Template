-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
-- Scope: Implemented the human-confirmed INITIAL_GRANT history type and translated existing initial-grant labels.
-- Author review: I have modified the credit history table according to changing requirements.
-- Prompts and key responses: ../ai/usage-log.md, entry 018.

ALTER TABLE credit_history DROP CONSTRAINT credit_history_type_check;

UPDATE credit_history SET type = 'INITIAL_GRANT' WHERE type = 'init_credits';

ALTER TABLE credit_history ADD CONSTRAINT credit_history_type_check
    CHECK (type IN ('INITIAL_GRANT', 'reserve', 'update', 'release', 'transfer'));
