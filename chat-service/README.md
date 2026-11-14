<!-- Scope (2026-11-10, Codex, model: GPT-6): Resolved merge conflicts in disclosure history.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: tng wen xi
Scope (2026-11-10, Codex, model: GPT-6): Removed image/video message types as instructed by the user.
Author review: tng wen xi

Scope (2026-11-10, Codex, model: GPT-6): Removed the conversation-ID participant endpoint per user instruction.
Author review: tng wen xi
-->
<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-11-07
Scope: Documented the implemented creation endpoint and local setup.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Author review: tng wen xi
Tool: Codex (model: GPT-6), date: 2026-11-07
Scope: Added Docker and Compose setup instructions.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: tng wen xi
Tool: Codex (model: GPT-6), date: 2026-11-08
Scope: Documented the team-specified listing contract and verification.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented host access to Compose MySQL for Studio.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented the requested table renames.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented conversation details implementation and disclosure.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented the team-specified message listing endpoint.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented the team-specified send endpoint and realtime implementation.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented the team-specified read receipt endpoint.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented the team-specified participant addition endpoint.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented the supplied participant limits.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented the confirmed system notification endpoint.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented the supplied order/chat delivery contract and disclosure index.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented team-specified order participant endpoint and courier delivery.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented team-specified socket path and room events.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Linked the system notification caller guide.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented team-specified message-history participant read positions.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: tng wen xi
Scope (2026-11-09, Codex, model: GPT-6): Documented the team-specified system conversations.
Author review: tng wen xi
Scope (2026-11-09, Codex, model: GPT-6): Documented the approved health endpoint.
Author review: tng wen xi
Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Documented the team-specified message translation.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
Scope (2026-11-10, Codex, model: GPT-6): Documented the team-specified order chat archive contract.
Author review: tng wen xi
Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: tng wen xi
-->

# Chat service

Conversation creation and authenticated conversation listing. Express 5, TypeScript ESM, Prisma 7 and MySQL through `@prisma/adapter-mariadb`. File structure follows order-service.

## Run locally

Run a MySQL database, create the chat database, and configure `.env` using `.env.example`. Use a UTC database session/server timezone for direct SQL inserts; the endpoint explicitly supplies UTC creation timestamps with millisecond precision.

```sh
npm ci
npm run db:generate
npm run db:deploy
npm run dev
```

`DATABASE_URL` supplies the MySQL host, port, user, password and database. `CHAT_SERVICE_API_KEY` is required and must match the order worker's configured secret. Never commit real credentials.

## GET /health

<!-- AI-generated -->

Matches order-service's health endpoint. No authentication is required. Runs `SELECT 1`
against the chat database; returns `200` with `{"status":"ok","database":"up"}`
on success, or `503` with `{"status":"error","database":"down"}` on query failure.

## POST /chat/conversations

Requires `X-Service-Name: order-service` and `X-Service-Key`. No student bearer token is needed or stored.

```json
{
  "orderId": "0192f0c4-0000-7000-8000-000000000001",
  "requesterId": "0192f0c4-0000-7000-8000-00000000000a",
  "orderDescription": "Coffee from Deck"
}
```

Creates an ACTIVE conversation and REQUESTER participant atomically. The initial title is the description; the request has no status field. Participant read position and revokedAt start null. No messages are created yet.

```json
{
  "success": true,
  "data": {
    "conversationId": "0192f0c4-0000-7000-8000-000000000002",
    "orderId": "0192f0c4-0000-7000-8000-000000000001",
    "title": "Coffee from Deck",
    "status": "ACTIVE",
    "createdAt": "2026-11-07T00:00:00.000Z"
  }
}
```

- 201: created.
- 200: same order, requester and description already exist; returns the existing record.
- 400 VALIDATION_ERROR: missing fields, invalid UUIDs or whitespace-only/empty description, with field-level details.
- 401 UNAUTHORIZED: missing/invalid service key.
- 403 FORBIDDEN: valid configured key but service name is not order-service.
- 409 ORDER_ID_CONFLICT: same order ID with different requester or description.

Unique orderId also handles concurrent duplicate creation. Duplicate comparison uses the stored title and requester; later title-editing work must revisit this if titles become mutable. Message sending and sockets are described below; order-worker delivery is described in `../order-service/README.md`.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

HTTP tests use injected Prisma doubles; no live database is required for them. The Docker setup stage applied the checked-in migration against a temporary MySQL 8 container and verified production/development startup, creation, duplicate/conflict handling and authentication.

## Docker

Set `CHAT_DB_PASSWORD` and `CHAT_SERVICE_API_KEY` in the repository-root `.env` using `.env.example`. Use a URL-encoded database password in DATABASE_URL if it contains URL-reserved characters. The chat API is available on host port 3005 (`CHAT_SERVICE_PORT` overrides it); containers reach it at `http://chat-service:3000`. MySQL data persists in `chat-db-data` and the database runs in UTC.

```sh
docker compose up --build chat-service
```

Development with Compose Watch:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up --build --watch chat-service
```

Both image targets apply pending migrations before starting. The development target also regenerates Prisma before startup. The production image runs as the node user. Order-worker integration is described in `../order-service/README.md`.

## GET /chat/conversations

Team-specified contract supplied in the 2026-11-08 implementation conversation:

- Authenticate the Bearer token using the same RS256 User Service JWKS validation as order-service. The verified token subject supplies the user ID.
- `limit`: integer 1–50, default 20.
- `cursor`: standard base64 encoding of UTF-8 JSON `{ "updatedAt": "<ISO timestamp>", "id": "<conversation UUID>" }`. URL-encode the base64 value when constructing a query string.
- Optional `status=active|archived` and `role=courier|requester`. Role filters the user's chat participation, independently of their token role.
- Without filters, return every conversation the user participates in, including revoked memberships. Revocation does not hide conversation history.
- Order by `updatedAt DESC, conversationId DESC`, with an exclusive cursor boundary on those fields.
- Return the object below directly, without the creation endpoint's `success/data` wrapper. `nextCursor` is an object to encode for the next request, or null on the final page.
- Latest message and read-position ordering use `created_at`, then message `id`, both descending for latest-message selection. SYSTEM messages can be the latest message; content may be null. Empty conversations have `lastMessage: null`.
- Unread counts exclude the user's own messages, include system messages, and count messages strictly after the stored read position. A null `lastReadMessageId` means all eligible messages are unread.
- 401 `{ "message": "Unauthorized", "code": "UNAUTHORIZED" }` for absent/invalid authentication.
- 400 `{ "message": "Invalid conversation query parameters", "code": "VALIDATION_ERROR" }` for invalid query parameters.

```json
{
  "conversations": [
    {
      "id": "0192f0c4-0000-7000-8000-000000000002",
      "orderId": "0192f0c4-0000-7000-8000-000000000001",
      "lastMessage": {
        "content": null,
        "type": "SYSTEM",
        "createdAt": "2026-11-08T00:00:00.000Z"
      },
      "unreadCount": 1,
      "updatedAt": "2026-11-08T00:00:00.000Z"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

The supplied `messages` table has UUID `id`, `chat_id` referencing conversations, nullable UUID `sender_id` (null for system), type TEXT/SYSTEM, nullable text `content`, nullable UUID `triggered_by_user_id` (the user who triggered an order action), and `created_at`. Apply its checked-in migration with `npm run db:deploy` before using the endpoint.

`USER_SERVICE_URL` selects the JWKS host (default `http://user-service:3001` for Compose); set it to `http://localhost:3001` for local host execution. No additional package is required: the verifier is copied from order-service with its existing attribution preserved.

Listing verification: 46 tests passed across listing, authentication and creation; typecheck, build and Prisma schema validation passed. Tests use injected Prisma doubles and stubbed JWKS responses with generated test RSA keys. The new migration and listing queries have not been exercised against live MySQL or a live User Service in this task.

## Prisma Studio with Docker Compose

The Compose `chat-db` service publishes MySQL at `127.0.0.1:3306` for Studio running on the host. Recreate the database container after changing the port mapping (the named database volume is retained):

```sh
docker compose up -d --no-deps chat-db
```

In `chat-service/.env`, set `DATABASE_URL` to `mysql://root:<URL-encoded CHAT_DB_PASSWORD>@127.0.0.1:3306/chat_service`, using the database password configured in the repository-root `.env`. The Compose service creates a root account; the `chat:password` placeholder in the local example is not that account. Existing database volumes retain their original password.

```sh
cd chat-service
npx prisma studio
```

The database tables are `conversations` and `conversation_participants`. The rename migration preserves existing rows and foreign-key references. Prisma model names and existing column names remain unchanged.

## GET /chat/conversations/:conversationID

Team-specified contract supplied in the 2026-11-08 implementation conversation:

- Reuse Bearer authentication from listing; unauthenticated requests return 401.
- Require a UUID conversation ID; malformed IDs return 400.
- Missing conversations return 404; existing conversations requested by a non-participant return 403.
- Participants can access details even after their membership is revoked.
- Return the following object directly. Participants expose only userId, role and joinedAt; dates are ISO timestamps. Titles and status are returned as stored.

```json
{
  "conversationId": "0192f0c4-0000-7000-8000-000000000001",
  "orderId": "0192f0c4-0000-7000-8000-000000000002",
  "status": "ACTIVE",
  "title": "Alice · Coffee from Deck",
  "participants": [
    {
      "userId": "0192f0c4-0000-7000-8000-00000000000a",
      "role": "REQUESTER",
      "joinedAt": "2026-11-06T10:00:00.000Z"
    }
  ],
  "createdAt": "2026-11-06T10:00:00.000Z",
  "updatedAt": "2026-11-06T10:15:00.000Z"
}
```

Verification: all 56 tests passed, including 10 details tests; typecheck and build passed. HTTP tests use injected Prisma doubles and the existing token-verifier injection. No live database or User Service was exercised.

## GET /chat/conversations/:conversationID/messages

Team-specified contract supplied in the 2026-11-08 implementation conversation:

- Bearer authentication and UUID validation; 401 unauthenticated, 400 invalid ID/query, 404 missing conversation, 403 non-participant. Revoked participants retain access.
- `limit`: integer 1–50, default 20. `cursor`: standard base64 UTF-8 JSON `{ "createdAt": "<ISO timestamp>", "id": "<message UUID>" }`; URL-encode it in query strings.
- Order by `createdAt DESC, id DESC`, with an exclusive cursor boundary.
- Pagination follows conversation listing: `nextCursor` is an object to encode for the next request, or null on the final page. It uses the last returned message. `hasMore` indicates additional older messages.
- Team update (2026-11-08): Every message-history page also returns `participants`, with `userId`, `role`, ISO `joinedAt`, and nullable `lastReadMessageId` for each participant. Null preserves the existing stored value when no read position exists. No schema change.
- Each message exposes messageId, conversationId, senderId, type, content, triggeredByUserId and createdAt. Nullable values are preserved.

```json
{
  "participants": [
    {
      "userId": "0192f0c4-0000-7000-8000-00000000000a",
      "role": "REQUESTER",
      "joinedAt": "2026-11-08T00:00:00.000Z",
      "lastReadMessageId": null
    }
  ],
  "data": [],
  "pagination": { "nextCursor": null, "hasMore": false }
}
```

Verification: 68 tests passed, including 12 message endpoint tests; typecheck and build passed. HTTP tests use Prisma doubles and injected authentication; no live MySQL or User Service was exercised.

## POST /chat/conversations/:conversationID/messages

Team decisions supplied in the 2026-11-08 implementation conversation:

- Body: `{ "type": "TEXT", "content": "Hello" }`. Only TEXT is currently supported; missing/invalid fields, empty strings, whitespace-only strings and unsupported types return 400. Valid content is stored unchanged. User attempts to send type SYSTEM return 422.
- Bearer authentication uses the verified subject as senderId. Body sender fields are ignored.
- Alternatively, `X-Service-Key` must match CHAT_SERVICE_API_KEY. Any service name (or no service-name header) is allowed on this endpoint. These messages use type TEXT and senderId null. A supplied service key is checked before Bearer authentication; an incorrect key returns 401.
- Missing conversation: 404. Non-participant user: 403. Archived conversation or revoked user: 409. Service-key senders bypass membership/revocation checks but still require an existing ACTIVE conversation.
- The message insert and conversation updatedAt write use one Prisma transaction and the same timestamp. No schema changes.
- Return 201 with one message object directly: messageId, conversationId, senderId, type, content, triggeredByUserId and createdAt, matching the GET messages item shape.
- After commit, broadcast `message:sent` with that same object to the union of `chat:<conversationId>` and non-revoked participants' `user:<userId>` rooms. A socket in multiple target rooms receives one event. Broadcast errors are logged; the persisted message still returns 201.

### Socket.IO

Connection and authentication follow order-service: same HTTP server as REST, `/chat-socket.io` path, WebSocket transport only, JWT in `auth.token`, existing JWKS verifier, `connect_error` with message `unauthorized` on failure, disconnect at token expiry. Authenticated sockets automatically join `user:<verifiedUserId>` and then receive `ready`.

Conversation rooms are joined on demand. Emit `chat:join` or `chat:leave` with the conversation UUID string as the sole data argument and an acknowledgement callback. Both acknowledge `{ "success": true, "conversationId": "<id>" }`, or `{ "success": false, "error": { "code": <HTTP status number>, "message": "<existing HTTP status message>" } }`. Codes/messages follow existing REST statuses: 400 Bad Request, 404 Not Found, 403 Forbidden, 409 Conflict for revoked participants, and 500 "Internal server error." Joining verifies a non-revoked participant before adding `chat:<conversationId>`. Leaving removes only that socket's subscription and permits cleanup after revocation. Join/leave operations execute in received order. User rooms are joined automatically before `ready`; conversation rooms are not automatically joined.

The Redis adapter follows order-service's publisher/subscriber setup. Configure REDIS_HOST, REDIS_PORT (default 6379) and REDIS_TLS (`true`/`false`, default false). Local execution defaults to localhost. Compose connects chat to the existing order-redis service. The adapter uses the `chat-socket.io` Redis key prefix. No worker pub/sub relay is needed for this REST endpoint.

Verification: 95 tests passed, including message validation/access, service-key sends, post-commit broadcasting, real local WebSocket authentication, user rooms, union delivery and expiry. Typecheck and build passed. HTTP persistence tests use injected Prisma doubles; no live MySQL, JWKS server or Redis cross-replica delivery was exercised.

## POST /chat/conversations/:conversationID/read

Team decisions supplied in the 2026-11-08 implementation conversation:

- Bearer authentication supplies the reader identity. Body: `{ "lastReadMessageId": "<message UUID>" }`.
- Require UUID conversation/message IDs (400 for invalid input); 401 unauthenticated, 404 missing conversation, 403 non-participant, 409 revoked participant, 404 missing message, 400 message belonging to another conversation.
- Advance the participant's existing lastReadMessageId using the established `createdAt`, then `id` ordering. Older or identical positions return 200 with the retained position. Concurrent writes retry against the latest stored position.
- Return `{ "conversationId": "<UUID>", "userId": "<authenticated UUID>", "lastReadMessageId": "<retained UUID>" }` directly. No readAt field or schema change.
- After persistence, emit **`messsage:read`** (three s characters, as specified) with that same object to `chat:<conversationId>`, excluding the reader's `user:<userId>` room. Emit even when the position stays unchanged. Socket broadcast failures are logged and do not change the successful HTTP response.
- This targets other sockets already in the chat room. Clients join conversation rooms with `chat:join` as documented above; automatically joined user rooms alone do not receive this event.

Verification: all 109 tests passed, including 13 read endpoint cases and a real local WebSocket receipt-delivery check. Typecheck and build passed. HTTP tests use Prisma doubles; live MySQL concurrency and Redis cross-replica delivery were not exercised.

## POST /chat/orders/:orderId/participants

Team decisions supplied in the 2026-11-08 implementation conversation:

- Require `X-Service-Key` matching CHAT_SERVICE_API_KEY; no `X-Service-Name` is required. Reuse message authentication: a supplied key takes precedence; invalid/missing credentials return 401, and a valid Bearer-only user returns 403.
- Body: `{ "userId": "<User Service UUID>", "role": "COURIER" }`. Both COURIER and REQUESTER are allowed. Invalid order/user UUIDs or roles return 400. The caller supplies the user ID; this endpoint does not call User Service.
- The order ID resolves to a conversation inside the membership transaction. An order without a conversation returns 404. Archived conversation or any existing membership for that user, including revoked membership, returns 409. Existing memberships are not changed.
- Return 200 with the object below directly. Insert the participant using existing schema defaults. The transaction locks the active conversation before checking membership and inserting; no schema changes or realtime event were added.

```json
{
  "conversationParticipantId": "0192f0c4-0000-7000-8000-000000000003",
  "conversationId": "0192f0c4-0000-7000-8000-000000000001",
  "userId": "0192f0c4-0000-7000-8000-00000000000a",
  "joinedAt": "2026-11-08T00:00:00.000Z",
  "role": "COURIER"
}
```

Verification: 126 tests passed, including 17 participant cases; typecheck and build passed. HTTP tests use injected Prisma doubles. Live MySQL transaction/concurrency behavior was not exercised.

Participant limits: each conversation permits at most one REQUESTER (including revoked requester memberships) and one non-revoked COURIER. Adding another participant of an occupied role returns 409. A revoked courier does not block a different courier; the existing same-user conflict still applies. These checks run inside the existing conversation-locked transaction; existing rows are not modified.

## POST /chat/send-system-notification

<!-- AI-generated -->

See the [microservice caller guide](SYSTEM-NOTIFICATIONS.md) for request examples, authentication, response codes and duplicate handling.

Team decisions supplied and confirmed in the 2026-11-08 implementation conversation:

- Body: `{ "orderId": "<UUID>", "messageId": "<UUID>", "message": "Order ready" }`. Invalid UUIDs, missing fields, non-string messages, empty or whitespace-only messages return 400. Valid text is stored unchanged.
- Same service-key authentication as participant addition: valid X-Service-Key, no service-name restriction, supplied-key precedence, 401 missing/invalid credentials and 403 valid Bearer-only users.
- Look up the conversation by orderId; return 404 if missing and 409 if archived.
- Reuse normal sending to insert a SYSTEM message with senderId null, text in content and optional triggeredByUserId, updating conversation updatedAt in the same transaction.
- Return 201 with the normal message object. After commit, reuse `message:sent` delivery to the union of chat and active participant user rooms. Broadcast failures are logged while retaining the successful response.

Verification: all 151 tests passed, including 19 system-notification cases; typecheck and build passed. HTTP persistence tests use injected Prisma doubles; live MySQL and Redis cross-replica delivery were not exercised.

<!-- AI-generated -->

### System notification retries

The sender supplies a UUID `messageId`, generated once when creating the delivery
job and stored as the existing message primary key. An identical retry (same ID,
order ID and text) returns HTTP 200 with the existing message, without another
insert, conversation timestamp update or broadcast. A reused ID with different
order ID or text returns 409; IDs belonging to non-system messages also conflict.
New messages return 201. The primary key also handles concurrent duplicate inserts;
the losing transaction rolls back and reads the committed message. Missing or
malformed `messageId` returns 400. No schema migration is needed.

### Frontend realtime integration

The authenticated frontend opens a separate Chat Service connection on
`/chat-socket.io`, proxied through Vite/nginx. Opening a chat joins its conversation
room; closing it leaves the room. On reconnect, open rooms are rejoined and HTTP
history/list data is refreshed. `message:sent` updates the open thread and reloads
the role-filtered chat list. Messages are merged by messageId to avoid duplicate
HTTP/socket delivery. No automatic read request or read-receipt display was added.

Verification: Chat Service tests use real local WebSocket connections with injected
membership/JWT verification. Frontend tests mock the socket transport. Live JWKS,
Redis cross-instance delivery and authenticated browser end-to-end delivery were
not exercised.

## POST /chat/conversations/:conversationID/translation

<!-- AI-generated (Claude Code, model: claude-sonnet-5-5, 2026-11-09). Author review: -->

Team decisions supplied in the 2026-11-09 implementation conversation:

- Bearer authentication. Body: `{ "enabled": false }` or `{ "enabled": true, "language": "<code>" }`, where `language` is one of `en`, `zh`, `hi`, `ta`, `ms`, `es`, `ar` (ISO 639-1; the user's `preferred_lang` from User Service, sent by the client). Invalid input returns 400; 401 unauthenticated, 404 missing conversation, 403 non-participant, 409 revoked participant.
- Stores the language in `conversation_participants.translate_to` (null = off). Returns `{ "conversationId": "<UUID>", "userId": "<UUID>", "translateTo": "es" | null }`.
- Turning on queues a BullMQ job that translates every received, untranslated message for that user. Turning off only clears `translate_to`; stored translations are kept and queued jobs for that user exit without calling the model. Choosing a different language while on deletes that user's stored translations for the chat before the backfill.
- Queue: BullMQ on the shared Redis, prefix `queue:chat`, name `translation`, 5 attempts with exponential backoff (order-service's defaults). The worker runs inside the chat-service process so it can emit socket events.
- After a message commits, one job per active participant other than the sender whose `translate_to` is non-null is queued (user messages and system notifications). A failed enqueue is logged; the send still succeeds.
- The job calls Gemini (`@google/genai`, model `TRANSLATION_LLM_MODEL`, default `gemini-3.1-flash-lite`, key `TRANSLATION_LLM_KEY`) with a JSON object of `{ messageId: text }` and expects the same keys back, with the string `SAME` for text already in the target language. One row per message is stored in `translated_messages(id, message_id, user_id, content, created_at)`, unique on `(message_id, user_id)`; `SAME` is stored as the content. Messages the model omits stay untranslated and are picked up by the next job.
- `GET /chat/conversations/:conversationID/messages` also adds `translateTo` (nullable language code) to each `participants` entry so the client can show the saved Auto-translate state (team decision, 2026-11-09), and adds `translatedContent` to each message: the requester's own translation, `SAME`, or `null`. The send response and `message:sent` payload are unchanged.
- Completion signal: `message:translated` with `{ "messageId", "conversationId", "translatedContent" }` emitted to the target user's `user:<userId>` room only.
- Future enhancement (not built): a remove/replace-courier route that clears the outgoing courier's translations.

Verification: 192 chat-service tests passed (translation toggle, enqueue on send, job processor, history field); typecheck and build passed. Not exercised: live Redis/BullMQ, live Gemini, live MySQL migration, and the frontend.

## System conversations

Team decisions supplied in the 2026-11-09 implementation conversation:

- Orderless notifications explicitly send `{ "orderId": null, "recipient": "<user UUID>", "messageId": "<caller UUID>", "message": "Schedule failed" }`. The recipient is required for orderless requests. Omitted orderId is invalid. Authentication remains X-Service-Key.
- The service lazily creates an ACTIVE conversation titled `FoC`, with null orderId and one recipient participant whose role is null. No SYSTEM user or order is created.
- `system_chats` maps the UUID user_id primary key to a unique UUID conversation_id foreign key, cascading updates/deletes. Conversation and mapping creation share a transaction. A concurrent loser rolls back and reads the winning mapping.
- Messages retain their existing conversation foreign key. A separate transaction persists each message and updates the conversation timestamp. An empty system conversation can remain if message persistence fails; a retry reuses it.
- Caller-generated message IDs remain globally unique. Identical retries return 200 without broadcasting; mismatched content, order or system recipient returns 409. New messages return 201.
- Explicit UUID order IDs continue to use order conversations; missing conversations return 404 and malformed IDs return 400 without fallback.
- Existing list/details/history/read endpoints work with system conversations. Role-filtered lists also include the user's system conversation. Nullable orderId and participant role are returned unchanged.
- Users cannot send to system conversations (403). Normal creation still requires an order ID and order-service credentials. Socket room membership still checks authenticated participation; SYSTEM cannot authenticate as a user.
- After message commit, existing `message:sent` broadcasts notify the recipient user room and conversation room, including for the first notification. No new socket event or payload is introduced. The frontend disables its composer for null-order conversations.

Apply the migration before starting the updated service:

```sh
cd chat-service
npm run db:generate
npm run db:deploy
```

## POST /chat/orders/:id/archive

Team-specified contract (2026-11-10): `id` is the order UUID; no request body.
Accepts the existing `X-Service-Key` authentication or a user Bearer token.
Authenticated users must be participants; nonparticipants receive 403. Existing
authentication failures return 401. Malformed UUIDs return 400; an order without
a conversation returns 404. Sets the conversation status to `ARCHIVED` and
returns 200, including when already archived.

Order-service notifications may supply optional UUID `triggeredByUserId`. It is persisted and returned as a nullable top-level message field in history, HTTP responses and `message:sent` events. It does not remove recipients or chat messages; the frontend suppresses the triggering user’s toast. The migration `20261110000000_message_triggered_by_user` drops the old message metadata column and adds this field.
