CREATE TABLE chat_errand_reviews (
    order_id UUID PRIMARY KEY,
    case_id UUID NOT NULL UNIQUE,
    prepared_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
