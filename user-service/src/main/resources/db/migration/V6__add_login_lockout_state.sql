ALTER TABLE users
    ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
    ADD COLUMN login_lockout_until TIMESTAMP WITH TIME ZONE;

ALTER TABLE users
    ADD CONSTRAINT users_failed_login_attempts_valid CHECK (failed_login_attempts >= 0 AND failed_login_attempts < 3);
