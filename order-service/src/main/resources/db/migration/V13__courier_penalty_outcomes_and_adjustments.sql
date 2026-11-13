ALTER TABLE orders ADD COLUMN courier_assignment_id uuid;
CREATE TABLE order_penalty_outcomes (
    id uuid PRIMARY KEY,
    order_id varchar(36) NOT NULL REFERENCES orders(id),
    courier_id varchar(128) NOT NULL,
    initial_event_id varchar(36) UNIQUE,
    initial_policy varchar(64), initial_signed_amount integer NOT NULL,
    policy varchar(64), signed_amount integer NOT NULL,
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
    confirmed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
    requested_by varchar(128) NOT NULL, reason varchar(1000) NOT NULL,
    version bigint NOT NULL DEFAULT 0
);
CREATE INDEX ix_penalty_outcome_order ON order_penalty_outcomes(order_id,created_at);
CREATE TABLE order_penalty_adjustments (
    command_id varchar(128) PRIMARY KEY, request_id varchar(36) NOT NULL UNIQUE,
    binding varchar(64) NOT NULL,
    penalty_id uuid NOT NULL REFERENCES order_penalty_outcomes(id),
    order_id varchar(36) NOT NULL REFERENCES orders(id), courier_id varchar(128) NOT NULL,
    expected_revision bigint NOT NULL, revision bigint NOT NULL,
    initial_event_id varchar(36), initial_policy varchar(64), initial_signed_amount integer NOT NULL,
    previous_policy varchar(64), previous_signed_amount integer NOT NULL,
    policy varchar(64), signed_amount integer NOT NULL,
    occurred_at timestamptz NOT NULL, admin_id varchar(128) NOT NULL, reason varchar(1000) NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('PENDING','CONFIRMED')), confirmed_at timestamptz,
    version bigint NOT NULL DEFAULT 0,
    UNIQUE(penalty_id,revision),
    CHECK (revision=expected_revision+1),
    CHECK ((status='PENDING' AND confirmed_at IS NULL) OR (status='CONFIRMED' AND confirmed_at IS NOT NULL))
);
CREATE UNIQUE INDEX ux_penalty_adjustment_pending ON order_penalty_adjustments(penalty_id) WHERE status='PENDING';
