-- Chat messages can carry a photo or video (with or without text).
ALTER TABLE errand_messages
    DROP CONSTRAINT errand_messages_body_check,
    ALTER COLUMN body DROP NOT NULL,
    ADD COLUMN attachment_key  VARCHAR(255) UNIQUE,
    ADD COLUMN attachment_type VARCHAR(10),
    ADD CONSTRAINT errand_messages_attachment_check
        CHECK ((attachment_key IS NULL) = (attachment_type IS NULL)
            AND (attachment_type IS NULL OR attachment_type IN ('IMAGE', 'VIDEO'))),
    ADD CONSTRAINT errand_messages_content_check
        CHECK (length(btrim(body)) > 0 OR (body IS NULL AND attachment_key IS NOT NULL));

-- How far each person has read the chat, for "Seen".
CREATE TABLE errand_chat_reads (
    errand_id    UUID        NOT NULL REFERENCES errands (id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL,
    last_read_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (errand_id, user_id)
);
