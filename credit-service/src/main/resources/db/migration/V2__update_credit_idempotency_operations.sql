alter table credit_idempotency_records
    drop constraint ck_credit_idempotency_operation,
    add constraint ck_credit_idempotency_operation check (
        operation in ('USER_REGISTERED', 'ORDER_CANCELLED', 'ORDER_EXPIRED',
                      'ORDER_ABORTED', 'ORDER_COMPLETED', 'OPEN_ORDER_REFUND',
                      'ACCEPTED_ORDER_CANCELLATION', 'ORDER_COMPLETION')
    );
