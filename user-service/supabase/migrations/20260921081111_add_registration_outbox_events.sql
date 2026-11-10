-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
-- Scope: Wrote the migration for registration outbox tables and indexes.
-- Author review: I validated correctness and added boundary checks where needed.

-- Phase 6 stores a minimal registration event in the same transaction as the
-- verified identity. The event record has no credentials or profile fields;
-- the publisher derives exactly the four public contract fields from it.

BEGIN;

CREATE TYPE user_service.outbox_event_state AS ENUM ('PENDING', 'PUBLISHED');

CREATE TABLE user_service.outbox_events (
    event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type varchar(64) NOT NULL,
    aggregate_id uuid NOT NULL REFERENCES user_service.users (id) ON DELETE RESTRICT,
    occurred_at timestamptz NOT NULL,
    state user_service.outbox_event_state NOT NULL DEFAULT 'PENDING',
    publish_attempts integer NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at timestamptz,
    last_error_code varchar(128),
    lease_token uuid,
    lease_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT outbox_events_registration_event_only CHECK (
        event_type = 'user.registered.v1'
    ),
    CONSTRAINT outbox_events_publication_state_valid CHECK (
        (state = 'PENDING' AND published_at IS NULL)
        OR (state = 'PUBLISHED' AND published_at IS NOT NULL)
    ),
    CONSTRAINT outbox_events_lease_pair_valid CHECK (
        (lease_token IS NULL) = (lease_expires_at IS NULL)
    )
);

CREATE INDEX outbox_events_delivery_idx
ON user_service.outbox_events (next_attempt_at, occurred_at)
WHERE state = 'PENDING';

CREATE TRIGGER outbox_events_set_updated_at
BEFORE UPDATE ON user_service.outbox_events
FOR EACH ROW
EXECUTE FUNCTION user_service.set_updated_at();

REVOKE ALL PRIVILEGES ON TABLE user_service.outbox_events FROM user_service_app;
GRANT SELECT, INSERT, UPDATE ON TABLE user_service.outbox_events TO user_service_app;

COMMIT;
