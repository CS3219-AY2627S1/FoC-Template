CREATE TABLE chat_translations (
    id UUID PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    target_language VARCHAR(2) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(80) NOT NULL,
    status VARCHAR(16) NOT NULL,
    translated_text VARCHAR(4000),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    last_error VARCHAR(240),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_chat_translation UNIQUE(message_id, target_language, provider, model),
    CONSTRAINT chk_chat_translation_language CHECK (target_language IN ('EN', 'ZH', 'MS', 'TA')),
    CONSTRAINT chk_chat_translation_status CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
    CONSTRAINT chk_chat_translation_attempts CHECK (attempts >= 0),
    CONSTRAINT chk_chat_translation_result CHECK (
        (status = 'READY' AND translated_text IS NOT NULL AND completed_at IS NOT NULL)
        OR (status <> 'READY' AND translated_text IS NULL)
    )
);

CREATE INDEX ix_chat_translations_dispatch
    ON chat_translations(status, next_attempt_at, updated_at);
