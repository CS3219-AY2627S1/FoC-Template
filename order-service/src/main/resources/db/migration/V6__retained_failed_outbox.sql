-- ADR-036: preserve exhausted event evidence for explicit operator redrive.
alter table order_event_outbox drop constraint ck_order_event_outbox_state;
alter table order_event_outbox add constraint ck_order_event_outbox_state
    check (state in ('PENDING', 'IN_PROGRESS', 'PUBLISHED', 'FAILED'));
create index ix_order_event_outbox_failed on order_event_outbox(created_at, event_id)
    where state = 'FAILED';
