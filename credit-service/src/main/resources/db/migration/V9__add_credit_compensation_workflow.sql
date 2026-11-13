/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Database migration generation.
 * Scope: Generated the durable Credit compensation inbox, result outbox, and mutation-fencing schema.
 * Author review: I reviewed for correctness
 */
alter table credit_reservations
    add column mutation_revision bigint not null default 0,
    add column last_mutation_identity varchar(128),
    add column courier_assignment_identity varchar(128);

update credit_reservations
set courier_assignment_identity = courier_assignment_command_id
where courier_assignment_command_id is not null;

alter table credit_reservations
    add constraint ck_credit_reservation_revision check (mutation_revision >= 0);

alter table credit_command_records
    add column effect_revision bigint,
    add column prior_courier_id varchar(128),
    add column prior_assignment_identity varchar(128),
    add column prior_revision bigint,
    add column provider_resolution_revision bigint not null default 0;

alter table credit_command_records
    add constraint ck_credit_command_effect_revision check (effect_revision is null or effect_revision > 0),
    add constraint ck_credit_command_prior_revision check (prior_revision is null or prior_revision >= 0),
    add constraint ck_credit_command_resolution_revision check (provider_resolution_revision >= 0);

create table credit_compensation_inbox (
    event_id varchar(36) primary key,
    command_id varchar(128) not null references credit_command_records(command_id),
    generation bigint not null,
    binding_hash varchar(64) not null,
    payload_hash varchar(64) not null,
    outcome varchar(32) not null,
    code varchar(80) not null,
    result_event_id varchar(36) not null unique,
    provider_resolution_revision bigint not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint uq_credit_compensation_command unique (command_id),
    constraint ck_credit_compensation_generation check (generation > 0),
    constraint ck_credit_compensation_outcome check (
        outcome in ('COMPENSATED', 'RECONCILIATION_REQUIRED')
    ),
    constraint ck_credit_compensation_resolution_revision check (provider_resolution_revision > 0)
);

create table credit_compensation_result_outbox (
    event_id varchar(36) primary key,
    compensation_id varchar(36) not null references credit_compensation_inbox(event_id),
    command_id varchar(128) not null references credit_command_records(command_id),
    event_type varchar(80) not null,
    event_version integer not null,
    provider_resolution_revision bigint not null,
    payload text not null,
    state varchar(20) not null,
    attempt_count integer not null default 0,
    created_at timestamp with time zone not null,
    next_attempt_at timestamp with time zone not null,
    lease_until timestamp with time zone,
    published_at timestamp with time zone,
    last_error varchar(2000),
    constraint uq_credit_compensation_result_revision
        unique (compensation_id, provider_resolution_revision),
    constraint ck_credit_compensation_result_state check (
        state in ('PENDING', 'IN_PROGRESS', 'PUBLISHED', 'FAILED')
    ),
    constraint ck_credit_compensation_result_attempts check (attempt_count >= 0),
    constraint ck_credit_compensation_result_version check (event_version = 1),
    constraint ck_credit_compensation_result_resolution check (provider_resolution_revision > 0)
);

create index ix_credit_compensation_outbox_due
    on credit_compensation_result_outbox(state, next_attempt_at)
    where state in ('PENDING', 'IN_PROGRESS');

create index ix_credit_compensation_inbox_command
    on credit_compensation_inbox(command_id);
