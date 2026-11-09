# chat-service

<!-- AI-influenced: written with Claude (Opus 5.5); see ../ai/usage-log.md -->

A generic real-time chat service: direct and group conversations, ordered messages,
delivery/read receipts, typing indicators, edits, deletes, replies and system
messages, over WebSockets. It stores conversations, members and messages only. Users
belong to user-service, and the chat service never learns what an order is.

FoC uses it for **requester–courier chat** (an N2H feature). An optional adapter in
`app/integrations/order_events.py` consumes order lifecycle events and opens, updates
and closes one conversation per accepted order (see [below](#foc-integration-order-chats)).

```text
chat-service/
├── app/
│   ├── api/routes/        health, ws-ticket, client conversations, /internal service API
│   ├── realtime/          WebSocket endpoint, per-replica socket hub, RabbitMQ fan-out
│   ├── services/          business rules: chat domain, tickets, outbox relay, serialisation
│   ├── repositories/      all SQL: conversations, members, messages, outbox, tickets, inbox
│   ├── models/            SQLAlchemy tables, one module per table
│   ├── schemas/           HTTP bodies, WebSocket frames, message payloads
│   └── integrations/      FoC order-event adapter (optional, off by default)
├── docs/architecture.md   diagrams: ticket handshake, scaling, order-chat lifecycle
└── tests/                 pytest against PostgreSQL
```

## Running

With the rest of FoC: `make up` (the root `compose.yaml` starts `chat-service` and
`chat-db`). Through the gateway the service lives under `/api/chat/...`.

Local development:

```bash
make install                      # creates chat-service/.venv like the other services
cd chat-service
DATABASE_URL=postgresql+asyncpg://foc:foc@localhost:5432/chat_db \
  .venv/bin/uvicorn app.main:app --reload --port 8000

# tests (throwaway database; the suite drops and recreates the chat tables)
.venv/bin/pytest --postgres-url postgresql+asyncpg://foc:foc@localhost:5432/chat_test
```

## Authentication

| Caller | How |
| --- | --- |
| Browser, HTTP | Through the gateway: it verifies the JWT and injects `X-User-Id`. With `CHAT_AUTH_MODE=jwt` the service verifies `Authorization: Bearer <JWT>` itself. |
| Browser, WebSocket | One-time ticket. `POST /chat/ws-ticket` (authenticated as above) returns `{ticket, expires_at, expires_in}`; then open `/chat/ws?ticket=<ticket>` within `CHAT_WS_TICKET_TTL_S` (30 s). |
| Other backends | `X-Service-Key` on `/internal/*` (`CHAT_SERVICE_KEYS`, comma-separated for rotation). |

Why tickets: browsers cannot send an `Authorization` header on a WebSocket handshake,
and a JWT in a URL would be written to proxy and access logs and stay valid for an
hour. A ticket is random, stored only as a SHA-256 hash, valid for seconds and deleted
when redeemed, so a leaked one is useless. Tickets live in Postgres, so any replica can
redeem a ticket another replica issued. An invalid ticket is refused **before** the
upgrade (the browser sees HTTP 403), so no unauthenticated socket is ever opened.

Sockets are closed with `4002` after `CHAT_WS_MAX_SESSION_S` (1 h, the JWT lifetime).
The client then fetches a fresh ticket, which only works while the user's login is
still valid, and reconnects. A logout or an expired login therefore also ends live chat.

## Protocol

### WebSocket `/chat/ws?ticket=...`

The server sends `ready {user_id, connection_id, server_time}` first. Every frame is
`{type, req_id?, data}`; replies echo `req_id`.

| Client → server | `data` | Reply |
| --- | --- | --- |
| `send` | `conversation_id, client_msg_id, kind, body?, payload?, reply_to_id?` | `ack {message, duplicate}` |
| `edit` / `delete` | `message_id` (+ `body`) | `ack {message}` |
| `delivered` / `read` | `conversation_id, seq` | none (an `ack` only if `req_id` given) |
| `typing` | `conversation_id` | none |
| `ping` | none | `pong` |

Server → client events: `message.new`, `message.updated`, `receipt`, `typing`,
`conversation.added`, `conversation.updated`, `conversation.removed`, and
`error {code, message}`.

Close codes: `4002` session expired (get a new ticket and reconnect), `4008` rate
limited, `1013` client too slow, `1009` frame over 64 KiB, `1001` server shutting down. A rejected ticket never
gets a socket (HTTP 403 on the handshake).

Message kinds: `text` (body), `image` (`payload: {attachment_id}` of a photo uploaded
first, see [Photos](#photos); `body` is an optional caption), `file`
(`payload: {url, mime?, size?, name?}`; the file lives in object storage),
`location` (`payload: {lat, lng, label?}`), `system` (`payload: {key, params}`, sent by
services only; clients own the wording).

`client_msg_id` makes sends idempotent: a retry with the same id returns the stored
message (`duplicate: true`). Every message gets a per-conversation `seq`, so clients
detect gaps and catch up with `GET .../messages?after_seq=`.

### Client HTTP API

Paths as the service serves them; the gateway exposes them under `/api` (for example
`GET /api/chat/conversations`). FoC's gateway exposes only the routes marked ✓.

| Route | | FoC |
| --- | --- | --- |
| `POST /chat/ws-ticket` | One-time WebSocket ticket | ✓ |
| `GET /chat/conversations` | Inbox: conversations with members, `me` (read state, unread count) and `last_message` | ✓ |
| `GET /chat/conversations/{id}` | One conversation (members only) | ✓ |
| `GET /chat/conversations/{id}/messages?before_seq=&after_seq=&limit=` | History. `after_seq` = catch up, oldest first; otherwise the newest page or the page before `before_seq` | ✓ |
| `POST /chat/conversations/{id}/attachments` | Upload a photo (multipart `file`), returns `{attachment_id, content_type, size, width, height}` | ✓ |
| `GET /chat/conversations/{id}/attachments/{attachment_id}` | Photo bytes (members who can see it) | ✓ |
| `POST /chat/conversations/direct {user_id}` | Get or create the 1:1 chat | |
| `POST /chat/conversations/group {title, member_ids}` | Create a group | |
| `POST /chat/conversations/{id}/leave` | Leave a group | |

FoC keeps direct/group creation and leaving private: order chats are created by the
order-event adapter, and nobody should be able to message an arbitrary user id.

### Photos

Sending a photo takes two steps: upload it to the conversation, then send an `image`
message with the returned `attachment_id`.

* The upload is checked with `foc_shared.images`: JPEG, PNG or WebP, at most 5 MiB and
  20 megapixels. The pixels are re-encoded, so EXIF data (GPS position, camera) is
  dropped. Only members of an open conversation can upload.
* Photos are stored in the private bucket `CHAT_PHOTO_BUCKET` under
  `chat/{conversation_id}/`. The object key never leaves the service and there are no
  pre-signed URLs: every read goes through `GET .../attachments/{id}`, which checks
  access each time (`Cache-Control: private, no-store`).
* An unsent photo is visible only to its uploader and can be sent once, by them, in
  that conversation. A sent photo is visible to members whose history includes the
  message: a courier added later without history, a removed member or anyone after
  the message is deleted gets 404 or 403.
* Each user can hold `CHAT_PHOTO_MAX_UNSENT` unsent photos (429 beyond that). The purge
  loop deletes unsent photos after `CHAT_PHOTO_UNSENT_TTL_S`, photos of deleted
  messages, and photos of purged conversations. Objects are deleted before their row,
  so a storage outage only delays the clean-up.
* No bucket configured: uploads answer 503 and the rest of the chat works.

### Internal API (`X-Service-Key`, never exposed by the gateway)

| Route | |
| --- | --- |
| `POST /internal/conversations` | Get or create (`unique_key` makes it idempotent: 201 created / 200 existing) |
| `GET /internal/conversations?unique_key=&metadata={json}` | Look up; `metadata` uses `@>` containment |
| `GET /internal/conversations/{id}` | One conversation |
| `PATCH /internal/conversations/{id}` | `title`, `metadata` (replaced), `purge_after` |
| `POST /internal/conversations/{id}/members` | `{user_id, label?, include_history}` |
| `DELETE /internal/conversations/{id}/members/{user_id}` | Remove a member |
| `POST /internal/conversations/{id}/close` | Read-only from now on (idempotent) |
| `POST /internal/conversations/{id}/messages` | System message `{key, params}` |

### Events published (`foc.chat.events`, topic)

Written to the `outbox` table in the same transaction as the change and relayed to
RabbitMQ at least once (`message_id` = outbox id, so consumers can drop duplicates).
Routing keys: `conversation.created`, `conversation.updated`, `conversation.closed`,
`conversation.purged`, `member.added`, `member.removed`, `message.created`,
`message.updated`. Nothing in FoC consumes them yet; notification-service could
consume `message.created` to notify offline users.

## FoC integration: order chats

Enabled with `CHAT_ORDER_EVENTS_ENABLED=true` (set in `compose.yaml` and the Helm
chart). The adapter binds the durable queue `chat-service.order-events` to
`foc.order.events` and maps facts to generic operations on the conversation with
`unique_key = "order:<order_id>"` and `metadata = {"order_id": ...}`:

| Order event (publisher: order-service) | Effect |
| --- | --- |
| `OrderAccepted` | Create the chat with the requester (label `requester`) and courier (`courier`). After a withdrawal the new courier is added with `include_history: false`. System `order.accepted`. |
| `OrderPickedUp` | System `order.picked_up` (creates the chat if missing). |
| `OrderDelivered` | System `order.delivered` (creates the chat if missing). |
| `CourierWithdrawn` | System `order.courier_withdrawn`, then the courier is removed and loses access. |
| `OrderApproved` | System `order.completed`; chat closed (read-only); kept, or deleted after `CHAT_CLOSED_RETENTION_DAYS` if set. |
| `OrderCancelled` | System `order.cancelled {reason}`; closed (purge scheduled if retention is set). |
| `OrderExpired` | Closed if it exists (an expired order never had a courier). |

Other order events (`OrderDeletionRequested`, `OrderUpdateRequested`, the credit
saga replies, ...) are not bound. Every event id (`message_id` from the order-service
outbox) is stored in `processed_events` in the same transaction as its effects, so
redeliveries change nothing. The queue is single-active-consumer, so even with several
replicas the events are applied in publication order. Malformed events are dropped
(rejected without requeue); database failures are retried.

## Schema

| Table | Purpose |
| --- | --- |
| `conversations` | `kind` (direct/group), `unique_key`, `title`, `metadata` (JSONB + GIN index), `last_seq`, `closed_at`, `purge_after` |
| `conversation_members` | `label`, `history_from_seq`, `delivered_seq`, `read_seq`, `left_at` |
| `messages` | `seq` (unique per conversation), `client_msg_id` (unique per sender), `kind`, `body`, `payload` (JSONB), `reply_to_id`, `edited_at`, `deleted_at` |
| `outbox` | Domain events written with the change, relayed to RabbitMQ |
| `ws_tickets` | SHA-256 of live WebSocket tickets, `user_id`, `expires_at` |
| `processed_events` | Inbox of consumed order events (idempotency) |
| `attachments` | Photos: `object_key`, `content_type`, `size`, `width`, `height`, `uploader_id`, `message_id` (null until sent) |

User ids are plain UUIDs from user-service (no foreign key). Tables are created at
start-up (`metadata.create_all` under an advisory lock), like the other FoC services.

## Scaling

Any number of replicas can run behind the gateway. Each replica holds its own sockets;
a frame for a user is published to the `foc.chat.fanout` exchange and every replica
delivers it to the sockets it holds. Message order per conversation comes from a
row lock on the conversation (`last_seq`), not from the socket.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://foc:foc@chat-db:5432/chat_db` | |
| `RABBITMQ_URL` | unset | Unset = single replica; fan-out in-process, events logged |
| `ORDER_EVENTS_EXCHANGE` | `foc.order.events` | Shared with order-service |
| `CHAT_AUTH_MODE` | `gateway` | `jwt` = verify bearer tokens here (no gateway) |
| `JWT_SECRET` | dev placeholder | Only used with `CHAT_AUTH_MODE=jwt` |
| `CHAT_SERVICE_KEYS` | dev placeholder | Keys for `/internal/*` |
| `CHAT_WS_TICKET_TTL_S` | `30` | Ticket lifetime |
| `CHAT_WS_MAX_SESSION_S` | `3600` | Socket re-auth interval (`0` = never) |
| `CHAT_ORDER_EVENTS_ENABLED` | `false` | Run the order-event adapter |
| `CHAT_ORDER_EVENTS_QUEUE` | `chat-service.order-events` | |
| `CHAT_CLOSED_RETENTION_DAYS` | `0` | Delete closed order chats and their photos after this many days (`0` = keep) |
| `CHAT_FANOUT_EXCHANGE` / `CHAT_EVENTS_EXCHANGE` | `foc.chat.fanout` / `foc.chat.events` | |
| `CHAT_PHOTO_BUCKET` | unset | Private S3 bucket for photos; unset = photos off (503) |
| `CHAT_PHOTO_REGION` | `ap-southeast-1` | |
| `CHAT_PHOTO_UNSENT_TTL_S` | `3600` | Unsent photos are deleted after this |
| `CHAT_PHOTO_MAX_UNSENT` | `10` | Unsent photos one user may hold |
