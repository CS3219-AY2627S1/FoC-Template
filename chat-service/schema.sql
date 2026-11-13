-- AI-assisted (Claude), reviewed and tested by Maliha
-- Applied on startup. Everything is IF NOT EXISTS so re-running is safe.

-- One chat per errand, between its requester and courier
CREATE TABLE IF NOT EXISTS chats (
  order_id      uuid PRIMARY KEY,
  requester_id  text NOT NULL,
  courier_id    text NOT NULL,
  -- copied from order-service whenever someone uses the chat; drives cleanup
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id         bigserial PRIMARY KEY,
  order_id   uuid NOT NULL REFERENCES chats (order_id) ON DELETE CASCADE,
  sender_id  text NOT NULL,
  body       text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);

CREATE INDEX IF NOT EXISTS messages_order_idx ON messages (order_id, id);

-- Filtered messages, for admins to review. No foreign key on purpose:
-- flags stay after the chat itself is deleted.
CREATE TABLE IF NOT EXISTS flags (
  id             bigserial PRIMARY KEY,
  order_id       uuid NOT NULL,
  user_id        text NOT NULL,
  user_name      text NOT NULL,
  original_text  text NOT NULL,
  action         text NOT NULL CHECK (action IN ('masked', 'blocked')),
  flagged_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz,
  reviewed_by    text
);

CREATE INDEX IF NOT EXISTS flags_open_idx ON flags (flagged_at DESC) WHERE reviewed_at IS NULL;