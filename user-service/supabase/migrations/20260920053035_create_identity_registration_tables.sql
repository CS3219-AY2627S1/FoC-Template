-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
-- Scope: Wrote the migration for registration tables and constraints.
-- Author review: I validated correctness and added boundary checks where needed.

-- Phase 1 owns only pending registration, verified identity, and credentials.
-- FastAPI applies this schema through the Supabase migration workflow; it never
-- creates schema objects at startup.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'user_service_app') THEN
        CREATE ROLE user_service_app NOLOGIN NOINHERIT;
    END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS user_service;

CREATE TYPE user_service.system_role AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

CREATE TYPE user_service.account_status AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TYPE user_service.participation_mode AS ENUM ('REQUESTER', 'COURIER');

CREATE OR REPLACE FUNCTION user_service.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TABLE user_service.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username varchar(64) NOT NULL,
    normalized_username varchar(64) NOT NULL,
    email varchar(254) NOT NULL,
    normalized_email varchar(254) NOT NULL,
    display_name varchar(64) NOT NULL,
    system_role user_service.system_role NOT NULL DEFAULT 'USER',
    account_status user_service.account_status NOT NULL DEFAULT 'ACTIVE',
    email_verified_at timestamptz NOT NULL,
    active_participation_mode user_service.participation_mode NOT NULL DEFAULT 'REQUESTER',
    role_version integer NOT NULL DEFAULT 1 CHECK (role_version >= 1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_username_unique UNIQUE (username),
    CONSTRAINT users_normalized_username_unique UNIQUE (normalized_username),
    CONSTRAINT users_normalized_email_unique UNIQUE (normalized_email)
);

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON user_service.users
FOR EACH ROW
EXECUTE FUNCTION user_service.set_updated_at();

CREATE TABLE user_service.credentials (
    user_id uuid PRIMARY KEY REFERENCES user_service.users (id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    password_changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER credentials_set_updated_at
BEFORE UPDATE ON user_service.credentials
FOR EACH ROW
EXECUTE FUNCTION user_service.set_updated_at();

CREATE TABLE user_service.registration_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username varchar(64) NOT NULL,
    normalized_username varchar(64) NOT NULL,
    email varchar(254) NOT NULL,
    normalized_email varchar(254) NOT NULL,
    display_name varchar(64) NOT NULL,
    password_hash text NOT NULL,
    otp_digest char(64) NOT NULL,
    otp_expires_at timestamptz NOT NULL,
    verification_attempts smallint NOT NULL DEFAULT 0 CHECK (verification_attempts >= 0),
    resend_count smallint NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
    next_resend_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT registration_challenges_normalized_email_unique UNIQUE (normalized_email),
    CONSTRAINT registration_challenges_normalized_username_unique UNIQUE (normalized_username)
);

CREATE INDEX registration_challenges_expiry_idx
ON user_service.registration_challenges (otp_expires_at);

CREATE TRIGGER registration_challenges_set_updated_at
BEFORE UPDATE ON user_service.registration_challenges
FOR EACH ROW
EXECUTE FUNCTION user_service.set_updated_at();

GRANT USAGE ON SCHEMA user_service TO user_service_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    user_service.users,
    user_service.credentials,
    user_service.registration_challenges
TO user_service_app;

COMMIT;
