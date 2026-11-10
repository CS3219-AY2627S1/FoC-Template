-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
-- Scope: Wrote the migration for account anonymization and tombstone constraints.
-- Author review: I validated correctness and added boundary checks where needed.

-- Phase 3 turns deletion into an irreversible, de-identified identity
-- tombstone. The immutable user ID remains available to records owned by
-- other services; credentials, sessions, and User Service PII do not.

ALTER TYPE user_service.account_status ADD VALUE IF NOT EXISTS 'DELETED';

BEGIN;

ALTER TABLE user_service.users
    ALTER COLUMN username DROP NOT NULL,
    ALTER COLUMN normalized_username DROP NOT NULL,
    ALTER COLUMN email DROP NOT NULL,
    ALTER COLUMN normalized_email DROP NOT NULL,
    ALTER COLUMN email_verified_at DROP NOT NULL,
    ADD COLUMN deleted_at timestamptz;

ALTER TABLE user_service.users
    ADD CONSTRAINT users_deleted_at_matches_status
    CHECK (
        (account_status = 'DELETED' AND deleted_at IS NOT NULL)
        OR (account_status <> 'DELETED' AND deleted_at IS NULL)
    );

COMMIT;
