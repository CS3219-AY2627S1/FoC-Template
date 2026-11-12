<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-10
Scope: Implementation, testing, debugging, and documentation assistance for Chat Service.
-->

# Chat Service

The Chat Service provides one persistent conversation for each accepted errand.
It consumes Order Service lifecycle events, stores messages in PostgreSQL, and
uses WebSockets for live delivery. Kafka controls conversation lifecycle; chat
messages themselves are stored directly in the Chat database. Each newly stored
message also writes a `chat.message.created` transactional outbox event for the
Notification Service. Retried messages do not write another event.

## Lifecycle

- `errand.created` records the deadline used to enforce expiry.
- `errand.accepted` enables the requester/courier conversation.
- `errand.delivered` keeps chat writable while confirmation is pending.
- `errand.completed` starts a 30-minute follow-up window, after which the
  conversation becomes read-only.
- `errand.failed` and `errand.cancelled` make the conversation read-only
  immediately. `errand.expired` does the same and uses its `resultingStatus`
  (`EXPIRED` for an open errand or `FAILED` for an accepted errand).

The consumer is idempotent through the `processed_events` inbox and applies
monotonic state precedence because events on different Kafka topics can be
observed out of order.

## API

All REST endpoints except `/health` require the User Service bearer token.

- `GET /conversations/by-errand/{errand_id}`
- `GET /conversations/{id}/messages?after_sequence=10&limit=50`
- `GET /conversations/{id}/messages?before_sequence=50&limit=50`
- `GET /conversations/{id}/messages/{message_id}`
- `GET /conversations?limit=50` lists the caller's conversations with each latest message
- `POST /conversations/{id}/messages`
- `POST /conversations/{id}/ws-ticket`
- `WS /conversations/{id}/ws?ticket=<single-use-ticket>`

Send a message over REST with:

```json
{
  "client_message_id": "1bc6a7af-02f7-4c80-9935-d4e8d416bd7d",
  "content": "I am outside COM2."
}
```

The same body can be sent through the WebSocket with `"type": "send_message"`.
Retries must reuse `client_message_id`; the unique retry key returns the existing
message instead of inserting a duplicate.

Each conversation row holds `next_sequence`. Message creation locks that row,
allocates the current value, and increments it in the same transaction. This gives
every message a unique, gap-free sequence among successful transactions, including
when the requester and courier send concurrently.

The WebSocket ticket is random, stored only as a SHA-256 hash, valid for 30 seconds
by default, and consumed atomically on first use.

Completed conversations store `chat_closes_at = completed_at + 30 minutes`.
Message creation compares that timestamp with the current server time, so no
background timer is required to enforce closure. History remains readable after
the write window ends.

## Notification integration

Message insertion, sequence allocation, and the outbox row commit in one database
transaction. Debezium publishes the outbox row to `chat.message.created`. Its payload
identifies the other conversation participant as `recipientId`; it intentionally
contains no message text, so notification previews do not leak chat content.

Conversation creation follows Kafka asynchronously. The errand lookup returns
`202 {"status":"PENDING"}` while the accepted event has not been projected yet;
clients should retry with bounded exponential backoff. The pending response is also
used for unknown IDs so it does not disclose whether an errand exists.

## Run

From the repository root:

```powershell
docker compose up -d --build chat-service
```

The Compose entry applies Alembic migrations before starting the service and
enables the Kafka consumer. Direct local runs leave the consumer disabled unless
`KAFKA_CONSUMER_ENABLED=true` is set.

