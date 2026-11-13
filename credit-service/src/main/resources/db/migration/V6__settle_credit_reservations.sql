CREATE TABLE credit_transaction_log (
    operation_id UUID PRIMARY KEY,
    errand_id UUID NOT NULL REFERENCES credit_reservations(errand_id),
    user_id UUID NOT NULL REFERENCES credit_accounts(user_id),
    courier_id UUID REFERENCES credit_accounts(user_id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('RESERVE', 'REFUND', 'PAYMENT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((transaction_type = 'PAYMENT') = (courier_id IS NOT NULL))
);

-- Spring Modulith JDBC event publication registry.
CREATE TABLE event_publication (
    id UUID PRIMARY KEY,
    listener_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    serialized_event TEXT NOT NULL,
    publication_date TIMESTAMPTZ NOT NULL,
    completion_date TIMESTAMPTZ,
    status TEXT,
    completion_attempts INTEGER,
    last_resubmission_date TIMESTAMPTZ
);
CREATE INDEX event_publication_serialized_event_hash_idx ON event_publication USING hash(serialized_event);
CREATE INDEX event_publication_by_completion_date_idx ON event_publication(completion_date);
