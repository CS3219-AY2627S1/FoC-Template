-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (GPT-6), date: 2026-11-04 (Asia/Singapore).
-- Scope: Implemented the human-specified lifecycle and restored-history constraints.
-- Author review: I reviewed that the implementation satisfies the specification.
-- Prompts/key responses: ../ai/usage-log.md, entry 049; ../ai/prompts/049-user-lifecycle.md.

ALTER TABLE credit_accounts
    ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE',
    ADD CONSTRAINT credit_accounts_status_check CHECK (status IN ('ACTIVE', 'DELETED', 'CLOSED')),
    ADD CONSTRAINT credit_accounts_closed_balance_check
        CHECK (status <> 'CLOSED' OR (total_credits = 0 AND reserved_credits = 0));

ALTER TABLE credit_history DROP CONSTRAINT credit_history_type_check;
ALTER TABLE credit_history ADD CONSTRAINT credit_history_type_check
    CHECK (type IN ('INITIAL_GRANT', 'BALANCE_RESTORED', 'RESERVED', 'RESERVATION_UPDATED', 'RELEASED', 'TRANSFER_OUT', 'TRANSFER_IN'));

ALTER TABLE credit_history DROP CONSTRAINT credit_history_delta_check;
ALTER TABLE credit_history ADD CONSTRAINT credit_history_delta_check CHECK (
    (type = 'INITIAL_GRANT' AND total_amount_change = 10 AND total_reserved_change = 0)
    OR (type = 'BALANCE_RESTORED' AND total_amount_change >= 0 AND total_reserved_change = 0)
    OR (type = 'RESERVED' AND total_amount_change = 0 AND total_reserved_change > 0)
    OR (type = 'RESERVATION_UPDATED' AND total_amount_change = 0 AND total_reserved_change <> 0)
    OR (type = 'RELEASED' AND total_amount_change = 0 AND total_reserved_change < 0)
    OR (type = 'TRANSFER_OUT' AND total_amount_change < 0 AND total_reserved_change = total_amount_change)
    OR (type = 'TRANSFER_IN' AND total_amount_change > 0 AND total_reserved_change = 0)
);

ALTER TABLE credit_history DROP CONSTRAINT credit_history_links_check;
ALTER TABLE credit_history ADD CONSTRAINT credit_history_links_check CHECK (
    (type IN ('INITIAL_GRANT', 'BALANCE_RESTORED') AND order_id IS NULL AND reservation_id IS NULL)
    OR (type NOT IN ('INITIAL_GRANT', 'BALANCE_RESTORED') AND order_id IS NOT NULL AND reservation_id IS NOT NULL)
);

DROP INDEX credit_history_initial_grant_unique;
CREATE UNIQUE INDEX credit_history_initial_allocation_unique ON credit_history (user_id)
    WHERE type IN ('INITIAL_GRANT', 'BALANCE_RESTORED');
