-- CHANGE-086: explicit new acceptance expiry and latest safe UI outcome.
-- Vincent chose disabling legacy automatic plans, not inventing an expiry.
alter table orders add column repost_expires_at timestamp with time zone;
alter table orders add column repost_failure_code varchar(40);
alter table orders add column repost_failure_message varchar(256);
alter table orders add column repost_failure_at timestamp with time zone;

update orders set enabled = false where enabled = true and repost_expires_at is null;

alter table orders add constraint ck_order_repost_timing check (
    enabled is not true or (
        due_at is not null and repost_expires_at is not null
        and due_at >= expires_at and repost_expires_at > due_at
    )
);
