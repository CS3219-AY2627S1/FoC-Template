-- ============================================================
-- OrderTransitioned on order.lifecycle.events (shared N2H contract,
-- docs/contracts/n2h-events.schema.json).
-- ============================================================

-- Number of lifecycle events published for this order. The next
-- event takes lifecycle_sequence + 1 as its sourceSequence, in the
-- same transaction as the transition, so a rolled-back request takes
-- no number and the stream has no gaps. Separate from the JPA
-- version, which also changes for writes that publish nothing.
ALTER TABLE orders ADD COLUMN lifecycle_sequence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD CONSTRAINT chk_lifecycle_sequence CHECK (lifecycle_sequence >= 0);
