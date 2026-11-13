ALTER TABLE order_disputes
    ADD COLUMN responder_id UUID,
    ADD COLUMN response VARCHAR(2000),
    ADD COLUMN responded_at TIMESTAMPTZ;
