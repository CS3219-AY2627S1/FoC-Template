-- AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-11-10. Scope: the author's
-- account reviews (N2H1b) as decided by the author: OPEN -> DECIDED or CANCELLED, one open review
-- per account, required reasons (1-500), an evidence snapshot saved at decision time, and the
-- review audit actions. Author review: Reviewed and approved by @t-leongchuan
--
-- Never edit this file after it is merged; add a new numbered file instead.
--
-- One row per review of one account.
--   OPEN      -> nothing closed yet
--   DECIDED   -> outcome, reasoning and the evidence snapshot are set
--   CANCELLED -> reasoning (why it was cancelled) is set; no outcome, no evidence
-- Outcomes depend on the account's status when the review was opened (author's decision):
--   SUSPENDED -> REINSTATE or KEEP_SUSPENDED;  ACTIVE -> SUSPEND or NO_ACTION
CREATE TABLE account_reviews (
  id               BIGSERIAL PRIMARY KEY,
  account_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DECIDED', 'CANCELLED')),
  status_at_open   TEXT NOT NULL CHECK (status_at_open IN ('ACTIVE', 'SUSPENDED')),
  opened_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  open_reason      TEXT NOT NULL CHECK (char_length(open_reason) BETWEEN 1 AND 500),
  closed_by        UUID REFERENCES users(id) ON DELETE RESTRICT,
  closed_at        TIMESTAMPTZ,
  outcome          TEXT CHECK (outcome IN ('REINSTATE', 'KEEP_SUSPENDED', 'SUSPEND', 'NO_ACTION')),
  reasoning        TEXT CHECK (char_length(reasoning) BETWEEN 1 AND 500),
  evidence         JSONB,

  -- The audit log refuses actions on oneself; a review of one's own account is refused too
  CHECK (opened_by <> account_id),
  CHECK (closed_by IS NULL OR closed_by <> account_id),
  CHECK (
    (status = 'OPEN' AND closed_by IS NULL AND closed_at IS NULL AND outcome IS NULL AND reasoning IS NULL AND evidence IS NULL)
    OR (status = 'DECIDED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL AND outcome IS NOT NULL
        AND reasoning IS NOT NULL AND evidence IS NOT NULL)
    OR (status = 'CANCELLED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL AND outcome IS NULL
        AND reasoning IS NOT NULL AND evidence IS NULL)
  ),
  CHECK (outcome IS NULL
    OR (status_at_open = 'SUSPENDED' AND outcome IN ('REINSTATE', 'KEEP_SUSPENDED'))
    OR (status_at_open = 'ACTIVE' AND outcome IN ('SUSPEND', 'NO_ACTION')))
);

-- Author's decision: at most one open review per account
CREATE UNIQUE INDEX account_reviews_one_open ON account_reviews (account_id) WHERE status = 'OPEN';
CREATE INDEX account_reviews_account ON account_reviews (account_id, id DESC);
CREATE INDEX account_reviews_status ON account_reviews (status, id DESC);

-- The running service opens and closes reviews; it can never delete them, and only the
-- closing columns can change.
GRANT SELECT, INSERT ON account_reviews TO user_app;
GRANT UPDATE (status, closed_by, closed_at, outcome, reasoning, evidence) ON account_reviews TO user_app;
GRANT USAGE ON SEQUENCE account_reviews_id_seq TO user_app;

-- Review actions go into the hash-chained audit log next to the existing four
ALTER TABLE audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN
  ('FIRST_ADMIN_CREATED', 'ROLE_CHANGED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_RESTORED',
   'REVIEW_OPENED', 'REVIEW_DECIDED', 'REVIEW_CANCELLED'));
