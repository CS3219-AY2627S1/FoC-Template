# Order Service D3 design: lifecycle, transitions and API

## Context
This plan turns functional requirements F1–F9 into one complete state machine and API, fills the
gaps, and splits the work into `/foc-iterate-feature` iterations. Owner: XueTing
(`order-service/` only).

> **Cross-service wire format:** the shared
> [event communication blueprint](../docs/integration/event-communication-blueprint.md) (version 1)
> is the contract for topics, event names, envelopes and payloads. Where this document and the
> blueprint differ, **the blueprint wins**. This document covers Order's internal design.

**Status (2026-10-18):** iterations 1–8 are merged: the full lifecycle, blueprint events, the Kafka
relay and listener, discovery/history, editing and reward changes, location names, the errand UI
(`/errands`), Compose and gateway wiring, CI (backend, frontend, Compose environment check) and the
Kubernetes image. The end-to-end round trip (iteration 9) waits on Credit Service's Kafka adapter. See [Iterations](#iterations-each-one-is-a-foc-iterate-feature-order--run).

Decisions confirmed with XueTing:
- **Reward editing stays in D3.** It goes through a Credit adjustment.
- **Event-driven with Kafka.**
  - Order and Credit communicate only through Kafka events, never through each other's database or synchronous calls.
  - Order writes events to a transactional outbox and a relay publishes them to Kafka.
  - Credit's replies are consumed idempotently.
  - The contract is the shared event communication blueprint, owned jointly with Eldridge (Credit)
    and Jun Hui (Kafka). Credit Service and the Kafka infrastructure now exist on `main`, so no
    credit stub is needed.
  - Kafka infrastructure (topics, ACLs, Compose) is shared and owned by Jun Hui
    (`deploy/kafka/README.md`).
- **Session role must match the action**, otherwise 403. This applies to mutations only; reads just need a valid token.
  - `REQUESTER`: create, edit, cancel, confirm receipt.
  - `COURIER`: accept, withdraw, pick up, deliver.
- **Locations come only from the client.** Order Service never calls Supplier Service.
  - The client picks locations from the Supplier UI/API itself and sends `pickupLocationId`,
    `pickupLocationName`, `dropoffLocationId` and `dropoffLocationName` in the request.
  - Order validates the format (UUIDs, names 1–160 characters, pickup ≠ drop-off) and stores the
    values as the snapshot.
  - Order does **not** check that a location exists or is ACTIVE. That's an accepted trade-off:
    the client is responsible for picking valid locations.

## Architecture

```
Client ─► Gateway (/api/orders/**) ─► Order Service ──► order-db (Postgres, private)
                                          │  ▲
                        outbox relay ─────┘  │ consumer (inbox / dedupe)
                                          ▼  │
   Kafka topics:  order.events  ─────────►  Credit Service, Notifications (and other consumers)
                  credit.events ◄────────  Credit Service
User Service ── JWKS ──► Order (token verification only)
(No Order → Supplier calls: the client sends location IDs and names, taken from Supplier's public API.)
```

- **Database per service.** Only Order touches `order-db`. It stores user and location UUIDs,
  never foreign keys into other services.
- **Order is the producer of lifecycle facts** (`order.events`). It never decides balances; Credit
  applies the money effects and replies with outcomes (`credit.events`). This is choreography:
  Order publishes facts and Credit reacts, rather than Order sending commands.
- **The only synchronous outbound call is the JWKS fetch.** Order never calls Supplier or Credit
  directly. Every interaction that crosses a service boundary goes through Kafka.
- **Reliability:**
  - at-least-once delivery;
  - the transactional outbox prevents "saved but not published";
  - inbox de-duplication prevents double-applying a replayed event.

### Kafka contract (from the shared blueprint)

Topics, keys, partitions and producer/consumer settings are defined in the
[blueprint](../docs/integration/event-communication-blueprint.md#kafka-configuration). For Order:

| Topic | Order's role | Key | Consumer group |
|---|---|---|---|
| `order.events` | Producer | Order UUID | (Credit: `credit-service`) |
| `credit.events` | Consumer | Order UUID for order outcomes | `order-service` |
| `credit.events.DLT` | Retry recoverer target | original key | Operations |

- **Envelope** (blueprint "Required envelope"): `eventId`, `eventType`, `eventVersion` = 1,
  `aggregateType` = `Order`, `aggregateId` = order UUID (= Kafka key), `aggregateVersion` = the
  order's version after the change, `occurredAt` in UTC with `Z`, `producer` = `order-service`,
  `correlationId` (one per order workflow, stored on the order), `causationId`, and
  `actor` = `{type: USER, userId, role}` or `{type: SYSTEM}`.
- **`causationId`** is null for every Order event: `OrderSubmitted` initiates the workflow, and the
  others are triggered by a user action or the expiry job, not by another event.
- **`operationId`** is a fresh UUID generated once per credit-changing transition, stored in the
  outbox row (`outbox_events.operation_id`) and never regenerated on a retry.

**Events Order publishes on `order.events`: exactly the blueprint's five.**

| Event | Transition(s) | `data` |
|---|---|---|
| `OrderSubmitted` | T1 | `operationId`, `orderId`, `requesterId`, `creditReward` |
| `OrderRewardChangeRequested` | T5 | `operationId`, `orderId`, `newCreditReward` |
| `OrderCancelled` | T6, T11 | `operationId`, `orderId`, `courierId` (null unless compensating), `compensationRequired`, `reason`, `cancelledAt` |
| `OrderExpired` | T2b, T7, T10 | `operationId`, `orderId`, `reason`, `expiredAt` |
| `OrderCompleted` | T14 | `operationId`, `orderId`, `courierId`, `completedAt` |

Transitions that change no credits (T2 opened, T3 reservation failed, T4 details edited, T8
accepted, T9 reopened, T12 picked up, T13 delivered) are **not published**. They are recorded in
`order_transitions` and shown by `GET /api/orders/{id}/history`. Publishing them later (for
example for Notifications) needs a blueprint change agreed with Credit, because Credit rejects
unknown event types on `order.events`.

**Credit outcomes Order consumes from `credit.events`** (blueprint "Credit outcome events"):

| Outcome | Must answer | Order behaviour |
|---|---|---|
| `CreditReserved` | `OrderSubmitted` | T2 `PENDING_CREDIT → OPEN` (or T2b `EXPIRED` if at/after the deadline); store `reservationId`; credit status `RESERVED` |
| `CreditReservationRejected` | `OrderSubmitted` | T3 `PENDING_CREDIT → RESERVATION_FAILED` |
| `CreditAdjusted` / `CreditAdjustmentRejected` | `OrderRewardChangeRequested` | T5a / T5b; applied only if it answers the order's latest reward change and the order is still OPEN with that reward pending, otherwise recorded as `IGNORED` |
| `CreditReleased` | `OrderCancelled` or `OrderExpired` | credit status `RELEASED`; state unchanged |
| `CreditSettled` | `OrderCompleted` | credit status `SETTLED`; state unchanged |
| `CourierCompensated` | `OrderCancelled` | credit status `COMPENSATED`; state unchanged |

Consumer rules (`messaging/CreditOutcomeHandler`), in one transaction:
1. Parse and validate the envelope: version 1, `producer` = `credit-service`,
   `aggregateType` = `Order`, `aggregateId` = `data.orderId`.
2. Inbox (`processed_events`, keyed by `eventId`): a redelivery with the same content is a no-op;
   the same `eventId` with different content is rejected as `EVENT_ID_CONFLICT`.
3. Match `data.operationId` to the Order outbox row that requested it. An unknown operation is
   rejected (`UNKNOWN_OPERATION`); an outcome answering the wrong kind of command is rejected
   (`OPERATION_ID_CONFLICT`).
4. Apply the behaviour above, mark the inbox row, and commit. The listener acknowledges Kafka only
   after commit; rejected events are left unrecorded so they can go to the DLT and be replayed.
5. Credit events with no Order behaviour (`CreditAccountAllocated`) are recorded as `IGNORED`.

## Global rules (resolved gaps)

1. **Deadline boundary.**
   - **Expired ⇔ `now >= pickupDeadline`**, using the server clock in UTC.
   - Create and edit require `pickupDeadline > now`. The existing `@Future` check already does this.
   - An injectable `Clock` bean is used so tests can control time.
2. **Expiry has two triggers, with the same outcome:**
   - a scheduler runs every 30 s and expires `OPEN` orders where `pickup_deadline <= now`;
   - **lazy expiry**: any action on an `OPEN` order that is past its deadline expires it first, in
     the same transaction, then rejects the action.
   - So no order is ever accepted at or after its deadline (F5.4, F8.1).
3. **Only `OPEN` orders expire automatically** (F8.2/F8.3).
   - Accepted orders never expire automatically.
   - **Late pickup is allowed**: the courier may still pick up an `ACCEPTED` order after the deadline.
   - **A late courier earns no compensation**: from the deadline on, a requester's cancel of an
     `ACCEPTED` order releases the reservation in full (T11b), like a ride app's free cancellation when
     the driver is late. There is no automatic no-show expiry. *(Confirmed by XueTing, 2026-11-09.)*
   - The deadline only affects acceptance, expiry and withdrawal. *(Confirmed by XueTing, 2026-10-18.)*
4. **Concurrency.**
   - Every transition runs in one transaction, loading the row with `PESSIMISTIC_WRITE`
     (`SELECT … FOR UPDATE`).
   - The first request processed wins. Losers then see the new state and get a 409 (F5.3/F5.3.1).
   - Edits also require the client's `version` (optimistic check, as Supplier does) to prevent lost updates.
5. **Atomicity (F7.2.1).**
   - The state change, the history row and the outbox event commit together or not at all.
   - A truncated or malformed body fails with 400 before any transaction starts, so the state is unchanged.
   - Action endpoints have no body.
6. **Duplicate requests (F7.1.1).**
   - A request counts as a duplicate when the order **already occupies the action's target state**
     **and** the latest history entry for that action was made by the **same caller**.
   - A duplicate returns `200` with the current order. It publishes no event, writes no history and
     has no credit effect.
   - The same target state reached by a *different* actor is a 409, e.g. losing an acceptance race.
   - Every credit-changing event carries a UUID `operationId`, generated once and stored with the
     outbox row, so Credit can de-duplicate replays. Order never issues a second command for the
     same transition.
7. **Order of checks** for every action:
   1. authentication (401);
   2. session role (403 `ROLE_NOT_PERMITTED`);
   3. load the order (404);
   4. lazy expiry;
   5. duplicate check (200);
   6. relationship (403);
   7. state guard (409);
   8. deadline guard (409).
8. **Courier assignment.**
   - `courier_id` is set only in `ACCEPTED`, `PICKED_UP`, `DELIVERED` and `COMPLETED`. The existing
     DB constraint `chk_courier_assignment` enforces this.
   - When the courier is cleared, their ID is kept in the history row and carried in the event for Credit.
9. **Re-acceptance.**
   - A courier who withdrew may accept the same order again.
   - The pool excludes the caller's own requests (self-acceptance is forbidden).
   - *(Confirmed by XueTing, 2026-10-18.)*

## States
- **`PENDING_CREDIT`:** the order is saved and waiting for Credit to reserve the reward. It isn't
  visible in the pool.
- **`OPEN`:** the reward is reserved, the order is in the pool and can be edited.
  - Its *adjustment-pending* sub-flag is `pending_credit_reward IS NOT NULL`.
  - While the flag is set, the order is hidden from the pool and can't be accepted.
- **Active states:** `ACCEPTED`, `PICKED_UP`, `DELIVERED`.
- **Terminal states:** `COMPLETED`, `CANCELLED`, `EXPIRED`, `RESERVATION_FAILED`.
  - `terminal_reason` records why.
  - Values: `REQUESTER_CANCELLED_OPEN`, `REQUESTER_CANCELLED_ACCEPTED`, `REQUESTER_CANCELLED_COURIER_LATE`, `PICKUP_DEADLINE_PASSED`,
    `COURIER_WITHDREW_AFTER_DEADLINE`, and for `RESERVATION_FAILED` one of `INSUFFICIENT_CREDITS`,
    `CREDIT_ACCOUNT_NOT_FOUND` (Credit's `reasonCode` of the same name) or
    `CREDIT_RESERVATION_REJECTED` (any other or missing `reasonCode`).
  - The client uses the reservation reason to explain why an errand could not be posted.

## Transition table

Notation: **R** = the order's requester (session role `REQUESTER`). **C** = the assigned courier
(session role `COURIER`). **Sys** = the scheduler or a Credit reply.

| # | From → To | Trigger / endpoint | Actor | Guard | Credit effect (via event) | Event | Errors |
|---|---|---|---|---|---|---|---|
| T1 | ∅ → PENDING_CREDIT | `POST /api/orders` | Any user, REQUESTER session; becomes R | Valid fields (F1.1.2), including the client-supplied location IDs and names; deadline > now | Credit **reserves** `creditReward` | `OrderSubmitted` | 400 errors map, 403 |
| T2 | PENDING_CREDIT → OPEN | `CreditReserved` reply | Sys | State is PENDING_CREDIT and now < deadline; store `credit_reservation_id` | none | history only | Duplicate reply is ignored |
| T2b | PENDING_CREDIT → EXPIRED | `CreditReserved` reply arrives at or after the deadline | Sys | now ≥ deadline | **Release** the full reservation | `OrderExpired` (reason `PICKUP_DEADLINE_PASSED`) | — |
| T2c | PENDING_CREDIT → EXPIRED | Expiry job: no Credit answer by `min(pickupDeadline, createdAt + T)`, T = `PT2M` | Sys | State is PENDING_CREDIT once locked; `terminal_reason` `CREDIT_RESERVATION_TIMEOUT` | **Release** whatever Credit holds | `OrderExpired` (reason `CREDIT_RESERVATION_TIMEOUT`) | A later `CreditReserved`/`CreditReservationRejected` is `IGNORED` |
| T3 | PENDING_CREDIT → RESERVATION_FAILED | `CreditReservationRejected` reply | Sys | State is PENDING_CREDIT; `terminal_reason` from `reasonCode` | none | history only | — |
| T4 | OPEN → OPEN (details) | `PATCH /api/orders/{id}` with `version` | R | OPEN, no pending adjustment, version matches, valid fields, deadline > now | none (unless the reward changed, see T5) | history only | 400, 403 `NOT_ORDER_REQUESTER`, 409 `VERSION_CONFLICT` / `INVALID_STATE_TRANSITION` / `REWARD_ADJUSTMENT_PENDING` |
| T5 | OPEN → OPEN (reward requested) | The same `PATCH` with a different `creditReward` | R | As T4; set `pending_credit_reward` and leave `credit_reward` unchanged | Credit **adjusts**: reserves the extra if affordable, or releases the difference | `OrderRewardChangeRequested` | As T4 |
| T5a | OPEN → OPEN (reward applied) | `CreditAdjusted` reply | Sys | Pending value matches the reply | Already applied by Credit | history only | Ignored if the order is no longer OPEN |
| T5b | OPEN → OPEN (reward rejected) | `CreditAdjustmentRejected` reply | Sys | Pending value matches the reply; clear it | none; the old reservation stands | history only (the client shows "insufficient credits") | Ignored if no longer OPEN |
| T6 | OPEN → CANCELLED | `POST /api/orders/{id}/cancel` | R | OPEN (F3.1) | **Release** the full reservation, no compensation | `OrderCancelled` (`compensationRequired=false`) | 403, 409 `INVALID_STATE_TRANSITION` |
| T7 | OPEN → EXPIRED | Scheduler or lazy expiry | Sys | OPEN and now ≥ deadline (F8.1) | **Release** the full reservation | `OrderExpired` (`PICKUP_DEADLINE_PASSED`) | — |
| T8 | OPEN → ACCEPTED | `POST /api/orders/{id}/accept` | Any user except R, COURIER session; becomes C | OPEN, now < deadline, no pending adjustment, caller ≠ requester (F5.2) | none; the reservation stays held | history only | 403 `SELF_ACCEPTANCE_FORBIDDEN`; 409 `ORDER_ALREADY_ACCEPTED` (race loser, F5.3.1), `ORDER_EXPIRED` (F5.4.2, lazy expiry ran), `REWARD_ADJUSTMENT_PENDING`, `INVALID_STATE_TRANSITION` |
| T9 | ACCEPTED → OPEN | `POST /api/orders/{id}/withdraw` | C | ACCEPTED and now < deadline (F3.2); clear the courier | none; the reservation stays held | history only; back in the pool (F3.2.2) | 403 `NOT_ASSIGNED_COURIER`, 409 |
| T10 | ACCEPTED → EXPIRED | Same `withdraw` endpoint | C | ACCEPTED and now ≥ deadline (F3.2.3); clear the courier | **Release** the full reservation to R | `OrderExpired` (`COURIER_WITHDREW_AFTER_DEADLINE`) | As T9 |
| T11 | ACCEPTED → CANCELLED | `POST /api/orders/{id}/cancel` | R | ACCEPTED, not yet picked up (F3.3); clear the courier | **Compensate**: courier gets `ceil(reserved × 20 / 100)`, the rest goes back to R (F3.3.2) | `OrderCancelled` (`compensationRequired=true`, `courierId`) | 403, 409 |
| T11b | ACCEPTED → CANCELLED (courier late) | `POST /api/orders/{id}/cancel` | R | ACCEPTED, not yet picked up, **now ≥ deadline**; clear the courier | **Release** the full reservation to R; no compensation | `OrderCancelled` (`compensationRequired=false`, `courierId=null`, reason `REQUESTER_CANCELLED_COURIER_LATE`) | As T11; a late pickup that locks first wins (409 `CANCELLATION_NOT_ALLOWED`) |
| T12 | ACCEPTED → PICKED_UP | `POST /api/orders/{id}/pickup` | C | ACCEPTED (F6.1); late pickup allowed | none | history only | 403 `NOT_ASSIGNED_COURIER`, 409 |
| T13 | PICKED_UP → DELIVERED | `POST /api/orders/{id}/deliver` | C | PICKED_UP (F6.2) | none | history only | 403, 409 |
| T14 | DELIVERED → COMPLETED | `POST /api/orders/{id}/complete` | R | DELIVERED (F6.3) | **Settle**: the full reservation goes to C | `OrderCompleted` | 403, 409 |
| — | PICKED_UP / DELIVERED / COMPLETED → CANCELLED | `cancel` from R, or `withdraw` from C | — | Always rejected (F3.4/F3.4.1) | none | none | 409 `CANCELLATION_NOT_ALLOWED` |
| — | Any terminal → anything | Any action | — | Rejected, except a duplicate of the same action (rule 6) | none | none | 409 `INVALID_STATE_TRANSITION` |

**Duplicate completion (F7.1.1).**
- If `complete` is sent again by R on an order that's already `COMPLETED`, it returns `200` with the order.
- It publishes no second `OrderCompleted` and no second settlement.
- Credit also de-duplicates on `operationId`, as a second safeguard.
- The same rule covers cancel→CANCELLED, pickup→PICKED_UP, deliver→DELIVERED and accept→ACCEPTED,
  but only when the same courier sends the repeat.
- Withdraw repeats count as duplicates when the order is `OPEN` or `EXPIRED` and the last
  `WITHDRAW` history entry was made by the caller.

**Errors.**
- All errors are RFC-7807 `application/problem+json`, with a `code` property and `currentState`
  where it's relevant.
- These codes are added to the existing `ApiExceptionHandler`.

## Read APIs
- **`GET /api/orders`: the open pool** (F4.1–F4.3).
  - Includes only `state=OPEN`, `pickup_deadline > now`, no pending adjustment, and not the caller's own orders.
  - Filters: `minReward`, `maxReward`, `pickupLocationId`, `dropoffLocationId`.
  - Sort: `reward` (highest first) | `deadline` (nearest pickup deadline first, default) | `pickupLocationName` (A to Z, ignoring case); `id` breaks ties.
  - Paging: `page`, `size` (max 50). Invalid values are `400 INVALID_QUERY`.
  - No matches returns `200` with an empty page, which the client shows as "no matches" (F4.5).
  - Uses the existing partial indexes in V1.
- **`GET /api/orders/{id}`.**
  - OPEN orders are visible to any authenticated user.
  - In other states, only R or the current courier can see the order. Anyone else gets 404, so it
    isn't revealed that the order exists.
- **`GET /api/orders/{id}/history`:** the transition history, visible to participants only.
- **`GET /api/orders/me/requested`:** R's own orders (F9.1).
  - `status=past` (default): `COMPLETED`, `CANCELLED` or `EXPIRED`. `status=active`: `PENDING_CREDIT`,
    `OPEN`, `ACCEPTED`, `PICKED_UP` or `DELIVERED`, so an errand in progress is never lost.
  - An optional `state` narrows either list to one of its own states.
  - `RESERVATION_FAILED` is never listed: such an errand was not posted. *(Confirmed by XueTing,
    2026-10-18 and 2026-10-20.)*
- **`GET /api/orders/admin/users/{userId}/requested` and `/delivered`:** an ADMIN-session,
  read-only support view of another user's requested or delivered orders, with the same
  `status`/`state`/paging rules as the caller's own lists. Requester and Courier sessions get `403`,
  and the admin routes accept no writes. Admins act on orders only through these reads.
- **`GET /api/orders/me/delivered`:** orders the caller runs as courier (F9.2).
  - `status=past` (default): `COMPLETED`. `status=active`: `ACCEPTED`, `PICKED_UP` or `DELIVERED`.
  - Past shows completed deliveries only: an order the courier withdrew from, or that was cancelled
    after acceptance, no longer stores them as courier. *(Confirmed by XueTing, 2026-10-20.)*
- **Client-only requirements:**
  - F1.1.1 form validation, F4.4 remembering filters, and the F5.1.1/F5.1.2 confirmation popup;
  - the API supports them, but the server can't enforce them;
  - the Order UI is built in `order-service/frontend` and enforces them.

## Data model (applied migrations are never edited)
- **V1 `orders`:** the order aggregate and its lifecycle columns.
- **V2 `order_transitions`:** one row per transition (`action`, `from_state`, `to_state`,
  `actor_id`, `actor_role`, `courier_id`, `reason`, `order_version`, `occurred_at`). Used for the
  history view (F9) and duplicate detection. Every transition is recorded, published or not.
- **V2 `outbox_events`:** `id` (= `eventId`), `aggregate_id`, `aggregate_version`, `event_type`,
  `topic`, `payload JSONB`, `created_at`, `published_at` (null until Kafka acknowledges),
  `attempts`. The five blueprint events (`order.events`) and, when enabled, one
  `OrderTransitioned` per transition (`order.lifecycle.events`, no `operation_id`).
- **V3 (blueprint alignment):**
  - `orders.correlation_id`: one UUID per order workflow, set at creation (existing rows reuse the
    order ID);
  - `orders.credit_status` (`RESERVED`, `RELEASED`, `SETTLED`, `COMPENSATED`): set only by Credit
    outcomes, never changes the lifecycle state;
  - `outbox_events.operation_id`, unique, so a Credit outcome can be matched to its command;
  - `processed_events` (the inbox): `event_id` primary key, `event_type`, `aggregate_id`,
    `operation_id`, `fingerprint` (SHA-256 of the received event, for `EVENT_ID_CONFLICT`),
    `outcome`, `processed_at`.
- **V4 (lifecycle events):** `orders.lifecycle_sequence` (default 0), the last `sourceSequence`
  taken. A native `UPDATE … RETURNING` takes the next one in the transition's transaction, so it
  never bumps the JPA version and a rollback returns the number.
- **V5 (create idempotency):** `orders.idempotency_key` and `orders.idempotency_fingerprint`
  (SHA-256 of the original create request; both null or both set), with a unique partial index on
  `(requester_id, idempotency_key)`. Create takes a transaction-scoped advisory lock on the
  requester and key before looking the key up, so concurrent retries wait for the first one and
  then return its order; the unique index is the backstop.
- **V6 (outbox stream claim, after V5 from `order-create-idempotency`):** partial index `(aggregate_id, topic, created_at, id) WHERE
  published_at IS NULL`, for the relay's per-stream claim: it locks each order-and-topic stream's
  oldest unpublished row with `SKIP LOCKED`, then the rows behind it, so replicas never interleave
  one order's events.
- **V7 (pending-credit timeout):** partial index `(created_at, id) WHERE state = 'PENDING_CREDIT'` for
  the timeout scan. `created_at` is now stamped from the service `Clock` at creation, so the
  timeout and every deadline share one clock. The new reason fits `terminal_reason`.
- **V8 (credit reconciliation):** partial index on `processed_events (operation_id)`, so the
  reconciliation check can look each `order.events` command's `operationId` up in the inbox.
- **Reward editing** needs no migration: it maps the V1 `pending_credit_reward` column, and the
  new history actions (`EDIT`, `REWARD_CHANGE_APPLIED`, `REWARD_CHANGE_REJECTED`) fit the
  `order_transitions.action` VARCHAR.

## Code structure (all under `order-service/src/main/java/com/friendoncampus/order/`)
Built:
- `domain/Order.java`: the state machine. One method per transition (`open`, `failReservation`,
  `cancel`, `expire`, `accept`, `withdraw`, `pickUp`, `deliver`, `complete`, and for iteration 8
  `edit`, `applyRewardChange`, `rejectRewardChange`), each returning an
  `OrderTransition`; a rejected action throws `OrderTransitionException(code, currentState)`.
- `domain/`: `OrderAction`, `OrderErrorCode`, `TerminalReason`, `CreditEffect`, `CreditStatus`,
  `ActorRole`, and the `OrderTransitionRecord` history entity.
- `service/OrderService.java`: one `@Transactional` method per action. Each locks the row
  (`SELECT … FOR UPDATE`), applies lazy expiry, checks for a duplicate, applies the transition,
  then records history and the outbox event.
- `service/OrderExpiryScheduler.java` (the job) and `OrderExpirySchedule.java` (its 30 s timer,
  switched off with `ORDER_EXPIRY_ENABLED=false`).
- `messaging/OrderEventRecorder.java`: history row for every transition; blueprint envelope and
  payload in `outbox_events` for the five credit-changing events.
- `messaging/CreditOutcomeHandler.java`: applies one `credit.events` JSON message per the consumer
  rules above, with the `processed_events` inbox.

Built in iteration `order-kafka-messaging` (was "still to build"):
- `messaging/OutboxRelay.java`: `@Scheduled` every 1 s; claims unpublished rows with
  `FOR UPDATE SKIP LOCKED`; sends each with its stored `eventId`, payload and `aggregate_id` key;
  sets `published_at` only after Kafka acknowledges; on failure increments `attempts` and retries.
- `messaging/CreditEventsListener.java`: `@KafkaListener` on `credit.events`, group
  `order-service`, manual acknowledgement after `CreditOutcomeHandler` commits; three retries with
  backoff for transient errors, then the original record to `credit.events.DLT`. A
  `CreditOutcomeRejectedException` is not retried.
- `config/KafkaConfiguration.java`: producer `acks=all` with idempotence; SASL_PLAINTEXT/PLAIN
  client settings from `KAFKA_BOOTSTRAP_SERVERS`, `KAFKA_SECURITY_PROTOCOL`,
  `KAFKA_SASL_MECHANISM`, `KAFKA_USERNAME`, `KAFKA_PASSWORD` (see `deploy/kafka/README.md`).
  Topics and ACLs are created by the shared Kafka initializer, not by Order.
- New dependency `spring-kafka`; tests with Testcontainers Kafka.
- No credit stub: the real Credit Service consumes `order.events` on `main`.

## Iterations (each one is a `/foc-iterate-feature order-…` run)

| # | Iteration | Status |
|---|---|---|
| — | Create order with field validation; RS256 JWT identity | Done (PRs #32, #50) |
| 1 | `order-lifecycle-reservation-cancel`: V2 migration, history, outbox, reads, `open`, `failReservation`, `cancel` | Done (PR #56) |
| 2 | `order-lifecycle-accept-expiry`: `expire` (job + lazy), `accept`, `withdraw`, race tests | Done (PR #57) |
| 3 | `order-lifecycle-delivery`: `pickUp`, `deliver`, `complete`, duplicate completion | Done (PR #58) |
| 4 | `order-event-blueprint-alignment`: blueprint envelope/payloads, five published events, Credit outcome handler with inbox (V3) | Done (PR #59) |
| 5 | `order-kafka-messaging`: outbox relay to `order.events`, `credit.events` listener and DLT; Order in `compose.yaml` | Done (PRs #74, #75) |
| 6 | `order-discovery-history`: open-order pool (filters, sorting, paging), "my orders" history (F4, F9) | Done (PR #65) |
| 7 | `order-location-snapshot`: client-supplied location names on create (edit comes with iteration 8) | Done (PR #62) |
| 8 | `order-edit-reward`: edit details (T4) and reward through `OrderRewardChangeRequested` / `CreditAdjusted` (T5, T5a, T5b) | Done (PR #65) |
| UI | Errand UI: browse, errand detail and active orders, my errands, request a hand, aligned header; Order frontend CI | Done (PRs #66, #73, #77, #79) |
| k8s | Kubernetes image bump to the latest Order image | Done (PR #80); Kafka enabled in the cluster by the shared Kafka change (#84) |
| UI | Errand entry points on the User Profile page: header link and role-specific cards (User frontend, with the User owner's sign-off) | Done (PRs #85, #86) |
| UI | `order-ui-credit-check`: Post errand disabled unless the browser-read balance covers the reward | Done (PR #87) |
| UI | `order-my-errands-active`: My errands Active/Past for the header role (`status=active\|past`, `state` filter); role-based underline tabs | Done (PR #88) |
| UI | `order-ui-await-reservation`: Post errand waits for Credit; rejection reason stored as `terminalReason` and explained on the form | Done (PR #90) |
| k8s | Image bump after #87, #88 and #90 | Done (PR #91) |
| UI | `order-ui-reason-heading`: errand page heading and status badge name the rejection reason | Done (PR #92) |
| 10 | `order-lifecycle-events`: `OrderTransitioned` for every transition on `order.lifecycle.events` (shared N2H contract), per-order `sourceSequence` (V4), `causationId` for Credit-driven transitions, per-topic relay blocking; off by default, on in Compose | Done (PR #117) |
| UI | `order-ui-role-scoped-errand`: an errand page that doesn't belong to the header role (on load or after a switch) goes to that role's own screen | PR #120 |
| UI | `order-ui-design-alignment`: Order screens meet the shared `design.md` contract (button states, card radius, Lucide icons, loading placeholders, actionable empty/error panels, focus colour) | PR #123 |
| UI | `order-ui-reorder`: Post again on a requester's ended errands opens Request help filled in except Pick up by (frontend only, existing `GET /api/orders/{id}`) | This change |
| 11 | `order-create-idempotency`: optional `Idempotency-Key` on `POST /api/orders` (V5); a retry with the same key and body returns the first order (`200`) with no second `OrderSubmitted` or reservation, a changed body is `409 IDEMPOTENCY_KEY_REUSED`; the create page sends one key per errand content | Done (PR #152) |
| 12 | `order-messaging-hardening`: relay claims whole order-and-topic streams (V6), so replicas keep per-order order; batch 20 and a stuck-row `ERROR`; `OrderTransitionException`/unknown order go to `credit.events.DLT` without retries; `CreditReleased` must answer `OrderCancelled` or `OrderExpired`; `order.outbox.*` gauges on ADMIN-only `/actuator/metrics` | Done (PR #153) |
| 13 | `order-credit-reconciliation`: every 5 min, report `order.events` commands with no Credit outcome for their `operationId` 10 min (`PT10M`) after publishing (V8 index); WARN once per command with every ID, a credit-timeout expiry counted apart at INFO, `order.credit.*` gauges on ADMIN-only metrics, README recovery runbook. Detection only, never re-sends | Done (PR #158) |
| 14 | `order-pending-credit-timeout`: a PENDING_CREDIT order Credit does not answer by `min(pickupDeadline, createdAt + PT2M)` expires with `CREDIT_RESERVATION_TIMEOUT` and the normal `OrderExpired` (V7); late `CreditReserved`/`CreditReservationRejected` are `IGNORED`; the UI and Notification say the errand was not posted. Contract: blueprint "pending-credit timeout" (Credit owns the absent-reservation no-op) | Done (PR #156) |
| 15 | `order-late-courier-free-cancel`: cancelling an ACCEPTED errand at or after its pickup deadline releases in full (`REQUESTER_CANCELLED_COURIER_LATE`, `compensationRequired=false`) instead of paying the late courier 20%; late pickup stays allowed and nothing expires automatically; the cancel dialog and errand page say so | Done (PR #160) |
| UI | `order-ui-friendly-copy-location-search`: searchable pickup/drop-off picker (ARIA combobox, filter by name/building/level, "Choose a location") on Request a hand and Edit errand; plain, short wording across the errand, create, edit and browse screens (no backend rules or "assigned courier"/"header" wording). Chat and Report text unchanged | Done (PR #166) |
| 16 | `order-auto-complete-delivered`: settle to the courier when a requester never confirms receipt | Not planned for D3 (XueTing, 2026-11-09): needs a confirmation window and Credit's agreement to a system-triggered settlement |
| 9 | Integration demo with User and Credit through the real broker (blueprint "Required integration demonstration") | Next. Credit's Kafka adapter is on `main` (#83); needs a demo script agreed with Credit and the broker owner |

## Decisions

Confirmed by XueTing (2026-11-09): **credit reconciliation reports a command after `PT10M`** without
an outcome, through logs and gauges only (no admin endpoint), and never re-sends.

Confirmed by XueTing (2026-11-09): **the pending-credit timeout is `PT2M`** (Credit's draft value),
configurable with `ORDER_CREDIT_RESERVATION_TIMEOUT`.

Confirmed by XueTing (2026-10-18):
- **Late pickup is allowed:** a courier may pick up an `ACCEPTED` order after the pickup deadline
  (rule 3).
- **Re-acceptance is allowed:** a courier who withdrew may accept the same order again (rule 9).
- **Edits are a full form, not single-field updates.** `PATCH /api/orders/{id}` takes every editable
  field (title, description, both locations, pickup deadline, reward) plus `version`, the way the
  edit form sends the whole errand back. The order keeps its ID, history and state; only those
  fields change.
- **The requester may cancel while a reward change is waiting for Credit.** After a reward edit the
  order stays `OPEN` with `pending_credit_reward` set until Credit replies. A cancel (or expiry) in
  that window clears the pending value and Credit releases the whole reservation; a late
  `CreditAdjusted` / `CreditAdjustmentRejected` is recorded as `IGNORED`. Credit must release the
  *adjusted* amount if it applied the adjustment before seeing `OrderCancelled`.

- **`RESERVATION_FAILED` orders are not shown in the requester's history** (F9.1); history lists
  only `COMPLETED`, `CANCELLED` and `EXPIRED` errands.

Implementation details (no decision needed):
- Resending the order's current values (pending reward counted as the reward) is a `200`
  duplicate even with an old `version` or while the change is pending; the duplicate check comes
  after the state guard because an edit has no distinct target state.
- A rejected adjustment is visible only through the history (`REWARD_CHANGE_REJECTED`); Credit's
  `reasonCode` is not stored.
- **Resolved by the blueprint:** topic and event names, payloads, `operationId`, compensation
  (`ceil(reserved × 20 / 100)` to the courier, the rest released).

## Verification
- **Every iteration:** `cd order-service && ./mvnw -B verify` with JDK 17.
- **Unit:** a table-driven state-machine test covering every (state, action) pair, with the expected
  result or error code. Deadline-boundary tests use a fixed `Clock`:
  - `now == deadline` means expired;
  - `now == deadline − 1 ms` means still open.
- **Database and race tests:**
  - add Testcontainers PostgreSQL, which needs Docker running;
  - test two concurrent accepts (exactly one gets 201, the other `ORDER_ALREADY_ACCEPTED`);
  - test accept against the scheduler at the deadline;
  - test a duplicate `complete` (one `OrderCompleted` outbox row);
  - test that a failed transition writes no history and no outbox row.
- **Kafka tests (iteration 5):** Testcontainers Kafka (`org.testcontainers:kafka`).
  - Blueprint-shaped `CreditReserved` opens the order (already covered at the handler level).
  - Publishing the same `CreditReserved` twice gives one state change (inbox de-duplication).
  - With the broker down, rows stay unpublished; once it's back the relay delivers them.
  - A poison message lands in `credit.events.DLT`.
- **Security:** a 403 for each wrong session role or non-participant, and `SELF_ACCEPTANCE_FORBIDDEN`.
- **Docs:**
  - save this design as `order-service/DESIGN.md` and link it from the README;
  - update the README lifecycle table to match;
  - replace the README line saying location names "arrive asynchronously via an event". The client
    now supplies them, and they're required by the application even though the V1 columns allow null.
