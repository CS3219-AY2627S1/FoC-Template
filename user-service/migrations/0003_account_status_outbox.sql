-- AI assistance: Codex (GPT-6), 2026-10-18. Scope: transactional account-status outbox.
-- Author review: Reviewed and approved by @phuc. Forward-only: never edit after applying.
CREATE TABLE outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  message_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;
CREATE INDEX outbox_published_idx ON outbox (published_at) WHERE published_at IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox TO user_app;
GRANT USAGE ON SEQUENCE outbox_id_seq TO user_app;
