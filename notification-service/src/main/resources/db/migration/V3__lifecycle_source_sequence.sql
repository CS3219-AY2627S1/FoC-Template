-- ============================================================
-- Order lifecycle events (order.lifecycle.events). Each inbox row
-- for an Order transition keeps its sourceSequence, so the next
-- event for that order can be checked for a gap. Null for Credit
-- events, which have no sequence.
-- ============================================================

ALTER TABLE notification_inbox ADD COLUMN source_sequence BIGINT;

-- "Highest sequence seen for this order" for the gap check.
CREATE INDEX ix_notification_inbox_order_sequence
    ON notification_inbox (aggregate_id, source_sequence)
    WHERE source_sequence IS NOT NULL;
