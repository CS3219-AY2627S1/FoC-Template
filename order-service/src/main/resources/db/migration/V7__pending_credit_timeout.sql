-- ============================================================
-- Pending-credit timeout: the expiry job finds PENDING_CREDIT
-- orders Credit has not answered by min(pickupDeadline,
-- createdAt + timeout). New terminal_reason value
-- CREDIT_RESERVATION_TIMEOUT fits the existing VARCHAR column.
-- ============================================================

CREATE INDEX idx_orders_pending_credit_created
    ON orders (created_at, id)
    WHERE state = 'PENDING_CREDIT';
