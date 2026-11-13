-- ADR-054: additive, opt-in fixture protocol. Old commands remain RETRY.
alter table order_commands
    add column recovery_policy varchar(16) not null default 'RETRY',
    add column credit_step_status varchar(16) not null default 'PENDING',
    add column final_stage_status varchar(24) not null default 'PENDING',
    add column resolution_deadline_at timestamptz not null default (clock_timestamp() + interval '120 seconds'),
    add column compensation_id varchar(36),
    add column compensation_generation bigint,
    add constraint ck_command_recovery_policy check (recovery_policy in ('RETRY','COMPENSATE')),
    add constraint ck_command_credit_step check (credit_step_status in ('PENDING','SUCCESS','FAILED','COMPENSATED')),
    add constraint ck_command_final_stage check (final_stage_status in ('PENDING','SUCCESS','FULLY_COMPENSATED')),
    add constraint ck_command_compensation_identity check (
        (compensation_id is null and compensation_generation is null) or
        (compensation_id is not null and compensation_generation is not null and compensation_generation > 0)),
    add constraint ck_command_compensation_terminal check (recovery_policy = 'RETRY' or
        (status = 'PENDING' and final_stage_status = 'PENDING') or
        (status = 'COMPLETED' and outcome = 'SUCCESS' and final_stage_status = 'SUCCESS'
            and credit_step_status = 'SUCCESS' and compensation_id is null) or
        (status = 'COMPLETED' and outcome = 'REJECTED' and final_stage_status = 'FULLY_COMPENSATED'
            and credit_step_status in ('FAILED','COMPENSATED')));

create unique index ux_order_command_compensation on order_commands(compensation_id)
    where compensation_id is not null;
create index ix_order_command_compensation_due on order_commands(resolution_deadline_at)
    where recovery_policy = 'COMPENSATE' and status = 'PENDING';

-- A failed CREATE has a durable command but no orders row. Preserve the existing
-- order FK for lifecycle events; compensation intents reference their command.
alter table order_event_outbox
    alter column order_id drop not null,
    add column command_id varchar(128) references order_commands(command_id),
    add constraint ck_outbox_aggregate_reference check (
        (event_type = 'CreditCompensationRequested' and command_id is not null and order_id is null) or
        (event_type <> 'CreditCompensationRequested' and order_id is not null and command_id is null));

create table order_compensation_result_inbox (
    event_id varchar(36) primary key,
    compensation_id varchar(36) not null,
    command_id varchar(128) not null references order_commands(command_id),
    payload_hash varchar(64) not null,
    received_at timestamptz not null default clock_timestamp()
);
