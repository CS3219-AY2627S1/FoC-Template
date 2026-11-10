-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
-- Scope: Wrote the migration for authentication sessions and refresh token persistence.
-- Author review: I validated correctness and added boundary checks where needed.

-- Phase 2 adds server-revocable refresh-token sessions. Raw refresh tokens
-- never enter this table; only a SHA-256 digest of a high-entropy opaque token
-- is retained.

BEGIN;

CREATE TABLE user_service.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES user_service.users (id) ON DELETE CASCADE,
    refresh_token_hash char(64) NOT NULL,
    token_family uuid NOT NULL,
    issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sessions_refresh_token_hash_unique UNIQUE (refresh_token_hash),
    CONSTRAINT sessions_expiry_after_issue CHECK (expires_at > issued_at)
);

CREATE INDEX sessions_active_user_idx
ON user_service.sessions (user_id)
WHERE revoked_at IS NULL;

CREATE INDEX sessions_token_family_idx
ON user_service.sessions (token_family);

CREATE TRIGGER sessions_set_updated_at
BEFORE UPDATE ON user_service.sessions
FOR EACH ROW
EXECUTE FUNCTION user_service.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_service.sessions TO user_service_app;

COMMIT;
