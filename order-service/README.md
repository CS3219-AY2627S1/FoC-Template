# Order Service

> Owns campus errands from creation and credit reservation through acceptance, delivery, and
> completion.

Order Service is a Java 17 Spring Boot service that owns the order aggregate, lifecycle history,
discovery APIs, expiry, concurrency rules, and Order-produced events. It runs on port `8082` and
stores its data in a private PostgreSQL database.

## Responsibilities and boundaries

- **Order owns** errand validation, lifecycle transitions, assignment history, discovery,
  idempotency, expiry, and Order event publication.
- **Credit owns** reservations, releases, settlement, compensation, and all ledger arithmetic.
- **Supplier owns** campus locations. Order stores client-supplied location names as historical
  snapshots and never reads Supplier's database.
- **User owns** identity, roles, and current account status. Order validates User-issued JWTs and
  performs current-account authorization for protected actions.
- **Notification and Chat consume Order facts.** They do not change Order state.

Owner: **XueTing**. See [AGENTS.md](AGENTS.md) for service invariants and
[TASK_SPLIT.md](../TASK_SPLIT.md) for team ownership.

## Documentation map

| Document | Purpose |
| --- | --- |
| [DESIGN.md](DESIGN.md) | Full lifecycle, transition, and Kafka event design |
| [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) | D3 implementation roadmap and acceptance evidence |
| [Kubernetes guide](k8s/README.md) | Local cluster deployment |
| [Event communication blueprint](../docs/integration/event-communication-blueprint.md) | Shared event envelope and recovery contract |
| [Chat/Admin integration contract](../docs/integration/chat-admin-contract.md) | Evidence export and case integration |

## Quick start

Prepare the root `.env` from `.env.example`, including the required database, signing, and Kafka
values, then start the stack from the repository root:

```bash
docker compose up -d --build
```

Open the frontend at <http://localhost:8088/errands>. For service tests, ensure Docker is running
and run `./mvnw test` from `order-service/`. See [Running with Docker Compose](#running-with-docker-compose)
and [Verification](#verification) for details.

## HTTP API

The gateway exposes the service under `/api/orders/**`. OpenAPI and Swagger documentation are
available from the running service; use the gateway at <http://localhost:8088> for normal
cross-service journeys.

### Authentication

All endpoints except `/actuator/health` and the OpenAPI/Swagger docs require a
`Bearer` JWT issued by the **User Service**. The service is a stateless OAuth2
resource server; it **validates** tokens but never issues them, following the
[User JWT contract](../user-service/README.md#login-and-jwt-verification).

- **Header:** `Authorization: Bearer <jwt>`.
- **Verification:** RS256 signature checked against the User Service public
  JWKS (`/.well-known/jwks.json`); `iss` must be `friend-on-campus-user-service`,
  `aud` must contain `friend-on-campus-api`, and `exp`/`nbf` must be valid.
- **Claims consumed:** `sub` → the caller's user UUID (the requester/courier
  identity); `role` → the single effective session role (`REQUESTER`, `COURIER`
  or `ADMIN`), mapped to `ROLE_<role>`.
- **Identity is taken only from `sub`.** It is never read from the request body
  or a header, so a client cannot impersonate another user by editing a field.
- **Rejections:** a missing, expired, bad-signature, wrong-issuer, wrong-audience,
  missing/unsupported-role, or non-UUID-`sub` token returns `401` RFC-7807
  `application/problem+json` with `WWW-Authenticate: Bearer`; a valid token whose
  session role is not permitted for the action returns `403`.

**Configuration** (no shared secret; only the public JWKS is needed):

| Property | Env var | Default |
| --- | --- | --- |
| `app.security.jwt.jwk-set-uri` | `ORDER_JWT_JWK_SET_URI` | `http://localhost:8081/.well-known/jwks.json` |
| `app.security.jwt.issuer` | `ORDER_JWT_ISSUER` | `friend-on-campus-user-service` |
| `app.security.jwt.audience` | `ORDER_JWT_AUDIENCE` | `friend-on-campus-api` |

The defaults suit a local run beside User Service. Compose sets the JWKS URI to the User Service
inside the shared network.

### Create an order

`POST /api/orders`

- **Auth:** `Bearer` JWT (see above) with session role `REQUESTER`; any other
  role gets `403`. The requester is the token's `sub`.
- **Body fields (client-supplied):**

  | Field | Rules |
  | --- | --- |
  | `title` | required, 1–120 chars (trimmed) |
  | `description` | required, 1–2000 chars (trimmed) |
  | `pickupLocationId` | required UUID (Supplier-owned) |
  | `pickupLocationName` | required, 1–160 chars (trimmed); the name Supplier shows |
  | `dropoffLocationId` | required UUID, must differ from pickup |
  | `dropoffLocationName` | required, 1–160 chars (trimmed) |
  | `creditReward` | required integer, > 0 |
  | `pickupDeadline` | required, must be in the future (ISO-8601) |

- **Optional header `Idempotency-Key`:** 1–64 characters from `A-Z a-z 0-9 - _`
  (a UUID works), chosen by the client for one create request. It makes a retry
  safe, for example after a timeout or a double-click:

  | Request | Result |
  | --- | --- |
  | No key | `201`, a new order every time |
  | New key | `201`, the order is created and remembers the key |
  | Same requester, same key, same body | `200` with the order the first request created, `Location` set; nothing is written, so there is no second `OrderSubmitted` and no second reservation |
  | Same requester, same key, different body | `409` with `code: IDEMPOTENCY_KEY_REUSED`; nothing is written |
  | Malformed key | `400` with `code: INVALID_IDEMPOTENCY_KEY` |

  Keys belong to the requester: another user's identical key is independent.
  "Same body" compares the request as sent (after trimming), with the deadline as an
  instant, so a later edit of the errand does not turn a late retry into a conflict.
  Concurrent requests with one key are serialised, so exactly one creates the order.
  A rejected request (`400`) stores nothing, so the key can be reused once it is fixed.
  Body validation runs first, so a retry sent after the pickup deadline gets the usual
  `400` for the deadline rather than the original order.
  The Order UI sends one key per errand content: posting the same fields again
  reuses it, and changing a field starts a new one.
- **Success:** `201 Created`, `Location: /api/orders/{id}`, body is the created
  order in state `PENDING_CREDIT`.
- **Validation failure:** `400` RFC-7807 `application/problem+json`. Field
  violations are collected under an `errors` map.
- **Unauthenticated:** `401` RFC-7807 `application/problem+json` (no `errors` map)
  when the bearer token is missing or invalid.
- **Forbidden:** `403` RFC-7807 `application/problem+json` when the token is valid
  but the session role is not `REQUESTER`.

### Edit an order

`PATCH /api/orders/{id}`

- **Auth:** session role `REQUESTER` (any other role gets `403`), and the caller
  must be the order's requester.
- **Body:** a full replacement. Every editable field is required, with the same
  rules as [Create an order](#create-an-order) (`title`, `description`,
  `pickupLocationId` + `pickupLocationName`, `dropoffLocationId` +
  `dropoffLocationName`, `creditReward`, `pickupDeadline` in the future), plus
  `version`: the order `version` the client last read (integer ≥ 0).
- **Allowed only while `OPEN`** and no reward change is pending.
- **Details only** (reward unchanged): applied at once, recorded in the history
  as `EDIT`; no event is published.
- **Reward changed:** the other fields apply at once, but `creditReward` stays as
  it was and the new value is stored as `pendingCreditReward`. Order writes one
  `OrderRewardChangeRequested` (`operationId`, `orderId`, `newCreditReward`) and
  the new reward applies **only after Credit confirms** with `CreditAdjusted`
  (history `REWARD_CHANGE_APPLIED`). If Credit answers
  `CreditAdjustmentRejected` (for example `INSUFFICIENT_CREDITS`), the old reward
  stays and the pending value is cleared (history `REWARD_CHANGE_REJECTED`, which
  the client can show as "insufficient credits"). While a change is pending the
  order can't be accepted or edited (`409 REWARD_ADJUSTMENT_PENDING`), but it can
  still be cancelled; cancelling or expiring clears the pending value, and a Credit
  answer that arrives afterwards is recorded but changes nothing.
- **Duplicates:** resending exactly what the order already holds (a pending
  reward counts as the reward) returns `200` with the order unchanged, whatever
  `version` it carries, so a network retry is safe.
- **Checks, in order:** role (`403`) → order exists and is visible (`404`) → an
  overdue `OPEN` order is expired and the edit rejected (`409 ORDER_EXPIRED`) →
  caller is the requester (`403 NOT_ORDER_REQUESTER`) → state is `OPEN`
  (`409 INVALID_STATE_TRANSITION`) → duplicate (`200`) → no pending reward change
  (`409 REWARD_ADJUSTMENT_PENDING`) → `version` matches (`409 VERSION_CONFLICT`,
  with `currentVersion`; reload and retry).
- **Success:** `200` with the order; `version` increases on every applied edit.

### Read and act on an order

| Endpoint | Who | Result |
| --- | --- | --- |
| `GET /api/orders/{id}` | Any signed-in user for an `OPEN` order; otherwise only the requester or assigned courier | `200` with the order, or `404` (`ORDER_NOT_FOUND`) so hidden orders are not revealed |
| `GET /api/orders/{id}/history` | The requester or assigned courier | `200` with every transition, oldest first |
| `POST /api/orders/{id}/cancel` | The requester, in a `REQUESTER` session | `200` with the cancelled order |
| `POST /api/orders/{id}/accept` | Any courier except the requester, in a `COURIER` session | `200` with the accepted order |
| `POST /api/orders/{id}/withdraw` | The assigned courier, in a `COURIER` session | `200` with the reopened or expired order |
| `POST /api/orders/{id}/pickup` | The assigned courier, in a `COURIER` session | `200` with the order in `PICKED_UP` |
| `POST /api/orders/{id}/deliver` | The assigned courier, in a `COURIER` session | `200` with the order in `DELIVERED` |
| `POST /api/orders/{id}/complete` | The requester, in a `REQUESTER` session | `200` with the order in `COMPLETED` |

Cancelling an `OPEN` order releases the full reservation; cancelling an `ACCEPTED`
order clears the courier and asks Credit to compensate them. If several couriers
accept at once, only the first one processed wins. A courier who withdraws before
the pickup deadline puts the order back in the pool; withdrawing at or after the
deadline expires it instead. The courier then picks up and delivers the item
(a late pickup after the deadline is allowed), and the requester confirms
receipt, which settles the full reward to the courier. Repeating an action you
already made (for example a second `complete` after a network retry) returns the
order without any further effect, so the reward is never settled twice.

**Expiry:** an `OPEN` order expires once `now >= pickupDeadline`. A background job
does this every 30 s (`ORDER_EXPIRY_INTERVAL_MS`; turn it off with
`ORDER_EXPIRY_ENABLED=false`), and any action on an overdue `OPEN` order expires
it first and is rejected with `ORDER_EXPIRED`.

**Credit timeout:** the same job ends a `PENDING_CREDIT` order Credit has not
answered by `min(pickupDeadline, createdAt + ORDER_CREDIT_RESERVATION_TIMEOUT)`
(ISO-8601, default `PT2M`). It locks the order, re-checks that it is still
waiting, and moves it to `EXPIRED` with `terminalReason` `CREDIT_RESERVATION_TIMEOUT`,
publishing the normal `OrderExpired` with that `reason` so Credit releases anything
it reserved (Credit records a timeout with no reservation as a no-op). A
`CreditReserved` or `CreditReservationRejected` answering that order's
`OrderSubmitted` afterwards is stored as `IGNORED`: the order is never reopened and
the event never goes to the DLT. Whichever of the timeout and Credit's answer
locks the order first wins. The shared contract is the "pending-credit timeout"
section of the event blueprint. Accepted orders never expire. Rejections are RFC-7807
problems with a `code` and the order's `currentState`:

| Code | Status | When |
| --- | --- | --- |
| `NOT_ORDER_REQUESTER` | 403 | The caller is not the order's requester |
| `CANCELLATION_NOT_ALLOWED` | 409 | Cancel or withdraw when the order is `PICKED_UP`, `DELIVERED` or `COMPLETED` |
| `NOT_ASSIGNED_COURIER` | 403 | The caller is not the order's assigned courier |
| `SELF_ACCEPTANCE_FORBIDDEN` | 403 | The requester tried to accept their own order |
| `ORDER_ALREADY_ACCEPTED` | 409 | Another courier accepted the order first |
| `ORDER_EXPIRED` | 409 | The pickup deadline has passed |
| `INVALID_STATE_TRANSITION` | 409 | The action is not valid in the order's current state |
| `ORDER_NOT_FOUND` | 404 | No such order, or the caller may not see it |
| `REWARD_ADJUSTMENT_PENDING` | 409 | Accept or edit while a reward change awaits Credit |
| `VERSION_CONFLICT` | 409 | Edit based on an old `version`; the problem carries `currentVersion` |
| `INVALID_QUERY` | 400 | A list endpoint got an invalid filter, sort or paging value (no `currentState`) |
| `INVALID_IDEMPOTENCY_KEY` | 400 | Create sent a malformed `Idempotency-Key` (no `currentState`) |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Create reused an `Idempotency-Key` with a different body (no `currentState`) |

Every state change also stores an `order_transitions`
history row in the same transaction; credit-changing ones also store an
`order.events` outbox row (`outbox_events`), so a change and its event are
always saved together. See [Order events](#order-events-contract).

**Location names come from the client.** Order Service never calls Supplier
Service. The client picks locations from Supplier's public API and sends both the
IDs and the display names; Order validates their format and stores the names as
snapshots (`pickup_location_name_snapshot`, `dropoff_location_name_snapshot`), so
later Supplier edits or deletions don't rewrite existing errands. Order does not
check that a location exists or is active. Orders created before this change have
no stored names (the columns stay nullable).

### Browse open orders and history

Any signed-in session role may call these; the caller is the token's `sub`. Each
returns a page:

```json
{ "items": [ /* orders, same shape as GET /api/orders/{id} */ ],
  "page": 0, "size": 20, "totalItems": 21, "totalPages": 2 }
```

| Endpoint | Returns | Order |
| --- | --- | --- |
| `GET /api/orders` | The open pool: `OPEN` orders whose `pickupDeadline` is still in the future, with no reward change pending, excluding the caller's own requests (F4.1) | `sort` below |
| `GET /api/orders/me/requested` | The caller's own orders (F9.1). `status=past` (default): `COMPLETED`, `CANCELLED` or `EXPIRED`. `status=active`: `PENDING_CREDIT`, `OPEN`, `ACCEPTED`, `PICKED_UP` or `DELIVERED`. `RESERVATION_FAILED` is never listed (the errand was not posted) | Past: latest state change first. Active: nearest pickup deadline first. Then `id` |
| `GET /api/orders/admin/users/{userId}/requested` | **ADMIN session only.** Read-only support view of that user's requests, same `status`/`state`/paging rules as `/me/requested` | As `/me/requested` |
| `GET /api/orders/admin/users/{userId}/delivered` | **ADMIN session only.** That user's deliveries, same rules as `/me/delivered` | As `/me/delivered` |
| `GET /api/orders/me/delivered` | Orders the caller runs as courier (F9.2). `status=past` (default): `COMPLETED`. `status=active`: `ACCEPTED`, `PICKED_UP` or `DELIVERED` while still assigned to the caller | As above |

An `OPEN` order whose deadline has passed is never offered, even before the
expiry job has expired it.

Query parameters (all optional; filters combine with AND, a blank value is ignored):

| Parameter | Applies to | Rule |
| --- | --- | --- |
| `minReward`, `maxReward` | pool | Positive whole credits, inclusive; `minReward` must not exceed `maxReward` (F4.2) |
| `pickupLocationId`, `dropoffLocationId` | pool | Supplier location UUID (F4.2) |
| `sort` | pool | `deadline` (nearest pickup deadline first, the default), `reward` (highest first, then nearest deadline) or `pickupLocationName` (A to Z ignoring case, orders without a stored name last, then nearest deadline). `id` breaks any remaining tie so paging is stable (F4.3) |
| `userId` | admin lists | User Service UUID of the person to look up; anything else is `INVALID_QUERY` |
| `status` | my lists | `active` or `past` (default), case-insensitive |
| `state` | my lists | One order state; must be one the chosen `status` list contains (e.g. `status=past&state=CANCELLED`) |
| `page` | all | Zero-based, default `0` |
| `size` | all | `1`–`50`, default `20` |

No matches returns `200` with an empty `items` list, which the client shows as
"no matches" (F4.5). Any invalid value returns `400` problem+json with
`code: INVALID_QUERY` and a `detail` naming the parameter.

**F4.4 (keep the courier's filters) is client-only:** the client remembers the last
filter/sort values and sends them again; the API is stateless.

## Order events (contract)

The cross-service wire format is the shared
[event communication blueprint](../docs/integration/event-communication-blueprint.md)
(version 1); this section summarises Order's part of it.

**Published to `order.events`** (key = order UUID), only for transitions that
change credits:

| Event | When | Credit effect |
| --- | --- | --- |
| `OrderSubmitted` | A valid order is stored as `PENDING_CREDIT` | Reserve the reward |
| `OrderCancelled` | The requester cancels (`compensationRequired` when it was `ACCEPTED`) | Release, or compensate the courier |
| `OrderExpired` | The deadline passes while `OPEN`, a reservation is confirmed too late, a courier withdraws after the deadline, or Credit does not answer by the credit timeout (`reason` `CREDIT_RESERVATION_TIMEOUT`) | Release |
| `OrderCompleted` | The requester confirms receipt | Settle the full reward to the courier |
| `OrderRewardChangeRequested` | The requester edits an `OPEN` order's reward | Adjust the reservation to `newCreditReward` |

Each event uses the blueprint envelope (`eventVersion` 1, `producer`
`order-service`, `aggregateType` `Order`, UTC `occurredAt`, one `correlationId`
per order, `causationId` null, `actor` `{type: USER, userId, role}` or
`{type: SYSTEM}`). Its `data` carries a UUID `operationId`, generated once and
stored with the outbox row so retries never create a second operation. Other
transitions (opened, accepted, reopened, picked up, delivered, reservation
failed) change no credits and send nothing on `order.events`.

**Published to `order.lifecycle.events`** (key = order UUID) when
`ORDER_LIFECYCLE_EVENTS_ENABLED=true`: one `OrderTransitioned` for **every**
committed transition, including edits and reward changes, for Notification and
Chat. The shape is the shared N2H contract
([`n2h-events.schema.json`](../docs/contracts/n2h-events.schema.json)); the tests
validate every action's event against that file.

- `data`: `orderId`, `requesterId`, `previousCourierId`, `courierId`, `fromState`
  (null for `SUBMIT`), `toState`, `action`, `sourceSequence`, `reasonCode` and
  `snapshot` (the order right after the change).
- **`sourceSequence`** counts the order's published transitions: 1, 2, 3… with no
  gaps. It is taken in the transition's own transaction, so a rejected, raced or
  repeated request takes no number. It is not the JPA `version`.
- **`previousCourierId`** is the courier a withdrawal or cancel-after-accept cleared;
  `courierId` is then null. Otherwise it is null and `courierId` is the order's
  courier after the change.
- **`reasonCode`** is the transition's terminal reason (for example
  `INSUFFICIENT_CREDITS`, `REQUESTER_CANCELLED_ACCEPTED`, `PICKUP_DEADLINE_PASSED`),
  otherwise null. Rejected reward changes give null: Order does not store
  Credit's rejection code.
- **`actor`** is `SYSTEM` for scheduler, Credit-driven and lazy expiries; an action
  that only triggers a lazy expiry is not its actor.
- **`causationId`** is the Credit event's `eventId` for transitions it caused
  (opened, reservation failed, reward applied or rejected), otherwise null.
- No `operationId`: a lifecycle fact requests no credit effect.

The setting is off by default: the topic and `order_service`'s Write ACL must
exist first. Compose turns it on (its `kafka-init` creates both). While it is off
nothing is written and no numbers are taken; each order's stream starts at 1 from
its first transition after it is turned on, and earlier transitions are not
published.

**Consumed from `credit.events`** (`CreditOutcomeHandler`): `CreditReserved`
opens the order, `CreditReservationRejected` ends it, `CreditAdjusted` applies
the pending reward and `CreditAdjustmentRejected` drops it (both only if the
order is still `OPEN` with that reward pending; otherwise the event is recorded as
`IGNORED`), and `CreditReleased`,
`CreditSettled` and `CourierCompensated` only set the order's `creditStatus`.
Each outcome must answer the command that asks for it: `CreditReleased` an
`OrderCancelled` or `OrderExpired`, `CreditSettled` an `OrderCompleted`,
`CourierCompensated` an `OrderCancelled`; anything else is `OPERATION_ID_CONFLICT`.
Each event is validated, deduplicated by `eventId` in the `processed_events`
inbox, and matched to the Order command it answers by `operationId`, all in one
transaction.

**Kafka transport.** An outbox relay sends pending `outbox_events` rows to
their topic every second, keyed by the order UUID and reusing each row's stored
`eventId` and payload; a row is marked `published_at` only after Kafka
acknowledges, and a failed send stays pending with `attempts` increased. Once an
order's event fails, that order's later events **on the same topic** wait, so they
are never published out of order; a failing `order.lifecycle.events` row never
holds back that order's credit requests on `order.events`. This also holds with
several Order replicas: a run claims a whole stream (one order's events on one
topic) by locking that stream's oldest unpublished row with `FOR UPDATE SKIP
LOCKED`, so another replica skips the stream until the first one commits, and can
never send a later event ahead of an earlier one. A run claims at most 20 rows
(`ORDER_KAFKA_OUTBOX_BATCH_SIZE`) and keeps them locked while it sends, so the
batch stays small. A row that has failed 10 times (`ORDER_KAFKA_OUTBOX_STUCK_ATTEMPTS`)
is logged once at `ERROR` as stuck, with its `eventId`, `operationId` and order,
and keeps being retried.

A listener consumes `credit.events` as group `order-service` and acknowledges a
record only after `CreditOutcomeHandler` commits. Transient failures (database or
broker trouble) are retried three times with backoff, then the original record
goes to `credit.events.DLT`. Failures that would repeat on every attempt go there
at once: contract violations, an outcome the order's state cannot take
(`OrderTransitionException`) and an unknown order.

**Backlog metrics.** `GET /actuator/metrics/{name}` needs an `ADMIN` session token
(anyone else gets `401`/`403`). The relay backlog is:

| Metric | Meaning |
| --- | --- |
| `order.outbox.pending` | Outbox rows Kafka has not acknowledged |
| `order.outbox.oldest.age` | Seconds since the oldest of them was written; `0` when none waits |
| `order.outbox.max.attempts` | Most failed sends of any of them; above the stuck threshold, a row is blocking its stream |

They are read from the database at most every 5 s, and work with Kafka off too.

**Credit reconciliation.** Every 5 min (`ORDER_CREDIT_RECONCILIATION_INTERVAL_MS`) Order
looks for commands it sent Credit on `order.events` (`OrderSubmitted`,
`OrderRewardChangeRequested`, `OrderCancelled`, `OrderExpired`, `OrderCompleted`) that
have no Credit outcome for their `operationId` in the inbox
`ORDER_CREDIT_RECONCILIATION_AFTER` (default `PT10M`) after Kafka acknowledged them,
or after they were written if they are still unpublished. Any recorded outcome, `IGNORED`
included, answers a command. It is read-only and **never re-sends**: Credit owns every
ledger effect, and a new `operationId` would be a second operation. Each command is logged
once per process:

- `outcome=CREDIT_OUTCOME_MISSING` at `WARN`, with `eventId`, `eventType`, `operationId`,
  `orderId`, `correlationId`, age and whether it was published;
- `outcome=TIMEOUT_UNANSWERED` at `INFO` for a credit-timeout `OrderExpired`. Credit answers
  it only when it held a reservation, so silence is expected when it did not.

| Metric | Meaning |
| --- | --- |
| `order.credit.unanswered` | Commands without a Credit outcome after the threshold (timeouts excluded) |
| `order.credit.unanswered.oldest.age` | Seconds since the oldest of them was published; `0` when none |
| `order.credit.timeout.unanswered` | Credit-timeout expiries without a Credit outcome |

Recovering a `CREDIT_OUTCOME_MISSING` command, using its `operationId` and `correlationId`:

1. Unpublished: the relay is failing for it; check `order.outbox.max.attempts`, the stuck-row
   `ERROR` log and the broker/ACLs. It is sent once the cause is fixed.
2. Published: look for it in `order.events.DLT` (Credit could not process it) and in Credit's
   inbox and `credit_operations`; look for Credit's answer in `credit.events.DLT` (Order could
   not process it).
3. Fix the cause and replay the **original** record from the DLT with the broker tooling. Both
   inboxes deduplicate by `eventId`, so a replay applies at most once.

Turn it off with `ORDER_CREDIT_RECONCILIATION_ENABLED=false`.

| Setting | Env var | Default |
| --- | --- | --- |
| Turn Kafka on/off | `ORDER_KAFKA_ENABLED` | `true` (`false` runs without a broker; events wait unpublished) |
| Relay batch size | `ORDER_KAFKA_OUTBOX_BATCH_SIZE` | `20` |
| Stuck-row threshold | `ORDER_KAFKA_OUTBOX_STUCK_ATTEMPTS` | `10` failed attempts |
| Publish `OrderTransitioned` | `ORDER_LIFECYCLE_EVENTS_ENABLED` | `false` (Compose sets `true`) |
| Bootstrap servers | `KAFKA_BOOTSTRAP_SERVERS` | `localhost:29092` (Compose sets `kafka:9092`) |
| Security protocol | `KAFKA_SECURITY_PROTOCOL` | `SASL_PLAINTEXT` |
| SASL mechanism | `KAFKA_SASL_MECHANISM` | `PLAIN` |
| Identity | `KAFKA_USERNAME` / `KAFKA_PASSWORD` | `order_service` / (none) |

Order does not create topics or ACLs; the shared `kafka-init` does
([`deploy/kafka/README.md`](../deploy/kafka/README.md)). The full round trip also
needs Credit Service to consume `order.events` and publish `credit.events`.

## Lifecycle

The implemented lifecycle covers creation, Credit reservation outcomes, requester cancellation,
expiry, acceptance, withdrawal, pickup, delivery, completion, and edits to details or rewards.
Credit-changing commands use the transactional outbox and Kafka flow described in
[Order events](#order-events-contract). [DESIGN.md](DESIGN.md) contains the extended transition
design, guards, error codes, and iteration history.

**R** = the order's requester (session role `REQUESTER`), **C** = the assigned
courier (session role `COURIER`), **Sys** = the expiry scheduler or a Credit reply.

| Current | Next | Actor | Guard | Credit effect | Event |
| --- | --- | --- | --- | --- | --- |
| — | PENDING_CREDIT | R | Valid fields; deadline in the future | Reserve the reward | `OrderSubmitted` |
| PENDING_CREDIT | OPEN | Sys | `CreditReserved` before the deadline | — | (history only) |
| PENDING_CREDIT | EXPIRED | Sys | `CreditReserved` at or after the deadline | Release in full | `OrderExpired` |
| PENDING_CREDIT | EXPIRED | Sys | No Credit answer by `min(pickupDeadline, createdAt + ORDER_CREDIT_RESERVATION_TIMEOUT)` (default 2 min); `terminalReason` `CREDIT_RESERVATION_TIMEOUT` | Release whatever Credit may hold | `OrderExpired` (`reason` `CREDIT_RESERVATION_TIMEOUT`) |
| PENDING_CREDIT | RESERVATION_FAILED | Sys | `CreditReservationRejected`; `terminalReason` is `INSUFFICIENT_CREDITS`, `CREDIT_ACCOUNT_NOT_FOUND` or `CREDIT_RESERVATION_REJECTED` (other reason codes) | — | (history only) |
| OPEN | OPEN (edit) | R | No reward adjustment pending; `version` matches | Adjust if the reward changed; the new reward applies only after `CreditAdjusted` | `OrderRewardChangeRequested` if the reward changed |
| OPEN | CANCELLED | R | — | Release in full, no compensation | `OrderCancelled` |
| OPEN | EXPIRED | Sys | `now >= pickupDeadline` | Release in full | `OrderExpired` |
| OPEN | ACCEPTED | C (any user except R) | Before the deadline; no reward adjustment pending; first request wins | — | (history only) |
| ACCEPTED | OPEN | C | Withdraws before the deadline; courier cleared, back in the pool | — | (history only) |
| ACCEPTED | EXPIRED | C | Withdraws at or after the deadline; courier cleared | Release in full | `OrderExpired` |
| ACCEPTED | CANCELLED | R | Before pickup; courier cleared | Courier gets `ceil(reward × 20 / 100)`, the rest returns to R | `OrderCancelled` |
| ACCEPTED | CANCELLED | R | At or after the pickup deadline (the courier is late); courier cleared; `terminalReason` `REQUESTER_CANCELLED_COURIER_LATE` | Release in full, no compensation | `OrderCancelled` (`compensationRequired=false`) |
| ACCEPTED | PICKED_UP | C | Late pickup allowed | — | (history only) |
| PICKED_UP | DELIVERED | C | — | — | (history only) |
| DELIVERED | COMPLETED | R | Confirms receipt | Full reward to C | `OrderCompleted` |

Rules that apply to every transition:

- **Deadline boundary:** an order is expired when `now >= pickupDeadline` (server
  clock, UTC). Only `OPEN` orders expire automatically, via the scheduler or
  lazily when an action touches an overdue order; accepted orders never do.
- **Terminal states:** `COMPLETED`, `CANCELLED`, `EXPIRED` and
  `RESERVATION_FAILED`. Cancellation and withdrawal are rejected with `409` once
  an order is `PICKED_UP` or later.
- **Concurrency:** each transition locks the order row, so the first request
  processed wins; the loser gets `409` (for example `ORDER_ALREADY_ACCEPTED`).
- **Duplicates:** repeating an action whose target state the order already has,
  by the same caller (for example a second `complete`), returns `200` with the
  current order and triggers no new event or credit effect.
- **Errors:** wrong session role or not the order's requester/courier → `403`;
  invalid state → `409`; malformed body → `400` with nothing changed.

## Frontend

A React frontend in `frontend/` is packaged inside the service, like the Credit dashboard. The
service serves it at `/errands` with assets under `/order-assets/**`; it reuses the shared-origin
login (`sessionStorage["foc.user-session"]`) and calls `/api/orders`. The "Request a hand" form also
reads active locations from Supplier's public `GET /api/suppliers` and the caller's balance from
Credit's `GET /api/credits/me`, both from the browser; Order Service itself never calls them. Design source and API
adaptations: [`frontend/docs/design-source.md`](frontend/docs/design-source.md).

```sh
cd frontend
npm ci
npm run dev          # http://localhost:5176; proxies /api/orders, /api/suppliers, /api/credits
npm run lint && npm run typecheck && npm test && npm run build
```

Through the shared gateway the UI is at <http://localhost:8088/errands> (routes `order-ui` and
`order-api`).

## Running with Docker Compose

Order Service and its private database (`order-db`, host port `127.0.0.1:5436`) are part of the
root `compose.yaml`. Put `ORDER_DB_NAME`, `ORDER_DB_USER` and `ORDER_DB_PASSWORD` in the root `.env`
(see `.env.example`); Compose also requires the shared User, Credit and Kafka variables. Then:

```sh
docker compose up -d --build
```

The service listens on `8082` and verifies tokens with User Service's JWKS inside the Compose
network. Its Kafka identity (`order_service`) is configured for the shared broker.

## Postman walkthrough

[`postman/Friend-on-Campus-Order-API.postman_collection.json`](postman/Friend-on-Campus-Order-API.postman_collection.json)
runs the errand lifecycle end to end through the gateway (`baseUrl`, default
`http://localhost:8088`), with real User, Supplier, Credit and Kafka:

| Folder | Shows |
| --- | --- |
| 0. Setup | Sign-in for requester, courier and admin (tokens are stored automatically), credit allocation, two Supplier locations |
| 1. Create, read and edit | `401`/`403`/`400` on create, a retried create with the same `Idempotency-Key` returns the same errand (`200`) and a changed body gets `409 IDEMPOTENCY_KEY_REUSED`, `PENDING_CREDIT → OPEN` via Credit, raising the reward reserves only the difference, `409 VERSION_CONFLICT`, history |
| 2. Discover and accept | Pool with filters, own errands hidden, `403 SELF_ACCEPTANCE_FORBIDDEN`, wrong-role `403`, accept, the race loser's `409 ORDER_ALREADY_ACCEPTED`, courier's active list |
| 3. Deliver and complete | Wrong-role `403`s, `409 CANCELLATION_NOT_ALLOWED` after pickup, completion pays the courier the full reward, a repeated completion returns `200` with no second effect |
| 4. Cancel, compensate and withdraw | `403 NOT_ASSIGNED_COURIER`, withdrawal reopens, re-acceptance, `403 NOT_ORDER_REQUESTER`, cancelling an accepted 3-credit errand pays the courier `ceil(20%)` = 1, a repeated cancel is a no-op |
| 5. Admin views | An ADMIN session reads another user's requested/delivered errands; a requester session gets `403` |

Set `requesterEmail`/`requesterPassword`, `courierEmail`/`courierPassword` and
`adminEmail`/`adminPassword` first: three different active accounts, the requester with 10
available credits (a new account's allocation covers errands of 7 and 3), the admin with the Admin role. Run the folders in order. Keep passwords and
tokens in a local Postman environment; never commit or export them in the collection.

## Verification

```bash
./mvnw test          # unit, web and security tests, plus PostgreSQL integration tests
./mvnw verify        # full build
```

The persistence integration tests start a throwaway PostgreSQL with
Testcontainers, so **Docker must be running**. They apply the real Flyway
migrations.

Running the service outside Compose requires PostgreSQL configured through
`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`. Kafka can be disabled with
`ORDER_KAFKA_ENABLED=false`; unpublished outbox events remain available for later delivery.

## Cross-service integrations

### Current account authorization

Protected operations require the verified JWT's selected role to remain assigned to an ACTIVE
User account. Current User decisions are never cached; denial is 403 and dependency uncertainty
is 503. Existing resource and lifecycle rules still apply. See the
[current authorization contract and acceptance checks](../docs/integration/current-authorization.md).

Configure ORDER_USER_URL, ORDER_SERVICE_KEY_ID and
ORDER_SERVICE_PRIVATE_KEY (base64 PKCS8 RSA, separate from User's JWT key),
and pin the matching public key/subject in USER_SERVICE_TRUSTED_KEYS. Missing signing/trust
configuration fails closed even when administrative Kafka consumers are disabled.

### Admin evidence export

Chat's pinned service identity reads `/internal/orders/orders/{orderId}/evidence` (the existing
`/internal/orders/{orderId}/evidence` alias remains). The export preserves original outbox IDs,
sequences, actors, snapshots and previous couriers. Its cursor pins an immutable committed prefix;
new transitions are excluded until a new first-page read. Missing events, zero/legacy history or
history without the initial `SUBMIT` baseline return unavailable rather than invented participants
or completeness. Invalid cursor bounds are rejected. Service assertions enforce subject/key,
audience, RSA strength, issued/not-before times, expiry and assertion identity.

`OrderLifecycleEventIntegrationTest` verifies the exporter with real PostgreSQL and real Order
domain transitions, including a new fact between pages and missing/legacy-baseline failures. No
lifecycle or credit-request wire format changes. See the
[approved integration protocol](../docs/integration/chat-admin-contract.md) and
[acceptance/rollout evidence](../admin-service/INTEGRATION_READINESS.md).

### Admin reporting entry

Requester history shows visible Active and Past headings, with past-status filters in the Past
section header. Requester and Courier lists omit Under review only after a successful response
confirms no review errands. Loading and failed review requests remain visible; an unavailable
response is never presented as an empty list. Actual review cases retain their separate section.

The errand detail screen shows the reporting panel to its requester or assigned courier, not to
couriers browsing an open errand. Acceptance enables the assigned courier's panel. It uses the
Admin-owned `GET /api/admin/orders/{orderId}/report-context` endpoint through the gateway.

The panel offers **Report an issue** for `REPORT_REQUEST_AVAILABLE`: it permits saving a
request, without asserting eligibility or pausing the errand. Order checks involvement when it
consumes the review command. `PREPARING_REVIEW` shows **Preparing review**, links to the private
progress page and polls the context every three seconds while visible. Only `OWN_REPORT` shows
an accepted statement's status; `CASE_PARTICIPANT` offers the verified party their case and a
statement link while unresolved. The frontend also accepts the former `PREPARATION_AVAILABLE`
spelling and legacy `ELIGIBLE`/`INELIGIBLE` responses during mixed-version rollout. Unknown or
malformed responses remain unavailable with retry. Query keys isolate actor, mode and errand;
no GET or poll submits a request. Authorization and lifecycle mutations remain backend-owned.

An unavailable Order detail may still show the reporting-access panel, allowing a historical
participant with a known errand URL to ask Admin/Chat without exposing hidden Order details. My
errands does not yet discover every withdrawn historical assignment; that remains a separate
Order-owned history/API concern. Saving a request does not grant case access or prove eligibility; Admin accepts it only after
Order and Chat confirmations arrive.

Use the gateway at <http://localhost:8088> for cross-service GUI checks. The Vite preview also
proxies Admin paths through that gateway; isolated frontend fixtures are test-only.

### Dispute review workflow

See the [approved report freeze and finalization contract](../docs/integration/dispute-review-contract.md) for service ownership, retry barriers, timeline message/image evidence, credit dispositions and rollout requirements. Existing lifecycle and case states are retained.

## Asynchronous dispute coordination

Dispute writes use the [versioned Kafka contract](../docs/integration/dispute-kafka-contract.md). Reports and decisions remain pending until committed owner confirmations; HTTP timeouts are never success. Existing current-account and evidence read authorization remains enforced locally.
