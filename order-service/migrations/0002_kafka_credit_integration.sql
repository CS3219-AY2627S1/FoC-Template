-- AI Assistance Disclosure:
-- Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
-- Scope: Kafka integration with Credit Service: a sequential outbox id that fixes publication
--        order, and a table of processed credit.results event_ids for deduplication.
-- Author review: Reviewed and approved by @phuc

-- 1. Sequential outbox ids. The publisher sends rows in id order under one advisory lock, so
-- rows for one errand reach Kafka in the order they committed: every transaction that writes an
-- errand's outbox row first locks that errand's row, so a later row for the same errand takes
-- its id only after the earlier one has committed. Existing rows are numbered in created_at
-- order, so anything still unpublished keeps its place.
CREATE SEQUENCE outbox_id_seq;
ALTER TABLE outbox ADD COLUMN id BIGINT;
UPDATE outbox o SET id = numbered.n
FROM (SELECT event_id, row_number() OVER (ORDER BY created_at, event_id) AS n FROM outbox) numbered
WHERE o.event_id = numbered.event_id;
SELECT setval('outbox_id_seq', COALESCE((SELECT max(id) FROM outbox), 0) + 1, false);
ALTER TABLE outbox
  ALTER COLUMN id SET DEFAULT nextval('outbox_id_seq'),
  ALTER COLUMN id SET NOT NULL,
  ADD CONSTRAINT outbox_id_key UNIQUE (id);
ALTER SEQUENCE outbox_id_seq OWNED BY outbox.id;

DROP INDEX outbox_unpublished_idx;
CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;

-- 2. credit.results replies already applied. A row is written in the same transaction as the
-- reply's effect on the errand, so a redelivered reply is recognised and skipped.
CREATE TABLE processed_credit_results (
  event_id      UUID PRIMARY KEY,
  order_id      UUID NOT NULL,
  result_type   TEXT NOT NULL CHECK (result_type IN ('CreditReserved','CreditReservationRejected')),
  outcome       TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT USAGE ON SEQUENCE outbox_id_seq TO order_app;
-- UPDATE records the outcome once the reply has been applied, in the same transaction
GRANT SELECT, INSERT, UPDATE ON processed_credit_results TO order_app;
