-- Saved server-only execution provenance. Browser command payloads cannot opt into network trust.
alter table order_commands add column automatic_execution boolean not null default false;
alter table order_commands add constraint ck_automatic_repost_execution
    check (not automatic_execution or (kind='REPOST' and recovery_policy='COMPENSATE'));
