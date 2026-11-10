-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
-- Scope: Wrote the migration for Chat tables, constraints, indexes, and role grants.
-- Author review: I validated correctness and added boundary checks where needed.

CREATE SCHEMA chat_service;
REVOKE ALL ON SCHEMA chat_service FROM PUBLIC, anon, authenticated, service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chat_runtime') THEN
    CREATE ROLE chat_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

CREATE TABLE chat_service.conversations (
  id uuid PRIMARY KEY,
  user_low uuid NOT NULL,
  user_high uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  CHECK (user_low < user_high),
  UNIQUE (user_low, user_high)
);
CREATE TABLE chat_service.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES chat_service.conversations(id),
  user_id uuid NOT NULL,
  last_read_sequence bigint NOT NULL DEFAULT 0 CHECK (last_read_sequence >= 0),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX participant_lookup ON chat_service.conversation_participants(user_id, conversation_id);

-- Deferred enforcement allows transactional creation, but never a partial/third participant.
CREATE FUNCTION chat_service.check_participants() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid; pair chat_service.conversations; actual uuid[];
BEGIN
  IF TG_TABLE_NAME = 'conversations' THEN
    cid := COALESCE(NEW.id, OLD.id);
  ELSE
    cid := COALESCE(NEW.conversation_id, OLD.conversation_id);
  END IF;
  SELECT * INTO pair FROM chat_service.conversations WHERE id = cid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT array_agg(user_id ORDER BY user_id) INTO actual
    FROM chat_service.conversation_participants WHERE conversation_id = cid;
  IF actual IS DISTINCT FROM ARRAY[pair.user_low, pair.user_high] THEN
    RAISE EXCEPTION 'conversation requires canonical participants' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER conversation_pair_check
  AFTER INSERT OR UPDATE ON chat_service.conversations DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION chat_service.check_participants();
CREATE CONSTRAINT TRIGGER participant_pair_check
  AFTER INSERT OR UPDATE OR DELETE ON chat_service.conversation_participants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION chat_service.check_participants();

CREATE TABLE chat_service.messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 4096),
  client_message_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, sender_id)
    REFERENCES chat_service.conversation_participants(conversation_id, user_id),
  UNIQUE (conversation_id, sequence),
  UNIQUE (sender_id, client_message_id)
);
CREATE INDEX unread_lookup ON chat_service.messages(conversation_id, sender_id, sequence);
CREATE TABLE chat_service.blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE TABLE chat_service.outbox_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('chat.message.created.v1', 'chat.unread.updated.v1')),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  published_at timestamptz
);
CREATE INDEX pending_outbox ON chat_service.outbox_events(next_attempt_at, occurred_at)
  WHERE published_at IS NULL;
REVOKE ALL ON ALL TABLES IN SCHEMA chat_service FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA chat_service FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA chat_service TO chat_runtime;
GRANT SELECT, INSERT, UPDATE ON chat_service.conversations,
  chat_service.conversation_participants, chat_service.messages,
  chat_service.outbox_events TO chat_runtime;
GRANT SELECT, INSERT, DELETE ON chat_service.blocks TO chat_runtime;
GRANT EXECUTE ON FUNCTION chat_service.check_participants() TO chat_runtime;
