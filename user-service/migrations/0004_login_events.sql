-- AI Assistance Disclosure: Claude Code (Claude Sonnet 5.5), 2026-11-08. Scope: the author's
-- login-events table (N2H1a) as decided by the author: outcome + reason labels, append-only for
-- the running service, 90-day cleanup through a stored function. Author review: Reviewed and approved by @t-leongchuan
--
-- Never edit this file after it is merged; add a new numbered file instead.
--
-- One row per login attempt. The text the user typed (username/email/password) is never stored.
--   outcome SUCCESS -> reason is NULL
--   outcome FAILED  -> reason WRONG_PASSWORD or NO_SUCH_ACCOUNT
--   outcome BLOCKED -> password was right but the account may not log in:
--                      reason SUSPENDED, CLOSED or NOT_VERIFIED
-- account_id is NULL exactly when the reason is NO_SUCH_ACCOUNT.
-- ip_address is NULL when the service could not read a valid address (a bad address must
-- never stop a login). user_agent is cut to 500 characters by the service before saving.

CREATE TABLE login_events (
  id          BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  account_id  UUID REFERENCES users(id) ON DELETE RESTRICT,
  outcome     TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILED', 'BLOCKED')),
  reason      TEXT CHECK (reason IN ('WRONG_PASSWORD', 'NO_SUCH_ACCOUNT', 'SUSPENDED', 'CLOSED', 'NOT_VERIFIED')),
  ip_address  INET,
  user_agent  TEXT CHECK (char_length(user_agent) <= 500),

  CHECK (
    (outcome = 'SUCCESS' AND reason IS NULL) OR
    (outcome = 'FAILED'  AND reason IS NOT NULL AND reason IN ('WRONG_PASSWORD', 'NO_SUCH_ACCOUNT')) OR
    (outcome = 'BLOCKED' AND reason IS NOT NULL AND reason IN ('SUSPENDED', 'CLOSED', 'NOT_VERIFIED'))
  ),
  CHECK ((account_id IS NULL) = (reason IS NOT DISTINCT FROM 'NO_SUCH_ACCOUNT'))
);

-- The admin list pages by id, newest first, optionally for one account
CREATE INDEX login_events_account_id ON login_events (account_id, id DESC);
-- The 90-day cleanup finds old rows by time
CREATE INDEX login_events_occurred_at ON login_events (occurred_at);

-- Append-only for the running service: no UPDATE or DELETE
GRANT INSERT, SELECT ON login_events TO user_app;
GRANT USAGE ON SEQUENCE login_events_id_seq TO user_app;

-- The only way the running service can remove rows: this saved command, which runs with the
-- owner's rights (SECURITY DEFINER) and can only ever delete rows older than 90 days.
CREATE FUNCTION purge_old_login_events() RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  removed BIGINT;
BEGIN
  DELETE FROM login_events WHERE occurred_at < now() - interval '90 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END
$$;

REVOKE ALL ON FUNCTION purge_old_login_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_old_login_events() TO user_app;
