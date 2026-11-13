ALTER TABLE orders ADD COLUMN delivery_overdue boolean;
ALTER TABLE orders ADD COLUMN overdue_penalty_waived boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN overdue_waived_at timestamptz;
ALTER TABLE orders ADD COLUMN overdue_waived_by varchar(128);
ALTER TABLE orders ADD COLUMN overdue_waiver_reason varchar(1000);
UPDATE orders SET delivery_overdue = delivered_at > delivery_deadline_at
WHERE delivered_at IS NOT NULL AND delivery_deadline_at IS NOT NULL;
ALTER TABLE orders ADD CONSTRAINT ck_order_overdue_waiver CHECK (
    (NOT overdue_penalty_waived AND overdue_waived_at IS NULL AND overdue_waived_by IS NULL AND overdue_waiver_reason IS NULL)
    OR (overdue_penalty_waived AND delivery_overdue IS TRUE AND overdue_waived_at IS NOT NULL
        AND overdue_waived_by IS NOT NULL AND overdue_waiver_reason IS NOT NULL));
ALTER TABLE order_completion_holds ADD COLUMN released_at timestamptz;
ALTER TABLE order_completion_holds ADD COLUMN released_by varchar(128);
ALTER TABLE order_completion_holds ADD CONSTRAINT ck_report_hold_release CHECK (
    (released_at IS NULL AND released_by IS NULL) OR (released_at IS NOT NULL AND released_by IS NOT NULL));
CREATE INDEX ix_active_report_holds ON order_completion_holds(order_id) WHERE released_at IS NULL;
