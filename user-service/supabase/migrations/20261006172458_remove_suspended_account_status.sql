-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
-- Scope: Wrote the migration for removing the suspended account status.
-- Author review: I validated correctness and added boundary checks where needed.

-- Account status supports active identities and terminal deleted tombstones.
-- Refuse unexpected legacy data instead of reactivating or deleting accounts.

BEGIN;

LOCK TABLE user_service.users IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM user_service.users WHERE account_status::text = 'SUSPENDED'
    ) THEN
        RAISE EXCEPTION 'Cannot remove SUSPENDED account status: suspended accounts still exist'
            USING ERRCODE = '23514';
    END IF;
END
$$;

ALTER TABLE user_service.users
    DROP CONSTRAINT users_deleted_at_matches_status,
    ALTER COLUMN account_status DROP DEFAULT;

ALTER TYPE user_service.account_status RENAME TO account_status_old;
CREATE TYPE user_service.account_status AS ENUM ('ACTIVE', 'DELETED');

ALTER TABLE user_service.users
    ALTER COLUMN account_status TYPE user_service.account_status
        USING account_status::text::user_service.account_status,
    ALTER COLUMN account_status SET DEFAULT 'ACTIVE'::user_service.account_status,
    ADD CONSTRAINT users_deleted_at_matches_status CHECK (
        (account_status = 'DELETED' AND deleted_at IS NOT NULL)
        OR (account_status <> 'DELETED' AND deleted_at IS NULL)
    );

GRANT USAGE ON TYPE user_service.account_status TO user_service_app;

-- RESTRICT keeps unknown dependencies from being silently removed.
DROP TYPE user_service.account_status_old RESTRICT;

COMMIT;
