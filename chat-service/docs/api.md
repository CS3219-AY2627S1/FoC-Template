<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-11-10
Scope: Documented existing chat-service implementation, interfaces and integrations.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: tng wen xi
Scope (2026-11-10, Codex, model: GPT-6): Improved readability, expanded schema fields and values, and documented verified endpoint usage.
Author review: tng wen xi
Scope (2026-11-10, Codex, model: GPT-6): Added endpoint discussion records and final agreed behavior from repository history.
Author review: tng wen xi
Scope (2026-11-10, Codex, model: GPT-6): Integrated implemented behavior into endpoint documentation and removed discussion history.
Author review: tng wen xi
Scope (2026-11-10, Codex, model: GPT-6): Removed image/video message types as instructed by the user.
Author review: tng wen xi

Scope (2026-11-10, Codex, model: GPT-6): Removed the conversation-ID participant endpoint per user instruction.
Author review: tng wen xi
-->

# Chat service API reference

Use this reference to see what each endpoint does, where it is called, and what to send or expect.

- Base URL in local Compose: `http://localhost:3005`.
- JSON requests: `Content-Type: application/json`.
- Snapshot date: 2026-11-10.

Implementation sources: [router mounts](../src/app.ts), [routes](../src/routes/conversations.routes.ts), [validation/controllers](../src/controllers/conversations.controller.ts), [operations](../src/services/conversations.service.ts). See [architecture and integrations](architecture.md).

## All HTTP endpoints

| Method | Path | Authentication | Success |
| --- | --- | --- | --- |
| GET | `/health` | None | 200 |
| POST | `/chat/conversations` | Order service key + name | 201 / 200 |
| GET | `/chat/conversations` | Bearer | 200 |
| GET | `/chat/conversations/:conversationID` | Bearer | 200 |
| GET | `/chat/conversations/:conversationID/messages` | Bearer | 200 |
| POST | `/chat/conversations/:conversationID/messages` | Bearer or service key | 201 |
| POST | `/chat/conversations/:conversationID/read` | Bearer | 200 |
| POST | `/chat/conversations/:conversationID/translation` | Bearer | 200 |
| POST | `/chat/orders/:orderId/participants` | Service key | 200 |
| POST | `/chat/send-system-notification` | Service key | 201 / 200 |
| POST | `/chat/orders/:orderId/archive` | Bearer or service key | 200 |

## Authentication, validation and response conventions

- **Bearer:** `Authorization: Bearer <access-token>`. RS256 signature and nonempty `sub`/unexpired numeric `exp` are checked against User Service JWKS. Reserved subject `SYSTEM` is rejected. Missing/invalid credentials and verifier failures produce 401 `{"message":"Unauthorized","code":"UNAUTHORIZED"}`.
- **Service key:** `X-Service-Key: <configured shared key>`. Except creation, a supplied key takes precedence over Bearer: an invalid key returns the same 401 JSON even when a valid Bearer token is supplied. `X-Service-Name` is not checked on these endpoints. On service-only endpoints, a valid Bearer token without the key produces plain-text 403.
- **Creation:** requires both the correct key and exactly `X-Service-Name: order-service`. Its errors use the separate envelope documented below.
- IDs described as UUIDs are validated with Zod `z.uuid()`. Body objects strip unknown fields; list/history query objects reject unknown query keys. Strings checked for nonblank content are stored unchanged; no explicit maximum length is imposed by those validators.
- Most domain/validation failures use `sendStatus`: plain-text `Bad Request` (400), `Forbidden` (403), `Not Found` (404), `Conflict` (409), or `Unprocessable Entity` (422). These do **not** include a JSON machine code. Controller-caught unexpected errors return 500 `{"message":"Internal server error."}`.
- Creation has no controller-level catch; unexpected creation errors use Express's default error handler. JSON-parser errors (including malformed JSON) and unmatched routes also use Express defaults; do not assume the application JSON error shapes for them.
- All serialized dates below are ISO timestamps. `uuid` and `iso-time` in compact examples denote actual UUID strings and ISO timestamps, not accepted literal values.

### Shared message response

Send and notification responses return this object directly:

```json
{
  "messageId": "0192f0c4-0000-7000-8000-000000000001",
  "conversationId": "0192f0c4-0000-7000-8000-000000000002",
  "senderId": null,
  "type": "SYSTEM",
  "content": "The order has been created",
  "triggeredByUserId": null,
  "createdAt": "2026-11-10T00:00:00.000Z"
}
```

`senderId`, `content`, `triggeredByUserId` may be null in stored messages. Types are TEXT/SYSTEM. History adds `translatedContent` (string or null); send/notification responses and `message:sent` omit that field.

## GET /health

### Current usage

Checks whether chat can query its database. It is available for operational health checks; it does not test Redis, User Service or Gemini.

### Request and response

No body, parameters or authentication. Executes `SELECT 1`.

- 200: `{"status":"ok","database":"up"}`.
- 503: `{"status":"error","database":"down"}` when the query fails.

## POST /chat/conversations

### Current usage

The [Order Service chat client](../../order-service/src/clients/chat.client.ts) calls this during its worker’s chat-creation job. After success, that client separately sends “The order has been created” through the notification endpoint.

### Request and response

Order-service credentials required. Body fields are required:

```json
{
  "orderId": "0192f0c4-0000-7000-8000-000000000001",
  "requesterId": "0192f0c4-0000-7000-8000-00000000000a",
  "orderDescription": "Coffee from Deck"
}
```

Both IDs must be UUIDs; description must be a nonblank string. Creates ACTIVE conversation and REQUESTER atomically, using description as title. No initial message is created.

201 for new creation, 200 for matching order/requester/title replay:

```json
{
  "success": true,
  "data": {
    "conversationId": "uuid",
    "orderId": "uuid",
    "title": "Coffee from Deck",
    "status": "ACTIVE",
    "createdAt": "iso-time"
  }
}
```

| Status | JSON error envelope |
| --- | --- |
| 400 | `{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Invalid conversation creation request","details":[{"field":"orderId","message":"orderId is required"}]}}` (details vary by invalid field) |
| 401 | `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Invalid service credentials"}}` |
| 403 | `{"success":false,"error":{"code":"FORBIDDEN","message":"Service is not permitted to perform this operation"}}` |
| 409 | `{"success":false,"error":{"code":"ORDER_ID_CONFLICT","message":"A conversation already exists for this order with different creation details"}}` |

The requester’s `lastReadMessageId` and `revokedAt` start null. Creation timestamps use millisecond precision. The unique order ID resolves concurrent creation requests: a request that loses the insert race reads the existing row and applies the same requester/title match check. Retry comparison uses the stored title and requester. No student Bearer token is stored, and status is not accepted as a creation input.



## GET /chat/conversations

### Current usage

The frontend uses `listChats` to load chat lists and Active/Archived tabs, calculate unread badges, and locate an order’s conversation through `findOrderChat`. See [chat client](../../frontend/src/api/chat.js), [Chat page](../../frontend/src/pages/Chat.jsx) and [ChatBubble](../../frontend/src/components/ChatBubble.jsx).

### Request and response

Bearer required. No body.

| Query | Validation / meaning |
| --- | --- |
| `limit` | Optional decimal-digit string, integer 1–50; default 20 |
| `status` | Optional lowercase `active` or `archived` |
| `role` | Optional lowercase `courier` or `requester`; user's participation role, not token role |
| `cursor` | Optional nonempty standard base64 of UTF-8 JSON `{"updatedAt":"<ISO timestamp>","id":"<UUID>"}`; exact keys required |

URL-encode base64 in query strings. Sort is `updatedAt DESC, conversationId DESC`, exclusive cursor boundary. Revoked memberships remain visible. Personal system chats match either role filter; status filtering still applies. Unread messages exclude own messages and include null senders; null read position counts all eligible messages.

200:

```json
{
  "conversations": [
    {
      "id": "uuid",
      "orderId": null,
      "lastMessage": {
        "content": "Notice",
        "type": "SYSTEM",
        "createdAt": "iso-time"
      },
      "unreadCount": 1,
      "updatedAt": "iso-time"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

`lastMessage` is null for empty conversations; its content can be null. Nonfinal `nextCursor` is an **object** `{updatedAt,id}` that callers must encode, not an already encoded string.

The query fetches one extra row to determine `hasMore`. Latest-message selection and unread comparisons use creation timestamp, then message ID. The frontend pins the FoC chat and displays it in the Active tab; the API still applies its normal timestamp sorting and status filter.

### Errors

- 400 `{"message":"Invalid conversation query parameters","code":"VALIDATION_ERROR"}`.
- 401 common auth JSON.
- 500 common JSON.

## GET /chat/conversations/:conversationID

### Current usage

The frontend uses `getChat` when opening a conversation and when loading chat-list details. `ChatBubble` also fetches it for the title of an incoming notification. See [Chat page](../../frontend/src/pages/Chat.jsx) and [ChatBubble](../../frontend/src/components/ChatBubble.jsx).

### Request and response

Bearer required; UUID path; no body or query contract. Any participant, including revoked, can read.

200:

```json
{
  "conversationId": "uuid",
  "orderId": "uuid",
  "status": "ACTIVE",
  "title": "Coffee from Deck",
  "participants": [
    {
      "userId": "uuid",
      "role": "REQUESTER",
      "joinedAt": "iso-time"
    }
  ],
  "createdAt": "iso-time",
  "updatedAt": "iso-time"
}
```

System conversations have null `orderId` and null participant role. Status is ACTIVE/ARCHIVED.

### Errors

- 400 invalid UUID.
- 401 auth.
- 404 missing conversation.
- 403 non-participant.
- 500 unexpected failure. Domain errors are plain text as above.

## GET /chat/conversations/:conversationID/messages

### Current usage

The [Chat page](../../frontend/src/pages/Chat.jsx) calls `listMessages` on opening a conversation and when loading older history. The returned participants provide read positions and translation preferences; messages provide original and prepared translated text.

### Request and response

Bearer required; UUID path. Query accepts only optional `limit` (same 1–50/default 20 rules) and `cursor` (standard base64 JSON with exact keys `{"createdAt":"<ISO timestamp>","id":"<UUID>"}`). Invalid UUID/query returns plain-text 400.

200:

```json
{
  "participants": [
    {
      "userId": "uuid",
      "role": "REQUESTER",
      "joinedAt": "iso-time",
      "lastReadMessageId": null,
      "translateTo": null
    }
  ],
  "data": [],
  "pagination": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

`data` contains shared message objects plus `translatedContent`, the requesting user's stored translation or null (including possible `SAME` sentinel). Participant role/read position/target language may be null. Pages sort `createdAt DESC, id DESC`; nonfinal cursor is object `{createdAt,id}` for the last returned message. All participants appear on each page. Revoked users retain history access.

The frontend combines persisted participant read positions with live receipts to restore read ticks after reopening or loading older history. It merges HTTP and socket messages by messageId; on reconnect it rejoins open rooms and reloads history.

### Errors

- 400 invalid path/query.
- 401 auth.
- 404 missing conversation.
- 403 non-participant.
- 500 unexpected failure.

## POST /chat/conversations/:conversationID/messages

### Current usage

The [Chat page](../../frontend/src/pages/Chat.jsx) calls `sendMessage` when a user submits text in the message composer. Other clients receive the committed message through Socket.IO. Service-key TEXT sending is supported by this endpoint; the Order Service client uses the dedicated SYSTEM notification endpoint instead.

### Request and response

Bearer or service key; UUID path. Body:

```json
{
  "type": "TEXT",
  "content": "Hello"
}
```

Only TEXT and nonblank string content are accepted. User-supplied sender/actor fields are ignored. Verified user is sender; service-key sender is null. Service keys bypass membership checks but still require ACTIVE conversation. A participant user cannot send into a personal system conversation.

201: shared message object (type TEXT, triggering-user ID null). After commit emits `message:sent` and queues enabled recipient translations. Publication/enqueue failure does not change successful persistence.

Content is stored unchanged, including leading or trailing whitespace around nonblank text. Message insertion and the conversation timestamp update share a transaction and timestamp. Socket delivery follows commit and targets each socket once across the union of rooms. Success confirms persistence, without acknowledging delivery to every frontend. This endpoint has no caller-supplied idempotency key.

### Errors

- 400 invalid path/body or unsupported type.
- 401 auth.
- 404 absent conversation.
- 403 non-participant or user sending into system chat.
- 422 a user's SYSTEM type attempt.
- 409 archived conversation or revoked sender.
- 500 unexpected failure.

Service-key SYSTEM attempts get 400. Lookup/membership checks precede body validation; archive/revocation checks follow valid-body validation.

## POST /chat/conversations/:conversationID/read

### Current usage

The [Chat page](../../frontend/src/pages/Chat.jsx) calls `markMessagesRead` for displayed messages. The [frontend client](../../frontend/src/api/chat.js) then dispatches `chat-read-updated` to refresh unread counts; the server publishes the read receipt to other chat-room users.

### Request and response

Bearer required; UUID path and required UUID body field:

```json
{
  "lastReadMessageId": "0192f0c4-0000-7000-8000-000000000001"
}
```

200: `{"conversationId":"uuid","userId":"uuid","lastReadMessageId":"uuid"}`. Returns the retained position if the requested message is older; ordering uses creation timestamp then ID. Archived conversations are allowed. Emits `messsage:read` (three s characters) to other users in the conversation room.

The authenticated subject supplies the reader identity. Neither the response nor event includes `readAt`. Concurrent updates retry against the latest stored position. The server emits `messsage:read` even when the position stays unchanged, excluding every socket in the reader’s user room. Other users must have joined the conversation room to receive it. Broadcast failure is logged without changing the successful response.

### Errors

- 400 invalid path/body or target message belongs to another conversation.
- 401 auth.
- 403 non-participant.
- 404 conversation or target message missing.
- 409 revoked membership.
- 500 unexpected failure.

## POST /chat/conversations/:conversationID/translation

### Current usage

The [Chat page](../../frontend/src/pages/Chat.jsx) calls `setTranslation` when the user changes auto-translation. Enabling queues history translation, and subsequent messages can be translated for that participant. Results arrive through `message:translated` or later history requests.

### Request and response

Bearer required; UUID path. Body is either:

```json
{
  "enabled": true,
  "language": "zh"
}
```

or `{"enabled":false}`. Enabled must be boolean literal; enabling requires one of `en`, `zh`, `hi`, `ta`, `ms`, `es`, `ar`. Disabling does not require language (extra fields are stripped).

200: `{"conversationId":"uuid","userId":"uuid","translateTo":"zh"}`; disabling returns null target. Enabling queues untranslated received history; this response confirms the stored preference, not completed translation. Changing enabled language deletes old translations; disabling preserves them. Archived conversations are allowed.

The client sends its User Service preferred language when enabling; changing the user setting does not update existing `translate_to` values automatically. Stored translations are per message/user. Eligible messages are received TEXT or SYSTEM messages with content; own messages are excluded. Jobs check current membership and target language before processing.

Disabling, changing preferred language, then re-enabling can retain old-language translations: stored translation rows have no language column, and enabling from null does not delete them.

Gemini receives and returns JSON keyed by message ID. Literal `SAME` is stored when text already matches the target language. Missing or invalid values remain untranslated for a later applicable job; those missing values alone do not trigger an immediate retry. The UI’s Show original / Translate controls switch between original and stored text without invoking the model. Null and SAME do not offer that switch.

### Errors

- 400 invalid path/body/language.
- 401 auth.
- 403 non-participant.
- 404 absent conversation.
- 409 revoked membership.
- 500 unexpected failure. Enqueue failures are logged without failing the response.

## POST /chat/orders/:orderId/participants

### Current usage

The [Order Service chat client](../../order-service/src/clients/chat.client.ts) uses this in its participant-delivery job to add the courier by order ID. It does not need to retrieve the conversation ID first. Order acceptance queues courier addition alongside the status change. The worker retries network/5xx failures; 409 is permanent and is dead-lettered.

### Request and response

Service key required; UUID path is the order ID. It resolves the associated conversation inside the membership transaction. Required body:

```json
{
  "userId": "0192f0c4-0000-7000-8000-00000000000a",
  "role": "COURIER"
}
```

User ID must be UUID and role exactly REQUESTER or COURIER. Creates membership only; does not look up user existence in User Service.

200:

```json
{
  "conversationParticipantId": "uuid",
  "conversationId": "uuid",
  "userId": "uuid",
  "joinedAt": "iso-time",
  "role": "COURIER"
}
```

The transaction locks the ACTIVE conversation before checking membership and inserting. New rows use the schema defaults. A revoked courier permits adding a different courier; revoked requester membership still occupies the requester role. Existing memberships are not updated or reactivated. No participant-added socket event is emitted.

### Errors

- 400 invalid path/body.
- 401 auth.
- 403 Bearer-only caller.
- 404 no conversation for that order.
- 409 archived, same user already present (even revoked), another requester already present, or another active courier present.
- 500 unexpected failure. Repeated additions conflict rather than return idempotent success.

## POST /chat/send-system-notification

### Current usage

The [Order Service chat client](../../order-service/src/clients/chat.client.ts) sends creation and lifecycle notifications here. Its stable message ID allows delivery retries. The endpoint also supports personal notifications as described in the [caller guide](../SYSTEM-NOTIFICATIONS.md); this describes supported usage, not a verified personal-notification caller in every service.

### Request and response

Service key required. Order notification body:

```json
{
  "orderId": "0192f0c4-0000-7000-8000-000000000001",
  "messageId": "0192f0c4-0000-7000-8000-000000000002",
  "message": "The order has been created",
  "triggeredByUserId": "0192f0c4-0000-7000-8000-00000000000a"
}
```

Personal notification body:

```json
{
  "orderId": null,
  "recipient": "0192f0c4-0000-7000-8000-00000000000a",
  "messageId": "0192f0c4-0000-7000-8000-000000000002",
  "message": "Account notice"
}
```

`orderId` is required UUID or null; `messageId` required UUID; `message` required nonblank string. `recipient` optional UUID, required when orderId=null; when orderId is non-null it is not used to restrict recipients. `triggeredByUserId` optional UUID, permitted only for non-null orderId; no participant/user-existence check is performed for this actor.

201: shared message object with type SYSTEM and senderId=null; emits only on initial creation. Personal chat is created lazily. 200: identical message-ID replay, returning existing message with no rebroadcast/enqueue. Deduplication checks order, personal recipient when applicable, content, type, sender and actor; it runs before ACTIVE checks, so identical replay after archive succeeds.

The caller generates the UUID once per notification before delivery and reuses it on every retry. A fresh UUID creates a distinct message. Identical replay leaves `updatedAt` unchanged; concurrent duplicate insertion is resolved after rollback of the losing transaction.

An explicit order ID uses only its order conversation. Personal delivery requires explicit `orderId: null` and recipient. The first personal notification creates an ACTIVE FoC conversation with null orderId and one null-role participant. A unique per-user mapping resolves concurrent creation. Conversation creation commits separately before message insertion, so a failed insert can leave an empty conversation that retries reuse. The first saved message uses `message:sent`; no conversation-created event is emitted.

The triggering-user field records the actor without removing recipients or messages. The frontend suppresses that actor’s toast.

### Errors

- 400 invalid body or invalid conditional fields.
- 401 auth.
- 403 Bearer-only caller.
- 404 order conversation missing.
- 409 archived conversation for a new message or message-ID reuse with different checked fields.
- 500 unexpected failure. See [caller guide](../SYSTEM-NOTIFICATIONS.md).

### Order notification wording

The [Order Service implementation](../../order-service/src/services/orders.service.ts) currently supplies these messages. Chat stores the caller's text; it does not derive order status or fetch courier names.

| Trigger | Notification text |
| --- | --- |
| Creation | `The order has been created` |
| Cancelled | `The order has been cancelled` |
| Expired | `The order has expired` |
| Accepted, username available | `The order has been accepted by <username>` |
| Accepted, lookup fails/unusable | `The order has been accepted` |
| Picked up | `The order has been picked up` |
| Delivered | `The order has been delivered` |
| Completed | `The order has been marked as completed` |

The acceptance flow obtains the courier username in Order Service using the request Bearer token with User Service; that token is not placed in the notification job. Notification jobs retain their message UUID across retries. See the [Order Service README](../../order-service/README.md).

## POST /chat/orders/:orderId/archive

### Current usage

The [Order Service chat client](../../order-service/src/clients/chat.client.ts) calls this after a successful final notification when `archiveAfter` is set. On retry it resends the same notification ID before attempting archive again. Bearer access is supported, but the inspected frontend chat client does not expose an archive action.

### Request and response

Bearer or service key; UUID order path. No body fields are consumed. Service-key caller may archive any existing order conversation. Bearer caller must be a participant; membership revocation is not checked here.

200 plain-text `OK`, including already archived conversations. Sets ARCHIVED only, without updating conversation `updatedAt`, deleting data or emitting an archive event.

Order Service sets `archiveAfter` for completed/cancelled transitions. It sends the final status message first and archives only after successful notification. This internal job flag is not sent in the notification body. Temporary failures retry through the outbox/worker flow using the same notification UUID; identical notification replay remains successful after archive.

### Errors

- 400 invalid order UUID.
- 401 auth.
- 403 user not a participant.
- 404 no conversation for order.
- 500 unexpected failure.

## Socket.IO interface

Uses the same HTTP server at `/chat-socket.io`, WebSocket transport only. Connect with `auth: {token: "<access-token>"}`. Invalid token produces `connect_error` with message `unauthorized`; socket disconnects at token expiry. It automatically joins `user:<verifiedUserId>` before receiving `ready`.

| Event | Direction | Payload / behavior |
| --- | --- | --- |
| `ready` | Server → client | No payload; user room joined |
| `chat:join` | Client → server | Conversation UUID string and optional ack callback; verifies conversation and non-revoked membership, joins `chat:<id>` |
| `chat:leave` | Client → server | Conversation UUID string and optional ack; leaves room without membership lookup, allowing cleanup after revocation |
| `message:sent` | Server → client | Shared message object; union of chat room and non-revoked participant user rooms, once per targeted socket |
| `messsage:read` | Server → client | `{conversationId,userId,lastReadMessageId}`; chat room excluding reader's user room; spelling is intentional documentation of current code |
| `message:translated` | Server → client | `{messageId,conversationId,translatedContent}`; target user's room only, userId omitted |

Join/leave operations execute in received order. Success ack: `{"success":true,"conversationId":"uuid"}`. Failure: `{"success":false,"error":{"code":400,"message":"Bad Request"}}`. Join codes: 400 invalid UUID, 404 missing conversation, 403 non-participant, 409 revoked, 500 unexpected error (`Internal server error.`). Leave validates UUID (400) and can fail unexpectedly (500); it does not reject nonexistent conversations. Joining does not reject archive status alone. Message sending uses HTTP, not a client socket send event.
