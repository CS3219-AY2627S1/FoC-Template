/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the Flyway PostgreSQL schema migration based on the provided table definitions and constraints.
 * Author review: I reviewed for correctness.
 */
create table credit_accounts (
    user_id varchar(128) primary key,
    total_balance bigint not null,
    reserved_balance bigint not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint ck_credit_account_total check (total_balance >= 0),
    constraint ck_credit_account_reserved check (reserved_balance >= 0),
    constraint ck_credit_account_usable check (reserved_balance <= total_balance)
);

create table credit_reservations (
    order_id varchar(128) primary key,
    requester_id varchar(128) not null references credit_accounts(user_id),
    courier_id varchar(128) references credit_accounts(user_id),
    amount bigint not null,
    status varchar(20) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    refunded_at timestamp with time zone,
    paid_at timestamp with time zone,
    constraint ck_credit_reservation_amount check (amount > 0),
    constraint ck_credit_reservation_status check (status in ('RESERVED', 'REFUNDED', 'PAID')),
    constraint ck_credit_reservation_state check (
        (status = 'RESERVED' and refunded_at is null and paid_at is null)
        or (status = 'REFUNDED' and refunded_at is not null and paid_at is null)
        or (status = 'PAID' and refunded_at is null and paid_at is not null and courier_id is not null)
    )
);

create index ix_credit_reservations_requester_status
    on credit_reservations(requester_id, status);

create index ix_credit_reservations_courier
    on credit_reservations(courier_id)
    where courier_id is not null;

create table credit_idempotency_records (
    operation varchar(80) not null,
    idempotency_key varchar(128) not null,
    payload_hash char(64) not null,
    processed_at timestamp with time zone not null,
    primary key (operation, idempotency_key),
    constraint ck_credit_idempotency_operation check (
        operation in ('USER_REGISTERED', 'ORDER_CANCELLED', 'ORDER_EXPIRED',
                      'ORDER_ABORTED', 'ORDER_COMPLETED')
    )
);

create table credit_ledger (
    entry_id uuid primary key,
    user_id varchar(128) not null references credit_accounts(user_id),
    order_id varchar(128),
    origin_type varchar(80) not null,
    origin_id varchar(128) not null,
    effect_type varchar(40) not null,
    amount bigint not null,
    total_balance_delta bigint not null,
    reserved_balance_delta bigint not null,
    occurred_at timestamp with time zone not null,
    created_at timestamp with time zone not null,
    constraint ck_credit_ledger_amount check (amount > 0),
    constraint ux_credit_ledger_origin_effect
        unique (origin_type, origin_id, effect_type)
);

create index ix_credit_ledger_user_created
    on credit_ledger(user_id, created_at);

create index ix_credit_ledger_order
    on credit_ledger(order_id)
    where order_id is not null;
