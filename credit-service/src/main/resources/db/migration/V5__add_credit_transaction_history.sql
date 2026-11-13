alter table credit_ledger
    add column refund_reason varchar(20),
    add constraint ck_credit_ledger_refund_reason
        check (refund_reason is null or refund_reason in ('CANCELLATION', 'EXPIRY'));

create index ix_credit_ledger_user_history
    on credit_ledger(user_id, occurred_at desc, created_at desc, entry_id desc);
