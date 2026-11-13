# Notification Service

The participant UI has two notification channels. Errand lifecycle records remain in the durable
bell inbox and also produce five-second in-app push cards. Private chat-message records produce
only push cards and are excluded from the bell list and unread count. `GET
/api/notifications/me/push` uses a server-time cursor so every frontend can poll without replaying
old cards after navigation; Admin mode does not mount the push surface.

> Turns committed Order, Credit, and Chat events into private, durable in-app notifications.

Notification Service is a Java 17 Spring Boot service with a React frontend. It consumes
producer-owned Kafka events, stores recipient-scoped notifications in its private PostgreSQL
database, and serves the notification page and unread badge. It runs on port `8086` and is exposed
through the gateway under `/api/notifications/**` and `/notifications`.

## Responsibilities and boundaries

- **Notification owns** event mapping, inbox deduplication, reminder scheduling, retention,
  notification persistence, the retrieval API, and the notifications UI.
- **Order, Credit, and Chat own source facts.** Notification reacts only to committed events and
  never changes an order, calculates a balance, or reads a private conversation.
- **User owns identity.** Every API recipient is the verified JWT `sub`; no caller can select
  another user's inbox.
- **No direct service reads.** Notification does not call another service or inspect another
  service's database.
- **In-app delivery only.** Email, push, SMS, verification messages, Chat content, translation,
  and Admin-case policy are outside this service's scope.

A notification confirms a committed source fact, not an attempted action. In-app notifications
wait durably until the recipient next opens FoC; there is no external delivery fallback. See
[DESIGN.md](DESIGN.md#fallback) for the approved rationale.

Owner: **XueTing**. See [AGENTS.md](AGENTS.md) for service invariants and
[TASK_SPLIT.md](../TASK_SPLIT.md) for team ownership.

## Documentation map

| Document | Purpose |
| --- | --- |
| [DESIGN.md](DESIGN.md) | Notification decisions, iteration plan, and acceptance rules |
| [Contract package](../docs/contracts/README.md) | Shared schemas, examples, and validation commands |
| [Event communication blueprint](../docs/integration/event-communication-blueprint.md) | Event envelopes, retries, and recovery ownership |
| [Kubernetes guide](k8s/README.md) | Local cluster deployment and network policy |

## Quick start

Prepare the root `.env` from `.env.example`, including the Notification database and Kafka
credentials, then start the service and gateway from the repository root:

```bash
docker compose up -d --build notification-service gateway
```

Open the UI at <http://localhost:8088/notifications>. For service tests, ensure Docker is running
and run `./mvnw test` from `notification-service/`. See
[Running with Docker Compose](#running-with-docker-compose) and [Verification](#verification) for
details.

## HTTP API

### Authentication

All endpoints except `/actuator/health` and the OpenAPI docs require a `Bearer` JWT issued by the
**User Service**, verified exactly as Order Service does (see the
[User JWT contract](../user-service/README.md#login-and-jwt-verification)): RS256 against the
published JWKS, `iss` = `friend-on-campus-user-service`, `aud` contains `friend-on-campus-api`,
valid `exp`/`nbf`, a supported `role` and a UUID `sub`.

- **The recipient is the token's `sub`.** No parameter, header or body field can name another user,
  and there is no admin endpoint for all users' notifications.
- **Any session role may read** (`REQUESTER`, `COURIER` or `ADMIN`): notifications belong to the
  account, so switching role keeps both kinds visible. An admin reads only their own.
- **Rejections:** a missing or invalid token returns `401` RFC-7807 `application/problem+json`
  with `WWW-Authenticate: Bearer`. Any method or path outside the API below returns `403`; see
  [Errors](#errors).

| Property | Env var | Default |
| --- | --- | --- |
| `app.security.jwt.jwk-set-uri` | `NOTIFICATION_JWT_JWK_SET_URI` | `http://localhost:8081/.well-known/jwks.json` |
| `app.security.jwt.issuer` | `NOTIFICATION_JWT_ISSUER` | `friend-on-campus-user-service` |
| `app.security.jwt.audience` | `NOTIFICATION_JWT_AUDIENCE` | `friend-on-campus-api` |

### List my notifications

`GET /api/notifications/me?page=&size=` (shared contract operation
`notification_get__api_notifications_me` in [n2h.openapi.json](../docs/contracts/n2h.openapi.json))

- `page` is zero-based (default `0`); `size` is 1–100 (default `20`). A malformed or out-of-range
  value returns `400` with `code` = `INVALID_QUERY`.
- Newest first by `occurredAt`, when the fact happened, not when it was stored, so events caught up
  after downtime still appear in real-time order; the notification ID breaks ties so pages never
  overlap. Pagination does not imply a 100-record storage cap.
- **Success:** `200` with the page:

```json
{
  "content": [
    {
      "id": "0f8b7d2e-4c1a-4a8e-9f33-1d2c3b4a5e6f",
      "type": "CREDITS_RECEIVED",
      "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
      "message": "You received 3 credits for completing an errand.",
      "occurredAt": "2026-10-30T09:15:00Z",
      "readAt": null
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

`orderId` is the errand to link to (`/errands/{orderId}`), or `null` for account-level
notifications; the link grants no access by itself, Order still authorizes the errand page.
`readAt` is `null` until the user marks it read. The message is built when read from the stored
type and template values, so wording can change without rewriting past notifications:

| `type` | `message` |
| --- | --- |
| `CREDITS_WELCOME` | Welcome! You received {n} credits to get started. |
| `CREDITS_RECEIVED` | You received {n} credits for completing an errand. |
| `CREDITS_COMPENSATED` | You received {n} credits as compensation for a cancelled errand. |
| `ORDER_OPENED` | Your errand "{title}" is live. Couriers can now accept it. |
| `ORDER_RESERVATION_FAILED` | Your errand "{title}" couldn't be posted: {reason}. |
| `ORDER_ACCEPTED` | A courier accepted your errand "{title}". |
| `ORDER_COURIER_WITHDREW` | Your courier withdrew from "{title}". It's open for other couriers again. |
| `ORDER_EXPIRED` | Your errand "{title}" expired before pickup. Your reserved credits are being returned. |
| `ORDER_CANCELLED` | The requester cancelled "{title}". |
| `ORDER_PICKED_UP` | Your courier picked up "{title}". |
| `ORDER_DELIVERED` | Your courier delivered "{title}". Please confirm you received it. |
| `ORDER_COMPLETED` | The requester confirmed they received "{title}". |

`{n} credits` reads `1 credit` for one. `{reason}` is "you don't have enough credits"
(`INSUFFICIENT_CREDITS`), "your credit account isn't set up yet" (`CREDIT_ACCOUNT_NOT_FOUND`),
"Credit didn't confirm your credits in time" (`CREDIT_RESERVATION_TIMEOUT`), or "the credits
couldn't be reserved" for any other code; free text is never shown.

### Mark one read

`PATCH /api/notifications/me/{id}/read` (shared contract operation
`notification_patch__api_notifications_me_id_read`), no request body.

- **Success:** `200` with the notification in the same shape as a list entry, with `readAt` set.
- **Idempotent:** the first call sets `readAt` to the server time; repeating it returns the same
  notification with the original `readAt`. Concurrent calls all return the first `readAt`.
- **Not yours or missing:** `404` with `code` = `NOTIFICATION_NOT_FOUND`. Another user's notification
  is reported exactly like a missing one and is left unchanged.
- **Malformed ID:** `400` with `code` = `INVALID_ID`.

There is no mark-all-read or mark-unread operation.

### Unread count

`GET /api/notifications/me/unread-count` (shared contract operation
`notification_get__api_notifications_me_unread_count`, schema `UnreadCount`) returns `200` with
`{"unreadCount": 3}`: the caller's notifications with no `readAt`, for the bell badge. Served by
the partial index `ix_notifications_recipient_unread`.

### Errors

All errors are RFC-7807 `application/problem+json`.

| `code` | Status | When |
| --- | --- | --- |
| `INVALID_QUERY` | 400 | A malformed or out-of-range `page` or `size` |
| `INVALID_ID` | 400 | A notification ID that is not a UUID |
| `NOTIFICATION_NOT_FOUND` | 404 | No such notification for the caller, including another user's |
| — | 401 | Missing or invalid bearer token (`WWW-Authenticate: Bearer`) |
| — | 403 | Any method or path outside this API |

## Frontend

The UI lives in `frontend/` (React, Vite, TypeScript, React Query), is packaged into the jar like
the other services' UIs, and is served at `/notifications` with assets under
`/notification-assets/`; the gateway routes both here. The page needs no token to load; every API
call it makes does.

- **The page** lists the caller's notifications newest first, 20 at a time with **Load more**.
  Unread items say "Unread" in text as well as a coloured edge. **Open errand** marks an item read
  and goes to `/errands/{orderId}` (it still opens if marking read fails); **Mark as read** marks
  it without leaving. Account-level items have no errand link. There is no mark-all-read.
- **States:** placeholders while loading; "No notifications yet." with **Browse errands** when
  empty; "Couldn't load your notifications." with **Try again** on error; "Your session has ended"
  with **Sign in again** (returning to `/notifications`) when signed out or the session expired.
- **The header bell** is in every frontend's header, between the role selector and the account
  menu (root `design.md` "Shared application shell"): a link to `/notifications` with the unread
  count, `9+` above nine, also in its accessible name. `src/components/NotificationBell.tsx` and
  `useUnreadCount.ts` are copied unchanged into each frontend; `test_ui_design_contract.py` fails
  if a copy differs.
- **Polling** (DESIGN.md "Polling"): only `GET /api/notifications/me/unread-count`, every 30 s while
  the tab is visible, at once when it becomes visible again or the page marks one read; after a
  failure the wait doubles up to 5 minutes and the last count stays. A 401 or sign-out stops it.

Build and test the UI from `frontend/` with `npm ci`, `npm run lint`, `npm run typecheck`,
`npm test` and `npm run build`. `npm run dev` serves it on port `5178` against a local service.

## Event consumers

All consumers use the dedicated `notification-service` consumer group. Every event is validated
against its producer-owned contract, recorded in the inbox, mapped at most once per business
outcome, and acknowledged only after the database transaction commits.

### Credit events

The service consumes `credit.events` as group `notification-service`, using the shared
[event communication blueprint](../docs/integration/event-communication-blueprint.md) envelope.
It never shares Order, Credit or Chat consumer groups.

| Credit event | Recipient | `type` | `orderId` | Template value |
| --- | --- | --- | --- | --- |
| `CreditAccountAllocated` | `data.userId` | `CREDITS_WELCOME` | `null` | `amount` = `allocatedAmount` |
| `CreditSettled` | `data.courierId` | `CREDITS_RECEIVED` | `data.orderId` | `amount` = `transferredAmount` |
| `CourierCompensated` | `data.courierId` | `CREDITS_COMPENSATED` | `data.orderId` | `amount` = `transferredAmount` |
| Any other type | nobody | — | — | inbox row `IGNORED` |

The requester is not told about `CourierCompensated`: they cancelled, and the actor is never
notified. Credit ledger amounts come from Credit; `CREDITS_RECEIVED`/`COMPENSATED` are never
generated from Order state alone.

**Processing, in one transaction:**

1. Parse the event. `eventId`, `eventType`, `aggregateId` and `correlationId` are required and
   `producer` must be `credit-service`. For the three events above, `eventVersion` must be `1`,
   `aggregateType` must be `User` (allocation) or `Order`, `aggregateId` must equal
   `data.userId`/`data.orderId`, `occurredAt` must be ISO-8601, the recipient and `operationId`
   must be UUIDs and the amount a positive whole number.
2. Look up the inbox (`notification_inbox`) by `eventId`. The same content again is a duplicate and
   changes nothing; the same `eventId` with different content is rejected as `EVENT_ID_CONFLICT`.
3. Look up the business key: recipient, type and `operationId`. Credit gives each outcome a fresh
   `eventId`, even when it reprocesses an operation it already applied, so a reconciliation replay
   arrives as a new event. If this recipient was already notified for this operation, no second
   notification is stored and the inbox row is `DUPLICATE_OPERATION` (logged as a warning if the
   values differ).
4. Insert the notification (if any) and the inbox row (`NOTIFIED`, `IGNORED` or
   `DUPLICATE_OPERATION`), then commit. The listener acknowledges Kafka only after the commit.

**Failures:** a rejected event (`INVALID_EVENT` or `EVENT_ID_CONFLICT`) stores nothing, is logged
with its `eventId`, `eventType`, `correlationId` and reason, and goes straight to
`credit.events.DLT` without retries. Any other failure (for example the database is down) is
retried three times with backoff and then goes to the DLT. Dead letters keep the original key and
carry Spring's headers naming the `notification-service` group and the exception, which tells them
apart from Order's dead letters on the same topic. A valid unhandled fact is acknowledged as
`IGNORED`; invalid event types or versions never silently disappear.

`NOTIFICATION_KAFKA_ENABLED=false` runs the service without a broker; nothing is then consumed.

| Property | Env var | Default |
| --- | --- | --- |
| `spring.kafka.bootstrap-servers` | `KAFKA_BOOTSTRAP_SERVERS` | `localhost:29092` |
| `spring.kafka.security.protocol` | `KAFKA_SECURITY_PROTOCOL` | `SASL_PLAINTEXT` |
| `spring.kafka.properties.sasl.mechanism` | `KAFKA_SASL_MECHANISM` | `PLAIN` |
| Kafka username / password | `KAFKA_USERNAME` / `KAFKA_PASSWORD` | `notification_service` / empty |

### Order lifecycle events

The service consumes `order.lifecycle.events` as group `notification-service`: one `OrderTransitioned`
per committed Order transition, in the shared shape
([n2h-events.schema.json](../docs/contracts/n2h-events.schema.json)) that Chat also consumes. The
tests validate their events, and the shared `events.examples.json` fixture, against that file.

| `action` (transition) | Recipient | `type` |
| --- | --- | --- |
| `OPEN` to `OPEN` (Credit reserved) | requester | `ORDER_OPENED` |
| `OPEN` to `EXPIRED` (reserved after the deadline) | requester | `ORDER_EXPIRED` |
| `FAIL_RESERVATION` | requester | `ORDER_RESERVATION_FAILED` (`params.reason` = `reasonCode`) |
| `EXPIRE` from `PENDING_CREDIT` (Credit did not answer by the credit timeout) | requester | `ORDER_RESERVATION_FAILED` (`params.reason` = `CREDIT_RESERVATION_TIMEOUT`) |
| `ACCEPT` | requester | `ORDER_ACCEPTED` |
| `WITHDRAW` to `OPEN` | requester | `ORDER_COURIER_WITHDREW` |
| `WITHDRAW` to `EXPIRED`, `EXPIRE` from `OPEN` | requester | `ORDER_EXPIRED` |
| `CANCEL` from `ACCEPTED` | `previousCourierId` (the courier the cancellation removed) | `ORDER_CANCELLED` |
| `PICK_UP` | requester | `ORDER_PICKED_UP` |
| `DELIVER` | requester | `ORDER_DELIVERED` |
| `COMPLETE` | `courierId` | `ORDER_COMPLETED` |
| `SUBMIT`, `EDIT`, `CANCEL` from `OPEN`, reward changes | nobody | inbox row `IGNORED` |

The actor (`actor.userId`) is never notified, whatever the table says. A cancellation of an OPEN
errand has no courier to tell. A required recipient that is missing (for example `CANCEL` from
`ACCEPTED` without `previousCourierId`) rejects the event, so it never goes to an arbitrary user.
Every lifecycle notification links to the errand (`orderId`) and stores the errand title from the
snapshot. Credit outcomes are separate: a courier gets both `ORDER_COMPLETED` and `CREDITS_RECEIVED`.

**Processing, in one transaction**, with the same rules as Credit events:

1. Parse and validate: `producer` = `order-service`, `eventType` = `OrderTransitioned`,
   `eventVersion` 1, `aggregateType` `Order`, `aggregateId` = `data.orderId`, ISO-8601 `occurredAt`,
   UUID recipients, `sourceSequence` a whole number of at least 1, and a `snapshot` with a title.
2. Look up the inbox by `eventId`: a redelivery changes nothing; a reused `eventId` with different
   content is `EVENT_ID_CONFLICT`.
3. Look up the business key `orderId:sourceSequence`. Two genuine accept cycles have different
   numbers, so both notify; the same transition published again under a new `eventId` is
   `DUPLICATE_OPERATION`.
4. If `sourceSequence` is more than one above the highest seen for the order, log a warning with
   both numbers. The event is still handled; a missing transition is never guessed.
5. Insert the notification (if any) and the inbox row, which also stores `source_sequence`, then
   commit; Kafka is acknowledged after the commit.

**Failures:** a rejected event goes straight to `order.lifecycle.events.DLT` without retries; any
other failure is retried three times with backoff first. Dead letters keep the original key and
name the `notification-service` group.

### Chat messages

Notification consumes `ChatMessageSent` from `chat.events` in the same independent
`notification-service` group. Chat supplies the recipient from its current private conversation
membership; Notification never reads Chat's database or guesses participants. The stored type is
`CHAT_MESSAGE_RECEIVED`, deep-linked to the errand, with Chat's notification preview (at most 160
characters). Image messages use “Image sent in chat”. Notification stores only this bounded preview;
the complete private message body and all image content and metadata remain in Chat.

The inbox deduplicates by event ID and the notification business key is the Chat message ID, so a
Kafka redelivery or controlled republish cannot notify twice. Invalid events retry only according
to the standard listener policy and then go to `chat.events.DLT`. Chat `SYSTEM` lifecycle entries
are intentionally excluded: Order's existing lifecycle notifications already cover them.

## Pickup reminders

Notification also reminds people before an errand's pickup deadline, using only the
`OrderTransitioned` events above: `snapshot.pickupDeadline`, `toState`, `requesterId` and
`courierId`. Order is not called and has no reminder logic.

| `type` | Recipient | When | While the errand is |
| --- | --- | --- | --- |
| `ORDER_STILL_OPEN` | requester | 30 minutes before pickup | `OPEN` with no courier |
| `PICKUP_DUE_SOON` | assigned courier | 15 minutes before pickup | `ACCEPTED` |
| `PICKUP_OVERDUE` | assigned courier | at the pickup deadline | `ACCEPTED` |

Texts give the deadline in campus time (Asia/Singapore), adding the date when it is not the day of the
reminder: *Nobody has accepted "Buy coffee" yet, and pickup closes at 3:00 pm. Raising the reward or
moving the pickup time later can help a courier take it.* / *Pick up "Buy coffee" by 3:00 pm, about 15
minutes from now.* / *You're past the pickup time for "Buy coffee". Pick it up now, or withdraw so it
can reopen.* Each one links to the errand and counts towards the bell like any other notification.

**Arming, moving and cancelling** happens in the same transaction as each lifecycle event. After every
event the errand's reminders are brought in line with its new state: anything the state no longer
wants is cancelled (pickup, withdrawal, cancellation, expiry, a different courier), and anything it
wants is armed. Moving the deadline with an `EDIT` cancels the old reminder and arms one for the new
deadline, so an extended errand is reminded again. A reminder whose time has already passed when it
would be armed is skipped, not sent at once (an errand posted 20 minutes before pickup gets no
`ORDER_STILL_OPEN`). Each recipient is reminded at most once per type and deadline.

**Ordering:** `notification_reminder_progress` keeps the highest `sourceSequence` applied per errand. An
event no newer than that (a redelivery, a replay under a new `eventId`, a late duplicate) changes no
reminder, so a cancelled reminder is never re-armed.

**Sending:** a job every minute claims due reminders with `FOR UPDATE SKIP LOCKED` and, per batch in one
transaction, stores each as a notification (source and business key `reminder:{id}`) and marks it
`SENT`; several instances never send one twice. A reminder reached more than 30 minutes after its time
(the service was down) is marked `MISSED` and not sent. Settled reminders and idle progress rows are
deleted after 30 days.

| Setting | Variable | Default |
| --- | --- | --- |
| Turn sending off (reminders are still kept up to date) | `NOTIFICATION_REMINDERS_ENABLED` | `true` |
| Drop a reminder this late | `NOTIFICATION_REMINDERS_MAX_LATENESS` | `30m` |
| Keep settled reminders | `NOTIFICATION_REMINDERS_RETENTION` | `30d` |
| Batch size (1–1000) | `NOTIFICATION_REMINDERS_BATCH_SIZE` | `100` |
| Interval | `NOTIFICATION_REMINDERS_INTERVAL_MS` | `60000` |

## Data model and delivery guarantees

Flyway `V1__create_notifications.sql` (tables), `V2__retention_indexes.sql` (indexes for the
retention job) and `V3__lifecycle_source_sequence.sql` (the inbox's `source_sequence`). Applied
migrations are never edited; changes go in a new migration.

- **`notification_inbox`**: `event_id` (primary key), `topic`, `event_type`, `aggregate_id`,
  `correlation_id`, `fingerprint` (SHA-256 of the envelope), `outcome`
  (`NOTIFIED`/`IGNORED`/`DUPLICATE_OPERATION`), `processed_at`, and `source_sequence` for Order
  lifecycle events (null for Credit).
- **`notifications`**: `id` (opaque UUID), `recipient_id`, `type`, `order_id`, `params` (JSONB
  template values), `source_event_id`, `business_key`, `occurred_at`, `created_at`, `read_at`
  (null = unread). `UNIQUE (recipient_id, type, business_key)` enforces one notification per
  business outcome; `UNIQUE (source_event_id, recipient_id)` is a second guard. There is no foreign
  key to the inbox, so inbox rows can be pruned sooner than notifications.

Inbox and notifications commit atomically before the Kafka ack, so a crash after commit or a source
replay creates no second logical notification. Past delayed facts are retained rather than
discarded on a generic "older version" check, and gaps are never treated as permission to guess
transitions. No profile data, balances, tokens or full event payloads are stored, and the API never
returns another user's data.

**Retention** (approved, [DESIGN.md](DESIGN.md#decisions)), enforced by a job every hour:

| Rule | Deleted when | Default |
| --- | --- | --- |
| Read notifications | `read_at` is more than the period ago | 30 days |
| Every notification, read or not | `created_at` is more than the period ago | 90 days |
| `notification_inbox` rows | `processed_at` is more than the period ago | 30 days |

A row exactly at the limit is kept. The inbox period can never be set below 30 days, the DLT
replay window, so deduplication data always outlives a replayable record: startup fails instead.
Each rule deletes in batches, each in its own short transaction, choosing rows with
`FOR UPDATE SKIP LOCKED`, so several instances can run it at once without waiting on or
double-counting each other. Each run logs one line with the three counts and its duration.

| Setting | Env var | Default |
| --- | --- | --- |
| Turn the job off | `NOTIFICATION_RETENTION_ENABLED` | `true` |
| Read notifications | `NOTIFICATION_RETENTION_READ` | `30d` |
| Every notification | `NOTIFICATION_RETENTION_ALL` | `90d` |
| Inbox rows (minimum `30d`) | `NOTIFICATION_RETENTION_INBOX` | `30d` |
| Batch size (1–10000) | `NOTIFICATION_RETENTION_BATCH_SIZE` | `500` |
| Interval | `NOTIFICATION_RETENTION_INTERVAL_MS` | `3600000` (one hour; the first run is a minute after startup) |

## Non-functional requirements and acceptance

D3 NF1: at least 99% valid retrieval success over a 30-minute normal-load run; separately classify
unrelated auth/gateway/dependency failures and retain observable outcomes. D3 NF2: for a user with
up to 100 stored notifications, P95 retrieval <=2 seconds, measured request receipt to returned
data, not event-processing time. Agree/record normal-load concurrency and hardware before testing;
these slides do not specify them. Do not invent a 2,000-user commitment.

Automated coverage includes Credit and Order mappings, safe reason rendering, redelivery and
business-operation deduplication, `EVENT_ID_CONFLICT`, invalid event delivery to DLTs, sequence-gap
handling, pickup reminders, retention, paging limits, recipient isolation, JWT/role access,
idempotent and concurrent read marking, the unread count, and SPA routing. PostgreSQL and Kafka
integration tests use the real Flyway migrations through Testcontainers.

Manual real-broker acceptance covers the complete create/accept/withdraw/pickup/deliver/complete
journey, rejected reservations, expiry, cancellation compensation, independent two-user inboxes,
and consumer outage/replay. Record the hardware and normal-load concurrency with any NF1/NF2
result; the requirements do not imply an unapproved user-volume commitment.

## Running with Docker Compose

Notification Service and its private database (`notification-db`, host port `127.0.0.1:5437`) are
part of the root `compose.yaml`. Put `NOTIFICATION_DB_NAME`, `NOTIFICATION_DB_USER`,
`NOTIFICATION_DB_PASSWORD` and `KAFKA_NOTIFICATION_SERVICE_PASSWORD` in the root `.env` (see
`.env.example`); Compose also requires the other services' variables. Then:

```bash
docker compose up -d --build notification-service gateway
```

The service listens on `127.0.0.1:8086` (override with `NOTIFICATION_HOST_PORT`) and is reached
through the gateway at `http://localhost:8088/api/notifications/**`. It verifies tokens with User
Service's JWKS inside the Compose network and consumes `credit.events` as Kafka identity
`notification_service`, group `notification-service`. The gateway does not wait for it, so
`/api/notifications/**` returns a gateway error until it is up.

## Running locally

To run it outside Compose, use your own PostgreSQL database:

```bash
DB_HOST=localhost DB_PORT=5432 DB_NAME=notification_db DB_USER=... DB_PASSWORD=... \
NOTIFICATION_KAFKA_ENABLED=false ./mvnw spring-boot:run
```

To consume the Compose broker from the host instead, set `KAFKA_BOOTSTRAP_SERVERS=localhost:29092`,
`KAFKA_PASSWORD` to `KAFKA_NOTIFICATION_SERVICE_PASSWORD` and leave `NOTIFICATION_KAFKA_ENABLED` on.

## Verification

```bash
./mvnw test          # unit, web and security tests, plus PostgreSQL and Kafka integration tests
./mvnw verify        # full build
```

The integration tests start a throwaway PostgreSQL and Kafka with Testcontainers, so **Docker must
be running**. They apply the real Flyway migration.

## Ownership and handoffs

XueTing owns the consumers, inbox and mapping, and Notification's Kafka identity, ACLs, topics,
DLTs, broker credentials, Kubernetes, and Compose/CI wiring, checked with `compose_env_check`.
XueTing also implements Order lifecycle producer coverage in Order. Eldridge approves Credit and
Chat payloads; no financial or conversation-storage changes belong here. Darryl edits the shared
contract package. Existing Admin case notifications remain deferred.
