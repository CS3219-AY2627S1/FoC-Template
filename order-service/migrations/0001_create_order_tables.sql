-- AI Assistance Disclosure:
-- Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
-- Scope: Order Service schema: errands, errand_history (append-only) and outbox, per the plan.
-- Author review: Reviewed and approved by @mattis.

CREATE TYPE errand_state AS ENUM (
  'PENDING_RESERVATION','RESERVATION_REJECTED','RESERVATION_TIMED_OUT','OPEN','ACCEPTED','PICKED_UP',
  'DELIVERED','DISPUTED','COMPLETED','CANCELLED','EXPIRED','FAILED');

CREATE TABLE errands (
  id                             UUID PRIMARY KEY,
  requester_id                   UUID NOT NULL,
  courier_id                     UUID,
  supplier_id                    UUID NOT NULL,
  supplier_name                  TEXT NOT NULL,
  supplier_building_code         TEXT NOT NULL,
  supplier_location_description  TEXT NOT NULL,
  items                          JSONB NOT NULL,
  dropoff_location               TEXT NOT NULL,
  notes                          TEXT,
  credit_amount                  INTEGER NOT NULL CHECK (credit_amount BETWEEN 1 AND 1000),
  state                          errand_state NOT NULL DEFAULT 'PENDING_RESERVATION',
  reservation_operation_id       UUID NOT NULL UNIQUE,
  rejection_reason               TEXT,
  reservation_deadline           TIMESTAMPTZ NOT NULL,
  listing_deadline               TIMESTAMPTZ NOT NULL,
  pickup_deadline                TIMESTAMPTZ NOT NULL,
  delivery_deadline              TIMESTAMPTZ NOT NULL,
  confirm_deadline               TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at                    TIMESTAMPTZ,
  picked_up_at                   TIMESTAMPTZ,
  delivered_at                   TIMESTAMPTZ,
  closed_at                      TIMESTAMPTZ,
  CHECK (listing_deadline <= pickup_deadline AND pickup_deadline <= delivery_deadline),
  CHECK (courier_id IS NULL OR courier_id <> requester_id),
  CHECK ((state IN ('ACCEPTED','PICKED_UP','DELIVERED')) <= (courier_id IS NOT NULL)),
  CHECK ((state IN ('PENDING_RESERVATION','OPEN')) <= (courier_id IS NULL))
);
CREATE INDEX errands_open_idx      ON errands (listing_deadline) WHERE state = 'OPEN';
CREATE INDEX errands_requester_idx ON errands (requester_id, created_at DESC);
CREATE INDEX errands_courier_idx   ON errands (courier_id, created_at DESC) WHERE courier_id IS NOT NULL;
CREATE INDEX errands_state_idx     ON errands (state, created_at DESC);
CREATE INDEX errands_pending_idx   ON errands (reservation_deadline) WHERE state = 'PENDING_RESERVATION';

-- Append-only lifecycle record: shown on the errand detail and to admins in disputes
CREATE TABLE errand_history (
  id          BIGSERIAL PRIMARY KEY,
  errand_id   UUID NOT NULL REFERENCES errands(id),
  from_state  errand_state,
  to_state    errand_state NOT NULL,
  action      TEXT NOT NULL,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('USER','SYSTEM','CREDIT')),
  actor_id    UUID,
  reason      TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX errand_history_errand_idx ON errand_history (errand_id, id);

CREATE TABLE outbox (
  event_id      UUID PRIMARY KEY,
  event_type    TEXT NOT NULL,
  topic         TEXT NOT NULL,
  message_key   TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON errands TO order_app;
GRANT SELECT, INSERT ON errand_history TO order_app;
GRANT USAGE ON SEQUENCE errand_history_id_seq TO order_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox TO order_app;
