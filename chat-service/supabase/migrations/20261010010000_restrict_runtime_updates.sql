-- AI Assistance Disclosure:
-- Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
-- Scope: Wrote the migration for restricting Chat runtime role update grants.
-- Author review: I validated correctness and added boundary checks where needed.

-- Runtime writes only the mutable counters/worker state it actually owns.
-- Accepted message content, identities, pair keys and outbox payloads are immutable to runtime.
REVOKE UPDATE ON chat_service.messages FROM chat_runtime;
REVOKE UPDATE ON chat_service.conversations FROM chat_runtime;
GRANT UPDATE (last_sequence) ON chat_service.conversations TO chat_runtime;
REVOKE UPDATE ON chat_service.conversation_participants FROM chat_runtime;
GRANT UPDATE (last_read_sequence) ON chat_service.conversation_participants TO chat_runtime;
REVOKE UPDATE ON chat_service.outbox_events FROM chat_runtime;
GRANT UPDATE (attempts, next_attempt_at, lease_token, lease_until, published_at)
  ON chat_service.outbox_events TO chat_runtime;
