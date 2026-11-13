-- Admin remembers only the Chat-owned reference, never message content or membership policy.
CREATE TABLE admin_case_conversations (
    case_id UUID NOT NULL,
    participant_user_id UUID NOT NULL,
    conversation_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (case_id, participant_user_id),
    FOREIGN KEY (case_id, participant_user_id) REFERENCES admin_case_participants(case_id, user_id)
);
