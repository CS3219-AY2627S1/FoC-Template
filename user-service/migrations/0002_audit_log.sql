-- AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-10. Scope: the author's
-- audit-log table (US-NFR1) as designed by the author: hash chain, constraints, indexes and
-- grants. Author review: Reviewed and approved by @t-leongchuan
--
-- Never edit this file after it is merged; add a new numbered file instead.
--
-- Hash chain (computed by the app, src/audit.ts):
--   hash = HMAC-SHA256(AUDIT_HMAC_KEY, prev_hash + "\n" + JSON.stringify(["v1",
--            occurred_at.toISOString(), actor_type, actor_id, action, target_id,
--            previous_value, new_value, reason]))   -- lowercase hex; id is not hashed
-- The first entry's prev_hash is 64 zeros. occurred_at is set by the app (millisecond
-- precision, no DEFAULT), so re-hashing a stored row gives the same result.

CREATE TABLE audit_log (
  id             BIGSERIAL PRIMARY KEY,
  occurred_at    TIMESTAMPTZ NOT NULL,
  actor_type     TEXT NOT NULL CHECK (actor_type IN ('USER', 'SYSTEM')),
  actor_id       UUID REFERENCES users(id) ON DELETE RESTRICT,
  action         TEXT NOT NULL CHECK (action IN
                   ('FIRST_ADMIN_CREATED', 'ROLE_CHANGED',
                    'ACCOUNT_SUSPENDED', 'ACCOUNT_RESTORED')),
  target_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  previous_value TEXT,
  new_value      TEXT NOT NULL,
  reason         TEXT,
  prev_hash      TEXT NOT NULL UNIQUE,   -- one successor per entry: the chain cannot fork
  hash           TEXT NOT NULL UNIQUE,

  CHECK ((actor_type = 'USER') = (actor_id IS NOT NULL)),
  CHECK ((action = 'FIRST_ADMIN_CREATED') = (actor_type = 'SYSTEM')),
  CHECK ((action = 'FIRST_ADMIN_CREATED') = (previous_value IS NULL)),
  CHECK (action NOT IN ('ACCOUNT_SUSPENDED', 'ACCOUNT_RESTORED') OR reason IS NOT NULL),
  CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  CHECK (actor_id IS DISTINCT FROM target_id)   -- no self-actions; the SYSTEM actor (NULL) passes
);

-- The viewer pages by id (under the admin-actions lock, id order is chain order)
CREATE INDEX audit_log_target_id ON audit_log (target_id, id DESC);
CREATE INDEX audit_log_actor_id  ON audit_log (actor_id, id DESC);

-- Append-only for the running service (US-NFR1.2): no UPDATE or DELETE
GRANT INSERT, SELECT ON audit_log TO user_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO user_app;
