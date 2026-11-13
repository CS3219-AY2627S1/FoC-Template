CREATE TABLE password_reset_request_cooldowns (
    email_digest VARCHAR(64) PRIMARY KEY,
    next_available_at TIMESTAMP WITH TIME ZONE NOT NULL
);
