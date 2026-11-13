-- ============================================================
-- Outbox relay claims one order's events on one topic as a unit.
-- ============================================================

-- The relay finds each stream's oldest unpublished row (no earlier
-- unpublished row for the same order and topic) and the rows behind
-- it. This index serves both lookups.
CREATE INDEX idx_outbox_events_unpublished_stream
    ON outbox_events (aggregate_id, topic, created_at, id)
    WHERE published_at IS NULL;
