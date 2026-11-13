-- Additive, default-disabled Report contract-stub saga. Existing commands/holds are not rewritten.
create table order_report_resolutions (
    command_id varchar(128) primary key,
    order_id varchar(36) not null references orders(id),
    report_id varchar(128) not null references order_completion_holds(report_id),
    requester_id varchar(128) not null,
    courier_id varchar(128),
    admin_id varchar(128) not null,
    reply varchar(2000) not null,
    input_hash varchar(64) not null,
    owner varchar(36) not null,
    generation bigint not null default 1,
    state varchar(32) not null default 'PENDING',
    reason varchar(80) not null default 'RESOLVING_REPORT',
    possible_effect boolean not null default false,
    remote_confirmed boolean not null default false,
    lease_until timestamptz not null default (clock_timestamp() + interval '120 seconds'),
    next_retry_at timestamptz not null default (clock_timestamp() + interval '120 seconds'),
    compensation_id varchar(36) unique,
    result jsonb,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    check (state in ('PENDING','SUCCEEDED','REJECTED','COMPENSATING','COMPENSATED','RECONCILIATION_REQUIRED')),
    check (generation in (1,2)),
    check ((compensation_id is null and generation=1) or (compensation_id is not null and generation=2)),
    check (state <> 'SUCCEEDED' or (result is not null and remote_confirmed and possible_effect and compensation_id is null)),
    check (state not in ('COMPENSATING','COMPENSATED','RECONCILIATION_REQUIRED') or (possible_effect and compensation_id is not null))
);
create unique index ux_report_resolution_active on order_report_resolutions(report_id)
    where state in ('PENDING','COMPENSATING','RECONCILIATION_REQUIRED');
create index ix_report_resolution_due on order_report_resolutions(next_retry_at)
    where state in ('PENDING','COMPENSATING');

create table order_report_resolution_results (
    event_id varchar(36) primary key,
    command_id varchar(128) not null references order_report_resolutions(command_id),
    compensation_id varchar(36) not null,
    payload_hash varchar(64) not null,
    received_at timestamptz not null default clock_timestamp()
);
