create table order_event_outbox (
    event_id varchar(36) primary key,
    order_id varchar(36) not null references orders(id),
    event_type varchar(100) not null,
    event_version integer not null,
    order_version bigint not null,
    payload text not null,
    state varchar(20) not null,
    attempt_count integer not null default 0,
    created_at timestamp with time zone not null,
    next_attempt_at timestamp with time zone not null,
    lease_until timestamp with time zone,
    published_at timestamp with time zone,
    last_error varchar(2000),
    constraint ck_order_event_outbox_state check (state in ('PENDING', 'IN_PROGRESS', 'PUBLISHED')),
    constraint ck_order_event_outbox_attempts check (attempt_count >= 0)
);

create index ix_order_event_outbox_due
    on order_event_outbox(state, next_attempt_at, created_at)
    where state = 'PENDING';

create index ix_order_event_outbox_expired_lease
    on order_event_outbox(state, lease_until)
    where state = 'IN_PROGRESS';
