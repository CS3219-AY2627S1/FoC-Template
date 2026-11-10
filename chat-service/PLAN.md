# Chat Service Sprint 3 Implementation Plan

## Summary and scope

This plan uses only the N1 Chat Service functional and non-functional requirements in `Project-D1-Group 6.docx` and follows the structure of the [archived User Service implementation plan](../user-service/docs/archive/d1-PLAN.MD): sprint outcome, technology and data design, contracts, incremental phases with human checks, deferred work, and acceptance mapping.

Sprint 3 delivers persistent, private, one-to-one text messaging between active users, partial username search, conversation lists, unread counts, block/unblock, validation, duplicate-safe retries, and retained history with deleted users. Include the chat-specific web-client work, but place it after the backend has been implemented and tested.

The following decisions are fixed:

- Use Supabase PostgreSQL for persistence, RabbitMQ for asynchronous delivery, and FastAPI WebSockets for live communication.
- Conversations begin directly. There are no first-contact requests, acceptance/ignore states, typing indicators, or reporting features.
- Chat Service owns conversations, messages, unread state, blocks, and delivery events. User Service owns identity, account status, and username search data.
- Missing User Service interfaces are external prerequisites, implemented by the User Service owner.
- A conversation is active only when selected in a visible, focused browser tab.
- Sprint 3 requires internal `UNREAD`/`READ` handling for unread counts. Sender-facing read receipts are outside this sprint.
- Errand status and requester/courier context remain Sprint 4 work.

The source contains several identifier mistakes. Preserve traceability by recording these aliases rather than silently rewriting the source:

| Source identifier | Identifier used in this plan |
|---|---|
| `NF1F1.5.2` | `N1F1.5.2` - duplicate-safe resend |
| `M1NFR3.1`-`M1NFR3.4` within the N1 table | `N1NFR3.1`-`N1NFR3.4` - usability |
| `M1NFR1.*` and `M1NFR2.*` within the N1 table | Corresponding N1 scalability/performance requirements, deferred to Sprint 4 |

Treat the chronological-history and rejected-blocked-message requirements, whose sprint cells are blank, as necessary supporting Sprint 3 behaviour.

## Technology, data, and behaviour

### Service foundation and storage boundary

Use Python 3.13, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy async with `asyncpg`, `httpx` for asynchronous service calls, and `aio-pika` for RabbitMQ.

Provision an isolated Supabase PostgreSQL database with a `chat_service` schema and a runtime database role restricted to that schema. Supabase supplies PostgreSQL storage only; application authentication and authorization remain in FastAPI.

Use the service's Supabase SQL migrations as its sole schema history. Validate migrations through a clean `npx supabase db reset`. Runtime models must not create tables or apply migrations at startup.

Use container backend port `8003`, published/native host port `8004` (Credit owns host port `8003`), and a separate local Supabase port range beginning at `17420`, avoiding the existing service configurations. Add an optional Compose `chat` profile containing Chat Service and its outbox publisher, connected to the existing RabbitMQ and appropriate internal networks.

Keep database URLs, RabbitMQ credentials, and internal-service secrets in ignored local configuration and secret management. Provide safe `.env.example` placeholders. Browser clients communicate only with application services.

### Persistent model

| Table | Essential data and invariants |
|---|---|
| `conversations` | UUID ID, canonical ordered pair of distinct immutable user IDs, creation timestamp, and per-conversation sequence counter. A unique pair constraint guarantees one conversation per user pair. |
| `conversation_participants` | Conversation ID, participant user ID, and monotonic last-read sequence. Exactly two participant records are created transactionally with each conversation. |
| `messages` | UUID ID, conversation ID, sender ID, sequence, normalized text, client message ID, and server UTC timestamp. Enforce unique conversation/sequence and unique sender/client-message-ID combinations. |
| `blocks` | Blocker ID, blocked ID, and creation timestamp. Enforce distinct users and a unique directional pair. |
| `outbox_events` | Stable event ID/type, minimal payload, pending/published state, occurrence timestamp, attempts, next retry time, publication timestamp, and expiring worker lease. |

Foreign keys may connect Chat Service tables only. User IDs reference identities owned by User Service without cross-service database access or foreign keys.

Index participant conversation lookup, directional block lookup, message pagination by conversation/sequence, retry-ID lookup, and eligible pending outbox events. Retrieve latest-message summaries through indexed queries.

Store timestamps in UTC. Use the server-assigned conversation sequence for deterministic ordering when timestamps coincide.

### Conversation and message rules

- Allow conversations between two distinct active users, regardless of their system roles. Administrative roles grant no access to other users' conversations.
- Username search uses case-insensitive literal substring matching on username only. Exclude deleted users and the caller. Paginate results so every match remains accessible.
- Selecting a search result creates or reopens the pair's conversation without an additional creation dialog.
- Existing conversations remain accessible after blocking or counterpart deletion. Empty conversations have a clear "No messages yet" state.
- List conversations with the counterpart's current display name as the primary label and their username beneath it in smaller text, formatted as `@<username>`, alongside the latest message, timestamp, and caller-specific unread count. Resolve the current display name through User Service rather than retaining a conversation-creation snapshot.
- History retrieval defaults to the latest 50 messages. Support older-page retrieval and catch-up after a known sequence without loading the entire history. Return each page in chronological order.
- Validate the original message before trimming: at most 4,096 Unicode code points. Reject empty and whitespace-only input.
- Trim leading and trailing whitespace only. Preserve internal spaces, tabs, line breaks, and Unicode content; perform no Unicode normalization.
- Render messages as plain text.

### Durable acceptance and asynchronous delivery

Use this flow:

1. Receive `message.send` through an authenticated WebSocket.
2. Validate the command, current sender session, membership, recipient status, and retry identity.
3. Serialize mutations affecting the same user pair with a transaction-scoped advisory lock. Recheck both directions of blocking.
4. Allocate the next sequence and insert the message and outbox event in one transaction.
5. After commit, return `message.accepted` with the persisted message ID, client message ID, sequence, text, and timestamp.
6. The independent outbox publisher publishes the event to RabbitMQ and marks it published after publisher confirmation.
7. Chat instances consume the event, load authoritative message data, verify delivery eligibility, and push it to the participants' local authenticated connections.

"Sent successfully" means durably stored. It does not mean delivered to a device or read.

Use stable event IDs, publisher confirms, expiring leases, and bounded exponential retry delays. Broker redelivery and publication retries are expected; they must not create additional message rows. RabbitMQ documents the need for duplicate-tolerant handling during recovery. [RabbitMQ reliability](https://www.rabbitmq.com/docs/reliability).

For client retries:

- Reuse the original client message ID.
- After authentication and membership checks, return an existing accepted message without creating another message or outbox event.
- Reject reuse of an accepted retry ID for a different conversation or normalized text.
- Preserve the ID when a send times out and its outcome is uncertain.
- Editing a failed draft creates a new client message ID.
- Never automatically queue blocked or deleted-recipient failures for later delivery. An explicit retry is evaluated against current permissions.

Use a dedicated durable chat topic exchange, `foc.chat.events`. Each API process has its own exclusive live-delivery queue, so events reach every process holding relevant connections. A shared competing-consumer queue would not reliably reach the recipient's process. [RabbitMQ publish/subscribe](https://www.rabbitmq.com/tutorials/tutorial-three-python).

Live queues are temporary delivery mechanisms. PostgreSQL remains the recovery source. On RabbitMQ subscription recovery, notify connected clients to resynchronize their conversation list and missed history.

Publish minimal identifiers and sequencing metadata rather than message bodies, usernames, emails, tokens, or credentials.

### Blocking and deleted accounts

Apply the same pair lock to sending, conversation creation, and block/unblock mutations so a completed block cannot be bypassed by a concurrent new send. PostgreSQL provides transaction-scoped advisory locks for this coordination. [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html).

- Either party's block prevents new messages in both directions.
- Unblocking removes only the caller's block; the other party's block still applies.
- Rejected sends create neither messages nor outbox events.
- Blocking preserves previously accepted history and unread state.
- Check current blocking before live forwarding. Events skipped because messaging is currently blocked are not retained for automatic delivery after unblocking.
- Messages accepted before blocking remain part of historical conversation data.

Resolve deleted users by immutable user ID. Display `Deleted User` when User Service returns a tombstone, omit the username line when the username is null, and retain the conversation and its messages.

Exclude tombstones from search, reject new conversations with them, and reject new messages to them. Reusing a deleted account's former username must not reconnect its history to the replacement account.

Check authoritative recipient status before accepting new messages and before live delivery. If identity/status validation is unavailable, fail closed rather than accepting a new send against stale identity data.

### Unread state and active conversations

Represent read state using each participant's persisted last-read sequence:

- An incoming message beyond that sequence is initially `UNREAD`.
- Opening a visible, focused thread advances the reader's cursor through the history response's current sequence boundary, marking all existing unread messages through that boundary `READ`.
- Incoming messages in an active thread trigger an immediate read update after client processing.
- Sending from an active thread also acknowledges the incoming messages already presented there.
- Keep the displayed unread count at zero for the active thread. Persist read updates and propagate them to the reader's other tabs/devices.
- Hidden, unfocused, closed, or disconnected threads do not automatically advance the cursor.
- Own outgoing messages never contribute to the caller's unread count.
- Read updates are monotonic and cannot acknowledge future sequences.

If an automatic read update fails, resynchronize it when connectivity returns. Do not invent successful persistence or silently discard missed messages.

## Interfaces and external prerequisites

### Authentication and User Service contracts

Use User Service's existing `GET /v1/users/me` to validate the current bearer session and active account. Use its public JWKS for local RS256 signature/issuer/audience/expiry verification. Do not copy User Service private keys or import its business-logic modules.

For browser WebSockets, send the in-memory bearer token in the first authentication frame, within five seconds of connection acceptance. Validate the allowed origin and send no chat data before authentication succeeds. Tokens must not appear in URLs or logs.

Revalidate current authentication for protected commands and before forwarding protected content. Close expired or rejected sessions; the frontend uses the existing refresh flow before reconnecting.

The following are proposed external contracts, not existing capabilities:

The [User Service chat integration interface plan](../user-service/PLAN.md) details their implementation, authentication, request/response contracts, and acceptance checks. User Service owns that work.

| Proposed User Service interface | Required behaviour |
|---|---|
| `GET /v1/internal/chat/users?username=...&cursor=...&limit=...` | Service-authenticated, caller-authorized partial username search. Return active users' IDs/usernames and continuation metadata only. |
| `POST /v1/internal/chat/participants` | Service-authenticated batch lookup of immutable IDs. Return ID, current `displayName`, nullable username, and `ACTIVE`/`DELETED` status; distinguish unknown IDs from tombstones. |

Use a dedicated Chat Service identity secret for local integration. These contracts must not expose email, credentials, administrative account details, or User Service database access.

Document dependency errors, timeouts, and contract validation. Contract fakes are permitted in tests; the production integration must use real User Service interfaces before Sprint 3 completion is claimed.

### Chat HTTP contract

All endpoints require a current authenticated participant unless marked operational. Reuse the established error envelope with stable code, safe message, correlation ID, and optional field errors.

| Endpoint | Behaviour |
|---|---|
| `GET /health/live`, `GET /health/ready` | Liveness and database/schema readiness. Surface delivery dependency degradation without exposing configuration secrets. |
| `GET /v1/chat/users?username=...` | Proxy the limited username-search contract with pagination. |
| `POST /v1/chat/conversations` | Accept `recipientUserId`; create or return the unique pair's conversation. Reject self, unknown/deleted recipients, and blocked creation. |
| `GET /v1/chat/conversations` | Paginated caller-owned conversation summaries, including the counterpart's user ID, current `displayName`, and nullable username for the primary name and smaller `@<username>` label. |
| `GET /v1/chat/conversations/{id}` | Participant-only thread metadata and current messaging availability. |
| `GET /v1/chat/conversations/{id}/messages` | Latest/older/catch-up history. Default and maximum page size: 50. `beforeSequence` and `afterSequence` are mutually exclusive. |
| `POST /v1/chat/conversations/{id}/read` | Advance the caller's cursor through a valid `upToSequence`; return authoritative unread state. |
| `GET /v1/chat/blocks` | List the caller's blocks for accessible unblock management. |
| `PUT /v1/chat/blocks/{userId}` | Idempotently block another user. |
| `DELETE /v1/chat/blocks/{userId}` | Idempotently remove the caller's block. |

Return a non-disclosing not-found response for conversation IDs inaccessible to the caller. Validate membership independently on every operation.

### WebSocket contract

Use `/v1/chat/ws`, one connection per browser tab. FastAPI supports WebSocket handlers and dependency-based validation. [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/).

| Direction | Frames |
|---|---|
| Client to server | `authenticate`, `message.send`, `conversation.read`, `ping` |
| Server to client | `ready`, `message.accepted`, `message.created`, `conversation.updated`, `unread.updated`, `sync.required`, `pong`, `error` |

Commands carry a request ID. `message.send` additionally carries conversation ID, client message ID, and text; sender identity always comes from authentication.

Use bounded outgoing connection buffers. Disconnect a slow client with a recoverable reason rather than allowing unbounded memory growth. The client reconnects with backoff, reauthenticates, reloads summaries, and catches up by sequence.

Deduplicate optimistic messages, acceptance replies, and live events using persisted message IDs/client message IDs. Detect sequence gaps and retrieve missing messages before presenting a complete ordered thread.

## Incremental implementation phases

Each phase ends with automated verification and a human-verifiable result. Use command-line HTTP/WebSocket clients for backend checks. The chat UI begins only after the backend completion gate.

### Phase 0 - Runnable foundation and isolated database

Create the service package, configuration, Docker entrypoint, async database/session handling, redacted logging, correlation IDs, health endpoints, Supabase configuration, and canonical migrations.

Add the isolated schema, constraints, indexes, runtime grants, optional Compose profile, and independently restartable chat outbox command. Extend CI change detection and backend validation for chat.

**Human check:** start the local database and container, verify readiness, reset migrations from scratch, and confirm restarting the API preserves records.

### Phase 1 - Identity integration and private conversations

Implement current-session validation, the external User Service client contracts, partial username search, create/reopen, conversation summaries, participant authorization, and paginated history.

Handle tombstone identity display without transferring history to reused usernames.

**Human check:** users A and B find each other and receive the same conversation when reopening. User C cannot access it. Partial search returns all matching active accounts across pages.

### Phase 2 - Validated, idempotent message transactions and blocking

Implement the message application layer with real PostgreSQL transactions, sequence allocation, retry-ID handling, validation, and atomic message/outbox insertion.

Implement block/unblock and recipient-status checks before exposing sending through the live protocol.

**Human check:** accept valid text, reject invalid boundaries, repeat a retry ID without additional persistence, reject messages in both directions while blocked, and preserve history after blocking or deletion.

### Phase 3 - WebSocket sending and RabbitMQ delivery

Implement authentication frames, correlated send results, outbox publication/retry, per-instance event consumption, participant-specific forwarding, and connection cleanup.

Handle accepted messages when RabbitMQ is unavailable: storage remains durable and publication resumes after recovery.

**Human check:** connect users through two Chat Service instances and exchange messages. Interrupt RabbitMQ and restart the publisher; accepted messages remain stored, retries recover, and persistence contains no duplicates.

### Phase 4 - Unread state and reconnect recovery

Implement read cursors, initial unread state, open-thread read updates, active-thread automatic reads, multi-tab unread synchronization, sequence-based catch-up, and broker-recovery resynchronization.

**Human check:** messages accumulate unread while the recipient is inactive. Opening the thread clears current unread messages. Visible/focused activity keeps the badge at zero; backgrounding restores unread accumulation.

### Phase 5 - Backend completion gate

Complete integration and failure tests against real PostgreSQL, RabbitMQ, and multiple running API processes. Verify production paths use the actual User Service contracts.

Cover rollback, lost acknowledgements, concurrent retries, concurrent block/send operations, duplicate/out-of-order events, database/broker interruption, expired/revoked sessions, deleted accounts, and unauthorized access.

Record baseline acceptance, publication, delivery, and history-query timings without claiming Sprint 4 performance compliance.

**Human check:** run a repeatable backend demonstration with active users, an outsider, and a deleted counterpart. Proceed to the chat UI only when backend checks pass.

### Phase 6 - Final chat UI and integrated Sprint 3 acceptance

Implementation and verification: [Phase 6 UI evidence](docs/ui-verification.md).

Add protected `/messages` and `/messages/:conversationId` routes, shared navigation access, API/WebSocket clients, conversation list, username search, thread history, composer, retry, and block/unblock.

Reuse `WorkspaceShell`, `WorkspaceTopbar`, shared design tokens, and the project's Figma design authority. Use a desktop list/thread layout and a single-pane mobile flow with back navigation.

In each conversation-list entry, show the counterpart's current display name prominently and `@<username>` beneath it in smaller text. Display names are not unique; retain immutable user IDs for selection and use the username line to distinguish accounts with the same display name.

Add Vite and Nginx chat routing before the generic User Service route. Support WebSocket upgrade headers, suitable connection timeouts, and optional-profile upstream resolution.

Provide distinct pending, sent, failed, and received presentation. Preserve failed text and retry identity; show clear blocked/deleted-recipient and reconnect states. Apply the 4,096-code-point check consistently with the backend.

Implement focused/visible thread detection and automatic read updates. Keep search live so the normal flow uses three task actions: enter a username query, select the result, compose/send a message. No separate conversation-creation confirmation is required.

**Human check:** complete the flow between two real signed-in browsers, including reload, retry, blocking, deletion, keyboard navigation, and a 360 px viewport without horizontal scrolling.

## Acceptance, verification, and deferred work

### Sprint 3 requirement mapping

| Requirements | Acceptance evidence |
|---|---|
| `N1F1.1`, `.1.1`-`.1.3` | One-to-one messaging, partial username search, unique conversation reopening, and outsider denial. |
| `N1F1.2`, `.2.1`, `.2.3`, `.2.4` | Persistent state/history, conversation summaries with current display names and smaller `@<username>` labels, timestamped chronological messages, and bounded pagination. |
| `N1F1.2.2`-`.2.2.4` | Initial unread state, open-thread clearing, active-thread automatic reads, zero active-thread badge, and cross-session persistence. |
| `N1F1.3`-`.3.4` | Directional block management, bilateral send prevention, permitted sending after mutual unblock, and no automatic replay of rejected messages. |
| `N1F1.4`-`.4.3` | Empty/whitespace rejection, raw 4,096-character boundary, and outer-only trimming. |
| `N1F1.5`-`.5.2` | Clear send results, actionable retry, and duplicate-safe persistence. |
| `N1F1.6`-`.6.5` | Retained/reopenable tombstone history, excluded deleted search results, and denied new conversations/messages. |
| `N1NFR3.1` | Three-task-action search-to-send flow. |
| `N1NFR3.2` | Distinct sent, failed, and received states plus retry. |
| `N1NFR3.3` | Desktop and 360 px mobile verification without horizontal scrolling. |
| `N1NFR3.4` | Keyboard-accessible search, open, send, block/unblock, and clear accessible labels. |

### Required test scenarios

- Concurrent conversation creation produces one pair conversation with exactly two participants.
- Third-party HTTP and WebSocket access fails without revealing message content.
- Test raw lengths 4,095, 4,096, and 4,097, including supplementary Unicode characters and excess outer whitespace. Preserve internal whitespace and newlines.
- Transaction rollback leaves neither a message nor an outbox event.
- A lost acceptance reply followed by retry returns the original persisted message.
- Concurrent retries and repeated RabbitMQ events produce no duplicate persistence or rendered bubbles.
- Block in either direction prevents sending; removing one of two blocks remains insufficient.
- Blocked/deleted-recipient failures do not become queued sends.
- Tombstone histories survive restart, and username reuse does not inherit conversations.
- Conversation lists show the current display name and smaller `@<username>` line, reflect display-name changes after reloading the list, distinguish accounts sharing a display name by username, and omit the username line for tombstones.
- Opening a thread clears all unread messages through its snapshot boundary, including older messages outside the initial page.
- Focus loss, reconnection, multiple tabs, and concurrent incoming messages preserve correct read cursors.
- Initial 50-message retrieval does not load the full history; older and catch-up pages remain ordered.
- Broker restart and consumer resubscription trigger recovery for clients whose WebSockets remained connected.
- Backend tests, migration reset, container smoke checks, frontend lint/build, component tests, and real two-browser end-to-end checks pass.
- Verify keyboard use and viewport widths of 360, 768, 1024, and 1440 px.

### Deferred Sprint 4 requirements

Record these as future acceptance targets, without implementing unrelated Sprint 4 work:

- Ongoing errand status and counterpart requester/courier context.
- At least 1,000 concurrent chat connections.
- Sustained 25 text messages/second for 15 minutes without message loss or duplicate persistence.
- Formal verification of latest-50-message retrieval.
- p95 text-message delivery within one second.
- p95 conversation-list and latest-50-history loading within two seconds.

Sprint 3 supplies indexed pagination, asynchronous I/O, cross-instance event routing, and timing instrumentation needed for that later verification. It does not claim those scale or performance targets have been achieved.
