-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
-- Scope: Implemented the human-specified lifetime order uniqueness and courier/status constraints.
-- Author review: I have modified the reservations table to introduce more constraints.
-- Prompts and key responses: ../ai/usage-log.md, entry 014.

ALTER TABLE reservations
    ADD CONSTRAINT reservations_order_id_unique UNIQUE (order_id),
    ADD CONSTRAINT reservations_settled_courier_check
        CHECK ((status = 'SETTLED') = (courier_id IS NOT NULL)),
    ADD CONSTRAINT reservations_distinct_participants_check
        CHECK (courier_id IS NULL OR courier_id <> requester_id);
