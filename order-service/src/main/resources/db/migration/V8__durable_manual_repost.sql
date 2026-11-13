-- ADR-037: original guards the workflow; candidate is its stable new reservation ID.
ALTER TABLE order_commands DROP CONSTRAINT order_commands_kind_check;
ALTER TABLE order_commands ADD CONSTRAINT order_commands_kind_check
    CHECK (kind IN ('CREATE', 'ACCEPT', 'ABORT', 'REPOST'));
ALTER TABLE order_commands ADD COLUMN candidate_order_id varchar(36);
ALTER TABLE order_commands ADD CONSTRAINT order_commands_repost_candidate_check
    CHECK ((kind = 'REPOST' AND candidate_order_id IS NOT NULL AND candidate_order_id <> order_id)
        OR (kind <> 'REPOST' AND candidate_order_id IS NULL));
CREATE UNIQUE INDEX ux_order_command_repost_candidate ON order_commands(candidate_order_id)
    WHERE candidate_order_id IS NOT NULL;
-- Existing payloads, IDs, leases and unique pending-original index are preserved.
