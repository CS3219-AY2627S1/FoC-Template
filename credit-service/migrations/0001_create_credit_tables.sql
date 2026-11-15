-- AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: the author's
-- four-table schema exactly as decided in docs/decision-record.md (D1), plus the app-role
-- grants. Author review: Reviewed and approved by @phuc
--
-- Never edit this file after it is merged; add a new numbered file instead.

CREATE TABLE credit_accounts (
  user_id            UUID PRIMARY KEY,
  status             TEXT   NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  available_balance  BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance   BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance  >= 0),
  forfeited_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE credit_reservations (
  reservation_id  UUID PRIMARY KEY,
  order_id        UUID   NOT NULL UNIQUE,
  requester_id    UUID   NOT NULL REFERENCES credit_accounts(user_id),
  amount          BIGINT NOT NULL CHECK (amount > 0),
  status          TEXT   NOT NULL CHECK (status IN ('HELD','CAPTURED','RELEASED')),
  courier_id      UUID,
  closed_by       TEXT CHECK (closed_by IN ('COMPLETED','CANCELLED','EXPIRED','FAILED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalised_at    TIMESTAMPTZ,
  CHECK ((status = 'HELD') = (finalised_at IS NULL)),
  CHECK ((status = 'HELD') = (closed_by IS NULL)),
  CHECK (status <> 'CAPTURED' OR (courier_id IS NOT NULL AND courier_id <> requester_id))
);

CREATE TABLE credit_transactions (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID   NOT NULL REFERENCES credit_accounts(user_id),
  type             TEXT   NOT NULL CHECK (type IN
                     ('INITIAL_GRANT','RESERVE','CAPTURE_DEBIT','CAPTURE_CREDIT','RELEASE','FORFEIT')),
  available_delta  BIGINT NOT NULL,
  reserved_delta   BIGINT NOT NULL,
  reservation_id   UUID REFERENCES credit_reservations(reservation_id),
  order_id         UUID,
  operation_id     UUID   NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operation_id, user_id)
);
CREATE INDEX credit_transactions_user_history_idx
  ON credit_transactions (user_id, created_at DESC, id DESC);

CREATE TABLE outbox (
  event_id      UUID PRIMARY KEY,
  event_type    TEXT  NOT NULL,
  topic         TEXT  NOT NULL,
  message_key   TEXT  NOT NULL,
  payload       JSONB NOT NULL,
  causation_id  UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;

-- Row access for the running service: only what its code needs.
-- credit_transactions is append-only (CS-F3.1.1): no UPDATE or DELETE.
GRANT SELECT, INSERT, UPDATE         ON credit_accounts     TO credit_app;
GRANT SELECT, INSERT, UPDATE         ON credit_reservations TO credit_app;
GRANT SELECT, INSERT                 ON credit_transactions TO credit_app;
GRANT USAGE ON SEQUENCE credit_transactions_id_seq          TO credit_app;
-- UPDATE marks rows published; DELETE removes them after the retention period
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox              TO credit_app;
