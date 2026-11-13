create table credit_command_records (
    command_id varchar(128) primary key,
    operation varchar(32) not null,
    actor_id varchar(128) not null,
    order_id varchar(128) not null,
    amount bigint,
    payload_hash varchar(64) not null,
    highest_generation bigint not null,
    outcome varchar(20) not null,
    code varchar(80) not null,
    result_json text,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    completed_at timestamp with time zone,
    constraint ck_credit_command_operation check (
        operation in ('RESERVE', 'ASSIGN_COURIER', 'CLEAR_COURIER')
    ),
    constraint ck_credit_command_generation check (highest_generation > 0),
    constraint ck_credit_command_outcome check (
        outcome in ('PENDING', 'APPLIED', 'REJECTED', 'COMPENSATED')
    ),
    constraint ck_credit_command_amount check (
        (operation = 'RESERVE' and amount > 0)
        or (operation <> 'RESERVE' and amount is null)
    ),
    constraint ck_credit_command_terminal check (
        (outcome = 'PENDING' and completed_at is null and code = 'PENDING')
        or (outcome <> 'PENDING' and completed_at is not null)
    )
);

create index ix_credit_commands_actor_created
    on credit_command_records(actor_id, created_at desc);

alter table credit_reservations
    add column reserve_command_id varchar(128)
        references credit_command_records(command_id),
    add column courier_assignment_command_id varchar(128)
        references credit_command_records(command_id);

create index ix_credit_reservations_reserve_command
    on credit_reservations(reserve_command_id)
    where reserve_command_id is not null;

create index ix_credit_reservations_assignment_command
    on credit_reservations(courier_assignment_command_id)
    where courier_assignment_command_id is not null;

alter table credit_ledger
    drop constraint ck_credit_ledger_refund_reason,
    add constraint ck_credit_ledger_refund_reason
        check (refund_reason is null or refund_reason in ('CANCELLATION', 'EXPIRY', 'COMPENSATION'));
