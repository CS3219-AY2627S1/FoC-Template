# Chat Service instructions

## Scope and reference documents

- Read [the repository instructions](../AGENTS.md), [the Chat Service plan](PLAN.md), and [the User Service interface plan](../user-service/PLAN.md) before changing chat behaviour. `PLAN.md` defines the Sprint 3 contracts, phase order, acceptance checks, and requirement-ID aliases.
- Chat Service owns private one-to-one text conversations, messages, blocks, unread state, and delivery events. User Service owns immutable user IDs, current names, account status, and session validity. Keep service databases and business logic independent.
- Conversations begin directly. Do not introduce first-contact requests, acceptance/ignore states, typing indicators, reporting, group chat, or attachments.
- Sender-facing read receipts and errand status/requester/courier context are outside Sprint 3. Internal read state is required for unread counts.
- The service starts as a skeleton. Plans and proposed User Service contracts are not evidence that runtime capabilities already exist. Implement only the work requested by the current task.

## Stack, storage, and local integration

- Use Python 3.13, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy async with `asyncpg`, `httpx` for asynchronous HTTP calls, and `aio-pika` for RabbitMQ. Keep request handlers and WebSocket processing non-blocking.
- Use an isolated Supabase PostgreSQL database and the `chat_service` schema. Restrict the runtime database role to the privileges it needs. Supabase is PostgreSQL storage only; do not use Supabase Auth, its Data API/client SDKs, or browser-to-Supabase access.
- Keep `supabase/migrations/` as Chat Service's sole schema history. Create timestamped SQL migrations and validate them with `npx supabase db reset` against Chat Service's local project. Do not reset another service's database, add a second migration framework, or create/alter tables at application startup.
- Use container backend port `8003` and published/native host port `8004` because Credit owns host port `8003`. Use a separate local Supabase port range beginning at `17420`, as planned. Check existing configurations before assigning individual ports.
- Extend [the root Compose configuration](../compose.yaml) with an optional `chat` profile and a separately restartable Chat Service outbox publisher. Use the existing RabbitMQ service and the networks needed to reach User Service and RabbitMQ; do not repurpose User Service's publisher.
- Keep local secrets ignored and document safe placeholders in `.env.example`. Do not overwrite existing secrets or expose database/RabbitMQ credentials or internal-service secrets to browser configuration, URLs, logs, responses, or events.

## Identity, authorization, and external contracts

- Identify users exclusively by immutable User Service UUIDs. Usernames and display names can change; neither is a conversation key. Display names are not unique.
- Verify RS256 signatures, issuer, audience, and expiry using User Service's public JWKS. Use its existing `GET /v1/users/me` for current-session/account validation; signature verification alone does not detect revoked sessions or deleted accounts. Never copy its private keys or import its application modules.
- Require participant authorization independently for every protected HTTP operation, WebSocket command, and live-content forwarding. Derive the sender from authentication, never from a client-supplied sender ID. System administrator roles do not grant access to other users' chats.
- Validate allowed WebSocket origins. Authenticate `/v1/chat/ws` using the first frame within five seconds of connection acceptance, and send no chat data before authentication succeeds. Keep bearer tokens out of URLs and logs. Close rejected/expired sessions; reconnect through the existing frontend refresh flow.
- Use `GET /v1/internal/chat/users` for case-insensitive literal substring search on username only. Forward the caller's bearer token and the dedicated Chat Service identity. Exclude the caller and deleted users, and preserve pagination so all matches remain accessible.
- Use `POST /v1/internal/chat/participants` for current display names, nullable usernames, and account status. It is a read-only batch lookup, not participant creation; it requires service identity without a browser bearer token. Respect its 100-ID batch limit and distinguish unknown IDs from tombstones.
- Authenticate the internal contracts with `X-FoC-Service-Secret` and the dedicated `CHAT_SERVICE_SHARED_SECRET` configuration. Do not reuse Supplier Service's secret or broaden its authorization contract.
- Treat missing User Service capabilities as external prerequisites owned by User Service. Contract fakes are for tests; verify actual production integration before claiming completion. Apply bounded timeouts, validate responses, and fail closed on unavailable current identity/status checks.
- Follow the versioned HTTP/frame contracts and established camelCase DTOs, safe error envelope, and correlation IDs in the plans. For inaccessible conversation IDs, return a non-disclosing not-found response.

## Persistence and message acceptance

- Enforce one conversation per canonical ordered pair of distinct user IDs with a database uniqueness constraint. Create exactly two participant records in the same transaction. Foreign keys may reference Chat Service tables only.
- Store server timestamps in UTC and assign monotonically increasing per-conversation sequences. Use sequences for deterministic ordering, pagination, catch-up, and read boundaries.
- Validate raw text before trimming: at most 4,096 Unicode code points, with empty/whitespace-only input rejected. Trim outer whitespace only; preserve internal whitespace, line breaks, and Unicode without normalization. Keep frontend counting consistent with Python code-point counting rather than JavaScript UTF-16 string length.
- Accept a send only after validating the current sender, membership, recipient status, blocking, and retry identity. Insert the message and its outbox event atomically; send `message.accepted` only after commit. A successful send means durable storage, not device delivery or reading.
- Enforce unique `(sender_id, client_message_id)` and `(conversation_id, sequence)` values in PostgreSQL. Retrying an accepted ID returns the original message after authentication/membership checks, without another message or outbox event. Reject reuse with a different conversation or normalized text.
- Preserve the client message ID after a timeout with an uncertain outcome. An edited failed draft uses a new ID. Do not rely on in-memory duplicate detection for persistence correctness.
- Fetch history through indexed, bounded queries: latest 50 by default and at most 50 per page, older pages, or catch-up after a sequence. `beforeSequence` and `afterSequence` are mutually exclusive; return each page chronologically without loading the entire history.

## RabbitMQ delivery and recovery

- Publish committed outbox events from an independent worker. Use stable, versioned event identities, publisher confirms, expiring leases, and bounded retry backoff. Mark an event published only after broker confirmation; expect duplicate publication after crashes or uncertain confirms.
- Use the dedicated durable topic exchange `foc.chat.events`. Each API process needs its own exclusive live-delivery queue so every process holding participant connections receives events. A shared competing-consumer queue cannot provide that fan-out.
- Publish minimal identifiers and sequence metadata, not message bodies, names, emails, tokens, or secrets. Consumers load authoritative message data and recheck delivery eligibility before forwarding it.
- PostgreSQL is the recovery source. Exclusive queues and WebSocket connections are transient; do not present them as durable offline mailboxes or promise exactly-once delivery. A broker outage must not lose committed messages or require duplicate message insertion.
- Deduplicate optimistic messages, acceptance replies, and live events using persisted message/client IDs. Detect sequence gaps and fetch missed history. On consumer subscription recovery, send `sync.required` to connected clients so they resynchronize even if their WebSocket never disconnected.
- Bound each connection's outgoing buffer and clean up subscriptions/connections. Disconnect slow clients with a recoverable reason; clients reconnect with backoff, reauthenticate, reload summaries, and catch up by sequence.

## Blocking, deleted users, and unread state

- Serialize conversation creation, new sends, and block/unblock mutations for the same canonical user pair with the same transaction-scoped advisory lock. Recheck both blocking directions inside the transaction; application checks without coordination are insufficient.
- Either user's block prevents new messages in both directions. Unblocking removes only the caller's block. Rejected sends create neither a message nor an outbox event and must not be automatically queued for delivery after unblocking.
- Recheck blocking before live forwarding. Events skipped while blocked are not automatically replayed after unblocking. Preserve previously accepted history and unread state.
- Retain conversations/messages for deleted counterparts. Show `Deleted User`, omit the username line, exclude tombstones from discovery, and reject new conversations/messages with them. A new account reusing an old username must never inherit the old UUID's history.
- Persist each participant's monotonic last-read sequence. Incoming messages beyond it are unread; own messages never count as unread. Reject read acknowledgements beyond the conversation's persisted sequence boundary.
- A thread is active only when selected in a visible, focused browser tab. Opening it acknowledges all existing unread messages through the history response's boundary, including those outside the initial page. Process active incoming messages and immediately advance the cursor; keep the active-thread badge at zero.
- Hidden, unfocused, closed, and disconnected threads do not automatically advance read state. Synchronize persisted read changes across the reader's tabs/devices and retry/resynchronize failed updates without inventing successful persistence.

## Web-client and repository pointers

- Follow the phase order in `PLAN.md`; finish the backend completion gate before beginning the final chat UI. Keep automated evidence and a human-verifiable result for each phase.
- Chat UI belongs in `../web-client/`. Reuse [WorkspaceShell](../web-client/src/components/workspace-shell.tsx), [WorkspaceTopbar](../web-client/src/components/workspace-topbar.tsx), and [shared workspace styles](../web-client/src/styles/workspace.css), following the root instructions and Figma source of truth.
- Conversation lists show the current display name prominently and a smaller `@<username>` underneath. Resolve current names through User Service rather than storing a creation-time snapshot. Render message content as plain text.
- Keep pending, sent, failed, and received states distinct. Preserve failed text and retry identity; provide clear blocked/deleted/reconnect states, keyboard-accessible controls, and a 360 px mobile layout without horizontal scrolling.
- Update both [Vite routing](../web-client/vite.config.ts) and [Nginx routing](../web-client/nginx/default.conf) when adding chat. Put chat routes before the generic User Service route, support WebSocket upgrades/timeouts, and preserve startup when the optional chat profile is disabled.
- Extend [CI change detection and checks](../.github/workflows/ci.yml) when implementation is introduced. Existing User Service configuration, API/error handling, and outbox code are reference examples; keep Chat Service implementation independent.

## Verification and completion claims

- Test correctness against real PostgreSQL transactions: concurrent pair creation, simultaneous retry IDs, rollback of message/outbox insertion, concurrent block/send, sequence ordering, tombstones, and unread races. In-memory substitutes do not establish database constraint or locking behaviour.
- Test RabbitMQ and at least two API processes: duplicate/out-of-order events, lost acceptance replies, publisher restart, broker interruption/resubscription, cross-process forwarding, and client catch-up. Include revoked/expired sessions and outsider HTTP/WebSocket access.
- For implementation handoff, run relevant backend tests, a clean Chat Service migration reset, container smoke checks, and actual User Service integration. For UI changes, also run frontend lint/build and relevant component/end-to-end checks, including two signed-in browsers, keyboard use, and responsive widths from `PLAN.md`.
- Keep tests and FR/NFR coverage tied to the phase actually implemented. Do not reset databases or run destructive integration setup for documentation-only edits.
- Record baseline timings without claiming Sprint 4 compliance. The 1,000-connection, 25-messages/second for 15 minutes, formal latest-50 retrieval, and p95 delivery/loading targets remain future acceptance work.
