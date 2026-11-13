CREATE TABLE chat_preferences (
    user_id UUID PRIMARY KEY,
    preferred_language VARCHAR(2) NOT NULL DEFAULT 'EN',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_chat_preferred_language CHECK (preferred_language IN ('EN', 'ZH', 'MS', 'TA'))
);

CREATE TABLE chat_conversations (
    id UUID PRIMARY KEY,
    conversation_type VARCHAR(16) NOT NULL,
    order_id UUID NOT NULL,
    case_id UUID,
    case_participant_id UUID,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    next_sequence BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    locked_at TIMESTAMPTZ,
    CONSTRAINT chk_chat_conversation_type CHECK (conversation_type IN ('ERRAND', 'CASE')),
    CONSTRAINT chk_chat_conversation_status CHECK (status IN ('ACTIVE', 'READ_ONLY')),
    CONSTRAINT chk_chat_next_sequence CHECK (next_sequence >= 1),
    CONSTRAINT chk_chat_conversation_shape CHECK (
        (conversation_type = 'ERRAND' AND case_id IS NULL AND case_participant_id IS NULL)
        OR
        (conversation_type = 'CASE' AND case_id IS NOT NULL AND case_participant_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_chat_errand_conversation
    ON chat_conversations (order_id)
    WHERE conversation_type = 'ERRAND';

CREATE UNIQUE INDEX uq_chat_case_participant_conversation
    ON chat_conversations (case_id, case_participant_id)
    WHERE conversation_type = 'CASE';

CREATE TABLE chat_participants (
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    assignment_epoch INTEGER NOT NULL DEFAULT 1,
    relationship VARCHAR(24) NOT NULL,
    can_write BOOLEAN NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, user_id, assignment_epoch),
    CONSTRAINT chk_chat_assignment_epoch CHECK (assignment_epoch >= 1),
    CONSTRAINT chk_chat_participant_relationship CHECK (
        relationship IN ('REQUESTER', 'COURIER', 'ADMIN_REVIEWER', 'CASE_PARTICIPANT')
    ),
    CONSTRAINT chk_chat_participant_time CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX ix_chat_participants_user
    ON chat_participants (user_id, conversation_id);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL,
    sequence BIGINT NOT NULL,
    client_message_id UUID NOT NULL,
    message_type VARCHAR(16) NOT NULL,
    original_language VARCHAR(2),
    quick_reply_key VARCHAR(32),
    text_content VARCHAR(4000),
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_chat_message_sequence UNIQUE (conversation_id, sequence),
    CONSTRAINT uq_chat_message_client_id UNIQUE (conversation_id, sender_user_id, client_message_id),
    CONSTRAINT chk_chat_message_sequence CHECK (sequence >= 1),
    CONSTRAINT chk_chat_message_language CHECK (
        original_language IS NULL OR original_language IN ('EN', 'ZH', 'MS', 'TA')
    ),
    CONSTRAINT chk_chat_quick_reply_key CHECK (
        quick_reply_key IS NULL OR quick_reply_key IN (
            'ON_MY_WAY', 'ARRIVED', 'RUNNING_LATE_5', 'WHERE_MEET', 'THANK_YOU'
        )
    ),
    CONSTRAINT chk_chat_message_shape CHECK (
        (message_type = 'TEXT' AND text_content IS NOT NULL AND quick_reply_key IS NULL)
        OR
        (message_type = 'QUICK_REPLY' AND text_content IS NOT NULL AND quick_reply_key IS NOT NULL)
    )
);

CREATE INDEX ix_chat_messages_history
    ON chat_messages (conversation_id, sequence DESC);
