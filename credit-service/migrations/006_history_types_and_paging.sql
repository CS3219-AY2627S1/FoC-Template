-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
-- Scope: Implemented the human-finalized history labels, identity paging column/indexes, and one INITIAL_GRANT per user.
-- Author review: I have modified the credit history table according to changing requirements.
-- Prompts and key responses: ../ai/usage-log.md, entries 021 and 025.

ALTER TABLE credit_history DROP CONSTRAINT credit_history_type_check;
UPDATE credit_history SET type = CASE
    WHEN type = 'init_credits' THEN 'INITIAL_GRANT'
    WHEN type = 'reserve' THEN 'RESERVED'
    WHEN type = 'update' THEN 'RESERVATION_UPDATED'
    WHEN type = 'release' THEN 'RELEASED'
    WHEN type = 'transfer' AND total_amount_change < 0 THEN 'TRANSFER_OUT'
    WHEN type = 'transfer' AND total_amount_change > 0 THEN 'TRANSFER_IN'
    ELSE type
END;
ALTER TABLE credit_history ADD CONSTRAINT credit_history_type_check
    CHECK (type IN ('INITIAL_GRANT', 'RESERVED', 'RESERVATION_UPDATED', 'RELEASED', 'TRANSFER_OUT', 'TRANSFER_IN'));
ALTER TABLE credit_history ADD COLUMN sequence_id bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX credit_history_sequence_id_unique ON credit_history (sequence_id);
CREATE INDEX credit_history_user_sequence_idx ON credit_history (user_id, sequence_id DESC);
CREATE UNIQUE INDEX credit_history_initial_grant_unique ON credit_history (user_id)
    WHERE type = 'INITIAL_GRANT';
