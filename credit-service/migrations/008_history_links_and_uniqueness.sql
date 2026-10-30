-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
-- Scope: Implemented human-specified history link CHECK and per-reservation event uniqueness.
-- Author review: The gaps from the earlier migrations are addressed here, by adding more database constraints.
-- Prompts/key responses: ../ai/usage-log.md, entry 039.

ALTER TABLE credit_history ADD CONSTRAINT credit_history_links_check CHECK (
    (type = 'INITIAL_GRANT' AND order_id IS NULL AND reservation_id IS NULL)
    OR (type <> 'INITIAL_GRANT' AND order_id IS NOT NULL AND reservation_id IS NOT NULL)
);

CREATE UNIQUE INDEX credit_history_reservation_type_once_unique
    ON credit_history (reservation_id, type)
    WHERE type IN ('RESERVED', 'RELEASED', 'TRANSFER_OUT', 'TRANSFER_IN');
