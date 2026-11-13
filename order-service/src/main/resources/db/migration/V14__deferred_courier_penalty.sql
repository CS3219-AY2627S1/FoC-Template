ALTER TABLE orders ADD COLUMN applied_penalty varchar(64),
    ADD COLUMN applied_penalty_at timestamptz,
    ADD COLUMN applied_penalty_by varchar(128),
    ADD COLUMN applied_penalty_reason varchar(1000);
ALTER TABLE orders ADD CONSTRAINT ck_orders_deferred_penalty CHECK (
    (applied_penalty IS NULL AND applied_penalty_at IS NULL AND applied_penalty_by IS NULL AND applied_penalty_reason IS NULL)
    OR (applied_penalty IS NOT NULL AND applied_penalty IN ('WRONG_LOCATION_DELIVERY','ITEM_MISHANDLING_OR_DAMAGE','DELIBERATE_ITEM_RETENTION_OR_THEFT','COURIER_UNRESPONSIVE') AND applied_penalty_at IS NOT NULL AND applied_penalty_by IS NOT NULL AND applied_penalty_reason IS NOT NULL));
ALTER TABLE order_courier_attempts ADD COLUMN applied_penalty varchar(64),
    ADD COLUMN applied_penalty_at timestamptz,
    ADD COLUMN applied_penalty_by varchar(128),
    ADD COLUMN applied_penalty_reason varchar(1000);
ALTER TABLE order_courier_attempts ADD CONSTRAINT ck_order_courier_attempts_deferred_penalty CHECK (
    (applied_penalty IS NULL AND applied_penalty_at IS NULL AND applied_penalty_by IS NULL AND applied_penalty_reason IS NULL)
    OR (applied_penalty IS NOT NULL AND applied_penalty IN ('WRONG_LOCATION_DELIVERY','ITEM_MISHANDLING_OR_DAMAGE','DELIBERATE_ITEM_RETENTION_OR_THEFT','COURIER_UNRESPONSIVE') AND applied_penalty_at IS NOT NULL AND applied_penalty_by IS NOT NULL AND applied_penalty_reason IS NOT NULL));