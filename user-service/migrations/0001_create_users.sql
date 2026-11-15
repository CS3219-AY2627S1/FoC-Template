-- AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-09. Scope: moved the
-- author's existing users table (previously created at startup) into the first migration
-- and added the grants for the app role. Author review: Reviewed and approved by @t-leongchuan
--
-- Never edit this file after it is merged: the runner refuses to start if an applied
-- migration changes. Add a new numbered file instead.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(30)  NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,30}$'),
  email         VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  display_name  VARCHAR(50)  NOT NULL CHECK (length(display_name) >= 1),
  role          TEXT NOT NULL DEFAULT 'MEMBER'
                CHECK (role IN ('MEMBER', 'ADMINISTRATOR')),
  status        TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
                CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_username_ci ON users (lower(username));

-- The running service reads and writes rows only; it cannot change the schema
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO user_app;
