# Sprint 3 backend contract

All public chat routes use bearer authentication via User Service's public RS256 JWKS and
`GET /v1/users/me`. Current-session/account validation runs on every protected HTTP operation,
WebSocket command and protected outgoing frame. Idle connections are rechecked every 15 seconds
and at token expiry. JWT verification alone never authorizes a session. Administrator roles
have the same participant-only access rules. User Service failures fail closed.

An upstream `401 INVALID_SERVICE_IDENTITY` is a backend configuration failure and maps to
`503 SERVICE_NOT_READY`, not a rejected browser session. Participant/JWKS requests have no
caller session; their upstream 401 responses also map to 503. Actual caller-session rejection
from `/v1/users/me` or username search still maps to `401 INVALID_SESSION`.

User Service identity lookup uses only `X-FoC-Service-Secret` with
`CHAT_SERVICE_SHARED_SECRET`. Search also forwards the caller token. Participant lookup sends
no caller token and batches at 100 UUIDs. Responses are validated, missing IDs remain distinct
from tombstones, and current names/status are never cached. Public JWKS are cached for 300 seconds
with bounded key-refresh attempts. HTTP timeout defaults to 3 seconds. Correlation IDs propagate
to User Service; responses use `X-Correlation-ID` and `Cache-Control: no-store`.

## HTTP

Bodies and query models reject extra fields. IDs and cursors are UUID strings unless stated.
The summary/blocks cursor is the final returned UUID, ordered ascending by UUID for stable keyset
traversal. It does not imply a recency ranking. All pages are bounded; no history query loads an
entire conversation. No GET operation advances read state.

| Method/path | Input | Result |
|---|---|---|
| `GET /health/live` | Operational, no bearer | `status: live` |
| `GET /health/ready` | Operational, no bearer | All five tables readable; `delivery: ready/degraded`. Database failure is 503. Broker outage leaves HTTP readiness 200 with degraded delivery because acceptance remains durable. |
| `GET /v1/chat/users` | `username`, `limit` 1–100/default 20, optional opaque User Service `cursor` | Exact minimal directory page: `items[{userId,username}],nextCursor` |
| `POST /v1/chat/conversations` | `{recipientUserId}` | `{conversationId}`. Existing pairs reopen even when blocked/deleted; new pairs require both active accounts and no block. |
| `GET /v1/chat/conversations` | `limit` 1–50/default 20, optional UUID `cursor` | `items` summaries and `nextCursor` |
| `GET /v1/chat/conversations/{id}` | Participant bearer | One summary |
| `GET /v1/chat/conversations/{id}/messages` | `limit` 1–50/default 50; optional `beforeSequence>=1` or `afterSequence>=0` | Chronological `items`, `boundarySequence`, `lastReadSequence`, `hasMore` |
| `POST /v1/chat/conversations/{id}/read` | `{upToSequence: integer>=0}` | `conversationId,lastReadSequence,unreadCount,boundarySequence` after commit |
| `GET /v1/chat/blocks` | `limit` 1–50/default 20, optional UUID `cursor` | Current identity `items` and `nextCursor` for caller-owned blocks |
| `PUT /v1/chat/blocks/{userId}` | No body | Idempotent `userId,blockedByMe,messagingBlocked` |
| `DELETE /v1/chat/blocks/{userId}` | No body | Removes only caller's block, same result shape |

A summary includes `conversationId`, `counterpart{userId,displayName,username,accountStatus}`,
`latestMessage` or null, `createdAt`, `lastSequence`, `lastReadSequence`, `unreadCount`, `blocked`,
and `messagingAvailable`. Use current `displayName` prominently and smaller `@username` beneath;
for tombstones show `Deleted User` and omit the username line. Unknown identity lookup results
produce dependency failure, never invented tombstones.

A message contains `messageId,conversationId,senderUserId,clientMessageId,sequence,text,createdAt`.
Timestamps are server UTC ISO 8601. Sequence is the deterministic ordering key. Latest history
returns at most 50 entries in chronological order. Older pages use the first sequence as
`beforeSequence`; catch-up pages use the last processed sequence as `afterSequence`, continuing
while `hasMore`. `boundarySequence` is the snapshot boundary, including older messages outside
the returned page. Subsequent sends do not change the boundary of that response.

Errors use `{error:{code,message,correlationId,fieldErrors:[]}}` without request values.
`401 INVALID_SESSION`, `404 CONVERSATION_NOT_FOUND` (outsiders and absent IDs alike),
`409 MESSAGING_BLOCKED`, `409 RECIPIENT_UNAVAILABLE`, `409 RETRY_ID_CONFLICT`,
`422 VALIDATION_ERROR/INVALID_READ_BOUNDARY/INVALID_RECIPIENT`, and `503 SERVICE_NOT_READY`
are stable client handling codes. Unexpected exceptions return a generic 500.

## WebSockets

Connect to `/v1/chat/ws` without query parameters from an exact `ALLOWED_ORIGINS` origin. Within
five seconds send `{"type":"authenticate","accessToken":"<in-memory bearer>"}`. No chat data
precedes authentication. Successful reply: `ready` with `userId` and `correlationId`.
Origin/query rejection uses 1008; rejected/expired sessions use 4401; dependency or slow-client
recovery uses 1013. Reconnect with backoff after the existing frontend refresh flow.

All commands below carry a UUID `requestId` and reject extra fields:

```json
{"type":"message.send","requestId":"<uuid>","conversationId":"<uuid>","clientMessageId":"<uuid>","text":"Hello"}
{"type":"conversation.read","requestId":"<uuid>","conversationId":"<uuid>","upToSequence":42}
{"type":"ping","requestId":"<uuid>"}
```

`message.accepted{requestId,message}` is emitted only after atomic message/outbox commit.
`message.created{message}` is an eligible live event. Either may arrive first. Deduplicate using
persisted message IDs/client IDs, including optimistic bubbles. `unread.updated` includes the
HTTP read result fields and a `requestId` for direct command replies. Broker read updates go only
to the reader's connections, without `requestId`; no sender-facing read receipt exists.
`pong{requestId}`, `error{requestId,error}`, and `sync.required{reason,conversationId?}` complete
the implemented protocol. `conversation.updated` is reserved; clients refresh summaries when
messages, unread updates, block results, or recovery signals change conversation presentation.

Text validation counts Python Unicode code points on the raw input before trimming, rejects
empty/whitespace-only text and lengths above 4096, and trims only outer whitespace. Internal
whitespace, line breaks and Unicode are unchanged. NUL and isolated surrogates are rejected as
invalid PostgreSQL/Unicode text. JSON-escaped supplementary characters are supported through
4096 code points. Use `[...text].length` in the browser client, not UTF-16 `.length`.

On uncertain send outcome preserve the same client message ID and text. Retrying an accepted
ID after current authentication/membership checks returns the original message even if the pair
is subsequently blocked or the counterpart deleted. Changing normalized text or conversation
with that ID returns conflict; an edited failed draft needs a new ID. Rejected new sends never
enter an offline queue and cannot be automatically delivered after unblocking.

## Unread and recovery obligations for the UI

Select + visible + focused is an active thread. After presenting initial history, explicitly
acknowledge its `boundarySequence`, which clears all existing unread entries including those
outside the initial 50. After processing an active incoming message acknowledge its sequence;
before/after active sending acknowledge incoming messages already presented. Hidden/unfocused
tabs must not send automatic read commands. The backend cannot infer focus or visibility.
Own sends never increase unread count, reads are monotonic, and future sequences are rejected.
Show the returned persisted state; retry/resynchronize failed reads instead of assuming success.

On reconnect or `sync.required`, reload summaries and catch up each relevant conversation from
its last persisted/processed sequence. Sequence gaps also trigger `sync.required`. Out-of-order
events may arrive; use history to restore order before presenting a complete thread. Local
duplicate suppression is bounded to 2048 IDs per connection, so clients must also deduplicate.
Outgoing buffers are bounded (default 64); slow consumers close with 1013 and recover from SQL.

## Storage and delivery invariants

Canonical immutable UUID pairs are unique; a deferred database constraint verifies exactly
their two participants at commit. Foreign keys stay within `chat_service`. Pair creation, new
sends and block/unblock share a stable transaction-scoped advisory lock. Sending also serializes
sender/client retry IDs across conversations, then locks the conversation row to allocate a
sequence. Read updates share the row lock, preventing future-read races.

The independent `chat-outbox` publisher claims rows using `FOR UPDATE SKIP LOCKED`, expiring
leases and unique lease tokens. Only the lease owner may finish. Publisher confirms precede
`published_at`; failures retain rows and use bounded exponential backoff. A crash/uncertain
confirm may republish the same stable event ID. Confirmed publication is broker acceptance,
not device delivery or reading. See [aio-pika publisher confirms](https://docs.aio-pika.com/rabbitmq-tutorial/7-publisher-confirms.html).

Durable topic exchange `foc.chat.events` carries `{eventId,eventType,data}` with minimal IDs and
sequence/read-boundary metadata. Bodies, names, emails and credentials never enter events.
Each API process declares its own exclusive temporary queue. It loads authoritative messages
and rechecks eligibility at write time. Blocked/deleted events are consumed and not held for
unblock replay. PostgreSQL is the offline recovery source; transient live queues are not durable
mailboxes. A successful subscription/re-subscription sends `sync.required` to connected clients.

No typing, first-contact workflows, reporting, attachments, groups, errand context or scale
features are implemented. Formal load/p95 targets remain deferred. Phase 6 browser behavior and acceptance
evidence are recorded in [UI verification](ui-verification.md).
