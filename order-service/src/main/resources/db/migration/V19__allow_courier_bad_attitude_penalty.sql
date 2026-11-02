-- Extend the existing policy constraints without rewriting historical penalties.
ALTER TABLE orders DROP CONSTRAINT ck_orders_deferred_penalty;
ALTER TABLE orders ADD CONSTRAINT ck_orders_deferred_penalty CHECK (
    (applied_penalty IS NULL AND applied_penalty_at IS NULL AND applied_penalty_by IS NULL AND applied_penalty_reason IS NULL)
    OR (applied_penalty IS NOT NULL AND applied_penalty IN (
        'WRONG_LOCATION_DELIVERY','ITEM_MISHANDLING_OR_DAMAGE','DELIBERATE_ITEM_RETENTION_OR_THEFT',
        'COURIER_UNRESPONSIVE','COURIER_BAD_ATTITUDE')
        AND applied_penalty_at IS NOT NULL AND applied_penalty_by IS NOT NULL AND applied_penalty_reason IS NOT NULL));

ALTER TABLE order_courier_attempts DROP CONSTRAINT ck_order_courier_attempts_deferred_penalty;
ALTER TABLE order_courier_attempts ADD CONSTRAINT ck_order_courier_attempts_deferred_penalty CHECK (
    (applied_penalty IS NULL AND applied_penalty_at IS NULL AND applied_penalty_by IS NULL AND applied_penalty_reason IS NULL)
    OR (applied_penalty IS NOT NULL AND applied_penalty IN (
        'WRONG_LOCATION_DELIVERY','ITEM_MISHANDLING_OR_DAMAGE','DELIBERATE_ITEM_RETENTION_OR_THEFT',
        'COURIER_UNRESPONSIVE','COURIER_BAD_ATTITUDE')
        AND applied_penalty_at IS NOT NULL AND applied_penalty_by IS NOT NULL AND applied_penalty_reason IS NOT NULL));
