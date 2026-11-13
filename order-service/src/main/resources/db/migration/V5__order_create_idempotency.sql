-- ============================================================
-- Idempotent order creation (Idempotency-Key on POST /api/orders).
-- ============================================================

-- The client's key for the create request, scoped to the requester,
-- and a SHA-256 of the request it came with. A retry with the same key
-- and request returns this order; the same key with a different
-- request is rejected. The fingerprint is of the original request, so
-- a late retry still matches after the order has been edited.
ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(64);
ALTER TABLE orders ADD COLUMN idempotency_fingerprint VARCHAR(64);

ALTER TABLE orders ADD CONSTRAINT chk_idempotency_pair CHECK (
    (idempotency_key IS NULL) = (idempotency_fingerprint IS NULL)
);

-- One order per requester and key, even if two requests race.
CREATE UNIQUE INDEX idx_orders_requester_idempotency_key
    ON orders (requester_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
