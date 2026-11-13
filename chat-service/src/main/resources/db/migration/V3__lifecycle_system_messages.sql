ALTER TABLE chat_messages ALTER COLUMN sender_user_id DROP NOT NULL;
ALTER TABLE chat_messages ALTER COLUMN client_message_id DROP NOT NULL;
ALTER TABLE chat_messages ALTER COLUMN assignment_epoch DROP NOT NULL;

ALTER TABLE chat_messages ADD COLUMN source_event_id UUID;
ALTER TABLE chat_messages ADD COLUMN source_sequence BIGINT;
ALTER TABLE chat_messages ADD COLUMN lifecycle_action VARCHAR(40);
ALTER TABLE chat_messages ADD COLUMN lifecycle_from_state VARCHAR(32);
ALTER TABLE chat_messages ADD COLUMN lifecycle_to_state VARCHAR(32);

ALTER TABLE chat_messages DROP CONSTRAINT chk_chat_message_shape;
ALTER TABLE chat_messages ADD CONSTRAINT chk_chat_message_shape CHECK (
    (
        message_type = 'TEXT'
        AND sender_user_id IS NOT NULL AND client_message_id IS NOT NULL
        AND assignment_epoch IS NOT NULL
        AND text_content IS NOT NULL AND quick_reply_key IS NULL AND attachment_id IS NULL
        AND source_event_id IS NULL AND source_sequence IS NULL AND lifecycle_action IS NULL
        AND lifecycle_from_state IS NULL AND lifecycle_to_state IS NULL
    )
    OR (
        message_type = 'QUICK_REPLY'
        AND sender_user_id IS NOT NULL AND client_message_id IS NOT NULL
        AND assignment_epoch IS NOT NULL
        AND text_content IS NOT NULL AND quick_reply_key IS NOT NULL AND attachment_id IS NULL
        AND source_event_id IS NULL AND source_sequence IS NULL AND lifecycle_action IS NULL
        AND lifecycle_from_state IS NULL AND lifecycle_to_state IS NULL
    )
    OR (
        message_type = 'IMAGE'
        AND sender_user_id IS NOT NULL AND client_message_id IS NOT NULL
        AND assignment_epoch IS NOT NULL
        AND text_content IS NULL AND quick_reply_key IS NULL AND attachment_id IS NOT NULL
        AND source_event_id IS NULL AND source_sequence IS NULL AND lifecycle_action IS NULL
        AND lifecycle_from_state IS NULL AND lifecycle_to_state IS NULL
    )
    OR (
        message_type = 'SYSTEM'
        AND sender_user_id IS NULL AND client_message_id IS NULL
        AND original_language IS NULL AND quick_reply_key IS NULL AND attachment_id IS NULL
        AND text_content IS NOT NULL
        AND source_event_id IS NOT NULL AND source_sequence IS NOT NULL
        AND lifecycle_action IS NOT NULL AND lifecycle_to_state IS NOT NULL
    )
);

ALTER TABLE chat_messages ADD CONSTRAINT chk_chat_lifecycle_source_sequence
    CHECK (source_sequence IS NULL OR source_sequence >= 1);

CREATE UNIQUE INDEX uq_chat_message_source_event
    ON chat_messages (source_event_id)
    WHERE source_event_id IS NOT NULL;

CREATE INDEX ix_chat_messages_lifecycle
    ON chat_messages (conversation_id, source_sequence)
    WHERE message_type = 'SYSTEM';
