ALTER TABLE chat_messages ADD COLUMN assignment_epoch INTEGER NOT NULL DEFAULT 1;
ALTER TABLE chat_messages ADD CONSTRAINT chk_chat_message_epoch CHECK (assignment_epoch >= 1);

CREATE TABLE chat_attachments (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL,
    content_type VARCHAR(32) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_chat_attachment_type CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
    CONSTRAINT chk_chat_attachment_size CHECK (size_bytes > 0 AND size_bytes <= 5242880)
);

ALTER TABLE chat_messages ADD COLUMN attachment_id UUID REFERENCES chat_attachments(id);
ALTER TABLE chat_messages DROP CONSTRAINT chk_chat_message_shape;
ALTER TABLE chat_messages ADD CONSTRAINT chk_chat_message_shape CHECK (
    (message_type = 'TEXT' AND text_content IS NOT NULL AND quick_reply_key IS NULL AND attachment_id IS NULL)
    OR (message_type = 'QUICK_REPLY' AND text_content IS NOT NULL AND quick_reply_key IS NOT NULL AND attachment_id IS NULL)
    OR (message_type = 'IMAGE' AND text_content IS NULL AND quick_reply_key IS NULL AND attachment_id IS NOT NULL)
);

CREATE TABLE chat_processed_events (
    event_id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    source_sequence BIGINT NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_chat_processed_order_sequence UNIQUE (order_id, source_sequence)
);
