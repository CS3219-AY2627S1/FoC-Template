-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
-- Scope: Enforced human-confirmed positive reservation amount/version and exact history delta constraints.
-- Author review: From the gaps in earlier migrations, I have added more constraints, reviewed them and confirmed they are correctly implemented.
-- Prompts and key responses: ../ai/usage-log.md, entry 031.

ALTER TABLE reservations
    ADD CONSTRAINT reservations_credit_amount_positive CHECK (credit_amount > 0),
    ADD CONSTRAINT reservations_version_positive CHECK (version > 0);

ALTER TABLE credit_history
    ADD CONSTRAINT credit_history_delta_check CHECK (
        (type = 'INITIAL_GRANT' AND total_amount_change = 10 AND total_reserved_change = 0)
        OR (type = 'RESERVED' AND total_amount_change = 0 AND total_reserved_change > 0)
        OR (type = 'RESERVATION_UPDATED' AND total_amount_change = 0 AND total_reserved_change <> 0)
        OR (type = 'RELEASED' AND total_amount_change = 0 AND total_reserved_change < 0)
        OR (type = 'TRANSFER_OUT' AND total_amount_change < 0 AND total_reserved_change = total_amount_change)
        OR (type = 'TRANSFER_IN' AND total_amount_change > 0 AND total_reserved_change = 0)
    );
