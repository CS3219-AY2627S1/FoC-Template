ALTER TABLE orders
    ADD COLUMN completion_hold BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE order_completion_holds (
    report_id VARCHAR(128) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL REFERENCES orders(id),
    requester_id VARCHAR(128) NOT NULL,
    placed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX ix_order_completion_holds_order ON order_completion_holds(order_id);
