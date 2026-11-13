-- Chat between the requester and the courier, open from acceptance until the requester confirms receipt.
CREATE TABLE errand_messages (
    id        UUID PRIMARY KEY,
    errand_id UUID          NOT NULL REFERENCES errands (id) ON DELETE CASCADE,
    sender_id UUID          NOT NULL,
    body      VARCHAR(1000) NOT NULL CHECK (length(btrim(body)) > 0),
    sent_at   TIMESTAMPTZ   NOT NULL
);

CREATE INDEX errand_messages_errand_idx ON errand_messages (errand_id, sent_at, id);
