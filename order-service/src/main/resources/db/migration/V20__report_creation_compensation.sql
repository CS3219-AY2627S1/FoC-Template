-- Durable report-creation fencing. No existing hold is backfilled or changed.
create table order_report_creation_lifecycles (
    report_id varchar(128) primary key,
    submission_id varchar(36) not null unique,
    order_id varchar(36) not null references orders(id),
    reporter_id varchar(128) not null,
    state varchar(16) not null,
    hold_ever_created boolean not null default false,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    check (state in ('ACTIVE','CANCELLED'))
);

create index ix_report_creation_lifecycle_order on order_report_creation_lifecycles(order_id);

create table order_report_creation_compensations (
    event_id varchar(36) primary key,
    report_id varchar(128) not null references order_report_creation_lifecycles(report_id),
    submission_id varchar(36) not null,
    input_hash varchar(64) not null,
    outcome varchar(40) not null,
    result_event_id varchar(36) not null unique,
    received_at timestamptz not null default clock_timestamp(),
    check (outcome in ('RELEASED','ALREADY_RELEASED','NOT_FOUND','BINDING_MISMATCH','RECONCILIATION_REQUIRED'))
);
