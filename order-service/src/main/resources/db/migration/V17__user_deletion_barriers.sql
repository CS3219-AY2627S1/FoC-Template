-- Durable User deletion coordination. No existing Order/command/history is rewritten.
-- Apply with normal Flyway startup; retain granted barriers across all recovery/redeployment.
CREATE TABLE order_user_deletion_guards (
    user_id varchar(128) PRIMARY KEY,
    blocked boolean NOT NULL DEFAULT false,
    operation_id varchar(128),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (blocked = (operation_id IS NOT NULL))
);

CREATE TABLE order_user_deletion_preparations (
    user_id varchar(128) NOT NULL REFERENCES order_user_deletion_guards(user_id),
    operation_id varchar(128) NOT NULL,
    granted boolean NOT NULL,
    decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (user_id, operation_id)
);

CREATE INDEX ix_pending_commands_actor_deletion ON order_commands(actor_id) WHERE status = 'PENDING';
