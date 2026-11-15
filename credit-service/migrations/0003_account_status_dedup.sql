-- AI assistance: Codex (GPT-6), 2026-10-18. Scope: safe status replay. Author review: Reviewed and approved by @phuc.
-- Retain these markers: outbox cleanup must not allow Kafka replays to reapply old statuses.
CREATE TABLE processed_account_status (
  operation_id UUID PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON processed_account_status TO credit_app;
