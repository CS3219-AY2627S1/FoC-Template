# Notification Service design

## Context

- **Notifications are an N2H feature** owned by XueTing ([TASK_SPLIT.md](../TASK_SPLIT.md)).
- **Order's lifecycle is the main source of facts** ([Order DESIGN](../order-service/DESIGN.md)),
  together with Credit's outcomes in the shared
  [event communication blueprint](../docs/integration/event-communication-blueprint.md).
- **The wireframes show a bell and a Notifications page**, but no backend exists yet
  ([Order design-source](../order-service/frontend/docs/design-source.md)).
- The service keeps only enough to show "what happened to me, on which errand, and have I seen it".
  Anything else is fetched from the service that owns it, for example the errand details when the
  user clicks through.

## Architecture

```
Order ──► order.lifecycle.events (proposed) ─┐
Credit ─► credit.events ─────────────────────┼─► Notification Service ──► notification-db (private)
                                             │       ▲
User Service ── JWKS ──► (token verification)│       │ GET /api/notifications/me (Bearer JWT)
                                                 UI ─► Gateway
```

- **Database per service.** Only Notification touches `notification-db`. It stores user and order
  UUIDs, never foreign keys into other services.
- **Consumer only.** Notification publishes nothing and calls no other service. The only
  synchronous outbound call is the JWKS fetch.
- **Reliability:** at-least-once delivery from Kafka, inbox de-duplication by `eventId`, a
  business key per source operation, and acknowledgement only after commit.

## What is stored, and what isn't

| Stored | Not stored |
| --- | --- |
| Who the notification is for (User UUID) | Emails, usernames, or any other profile data (User owns these) |
| What happened (type, order ID, a few values like the credit amount) | A copy of the order or the credit balance (Order and Credit own these) |
| Which event it came from (`eventId`, `correlationId`) | Tokens, passwords, or full event payloads |
| Whether it has been read (`read_at`) | The message text (built from a template when read, so wording can change later) |

## Data model

`V1__create_notifications.sql` and `V2__retention_indexes.sql` (applied migrations are never
edited). The columns and reasons are in the
[README](README.md#data-model-and-delivery-guarantees). Differences from the first draft:

- **No foreign key from `notifications.source_event_id` to the inbox.** Inbox rows are pruned sooner
  than notifications, and the foreign key would block that. `UNIQUE (source_event_id, recipient_id)`
  still blocks a duplicate row.
- **No CHECK on `notifications.type`.** Java validates it, so a new type needs no migration.
  `notification_inbox.outcome` is checked (`NOTIFIED`, `IGNORED`, `DUPLICATE_OPERATION`).
- **`business_key` with `UNIQUE (recipient_id, type, business_key)`** (blueprint rule). Credit
  outcomes get a fresh `eventId` every time Credit processes an operation, including one it already
  applied, so `eventId` alone cannot stop a reconciliation replay from notifying twice. The key is
  Credit's `operationId`; for Order it will be `orderId:sourceSequence`. The handler looks the key up
  before inserting, so a repeat is recorded as `DUPLICATE_OPERATION` and acknowledged.

## Event mapping

### From `credit.events` (built)

| Credit event | Recipient | Type |
| --- | --- | --- |
| `CreditAccountAllocated` | `data.userId` | `CREDITS_WELCOME` |
| `CreditSettled` | `data.courierId` | `CREDITS_RECEIVED` |
| `CourierCompensated` | `data.courierId` (the requester cancelled, so is not told) | `CREDITS_COMPENSATED` |
| Every other type, including future ones | nobody | inbox row `IGNORED` |

Credit events carry no errand title, so these messages do not name the errand; the notification
links to it through `orderId`.

### From `order.lifecycle.events` (built, iteration 5)

The actor (`actor.userId`) is never notified.

| Transition | Recipient | Type |
| --- | --- | --- |
| T2 `PENDING_CREDIT → OPEN` | requester | `ORDER_OPENED` |
| T3 `→ RESERVATION_FAILED` | requester | `ORDER_RESERVATION_FAILED` (`params.reason`) |
| `PENDING_CREDIT → EXPIRED` (credit timeout, `CREDIT_RESERVATION_TIMEOUT`) | requester | `ORDER_RESERVATION_FAILED` (`params.reason`): the errand never reached the pool |
| T8 `OPEN → ACCEPTED` | requester | `ORDER_ACCEPTED` |
| T9 `ACCEPTED → OPEN` (courier withdrew) | requester | `ORDER_COURIER_WITHDREW` |
| T10 `ACCEPTED → EXPIRED` (withdrew after deadline) | requester | `ORDER_EXPIRED` |
| T2b, T7 `→ EXPIRED` | requester | `ORDER_EXPIRED` |
| T11 `ACCEPTED → CANCELLED` | the courier before the change | `ORDER_CANCELLED` |
| T12 `→ PICKED_UP` | requester | `ORDER_PICKED_UP` |
| T13 `→ DELIVERED` | requester | `ORDER_DELIVERED` |
| T14 `→ COMPLETED` | courier | `ORDER_COMPLETED` |
| T1, T4, T5, T5a, T5b, T6 | nobody (the requester acted, no one else is involved, or no contract type) | recorded `IGNORED` |

The courier gets two notifications for T11 and T14: `ORDER_CANCELLED` + `CREDITS_COMPENSATED`, and
`ORDER_COMPLETED` + `CREDITS_RECEIVED`. Both are kept, so the lifecycle news is not delayed by
Credit (approved 2026-11-04).

### Reminders (built, iteration 11)

Approved 2026-11-10. Derived from the errand state each `OrderTransitioned` reports, not from the
action, so a missed or repeated event cannot leave a wrong reminder behind:

| Errand state after the event | Reminders kept or armed (recipient, due) |
| --- | --- |
| `OPEN`, no courier | `ORDER_STILL_OPEN` (requester, `pickupDeadline − 30 min`) |
| `ACCEPTED` | `PICKUP_DUE_SOON` (courier, `− 15 min`) and `PICKUP_OVERDUE` (courier, at the deadline) |
| any other | none; pending ones are cancelled |

Decisions: a reminder already past when it would be armed is skipped; the requester text suggests
raising the reward or moving the pickup time without naming an amount; extending the deadline
reminds again for the new one; a reminder sent more than 30 minutes late is dropped (`MISSED`).
Stored in `notification_reminders` (V4): order, recipient, type, deadline, due time, title, status,
the event that armed it. Sent reminders are ordinary notifications with business key
`reminder:{id}`.

## Proposed contract: `OrderTransitioned` on `order.lifecycle.events`

**Status: proposed, not approved.** The shape is the shared one in
[n2h-events.schema.json](../docs/contracts/n2h-events.schema.json) (example in
[events.examples.json](../docs/contracts/events.examples.json)); Chat consumes the same event, so
neither consumer renames fields. Until it is approved nothing publishes or consumes it.

| Item | Proposal |
| --- | --- |
| Producer | Order Service (XueTing), through its existing transactional outbox |
| Consumers | Notification (group `notification-service`) and Chat (group `chat-service-timeline`) |
| Topic | `order.lifecycle.events`, 3 partitions, 7-day retention; `order.lifecycle.events.DLT`, 1 partition, 30 days |
| Key | Order UUID, so one errand's events stay in order |
| Why a new topic | Credit rejects unknown event types on `order.events`, so adding them there would force a Credit change |
| Envelope | The blueprint's required envelope: `eventType` = `OrderTransitioned`, `aggregateType` = `Order`, `aggregateVersion` = the order version after the change, `producer` = `order-service`, the order's `correlationId`, `causationId` = the Credit outcome's `eventId` for T2, T2b, T3 and T5b, otherwise null, and `actor` |
| Operation identity | `eventId` per message; `orderId` + `sourceSequence` per transition. There is no `operationId`, because no credit effect is requested |
| Duplicates | The Notification inbox ignores a repeated `eventId`; the business key `orderId:sourceSequence` ignores the same transition under a new `eventId`. Order writes exactly one outbox row per applied transition and none for a duplicate or rejected request |
| Failure and retry | Order's outbox relay retries until Kafka acknowledges. Notification retries transient failures three times and then dead-letters; rejected events go straight to the DLT |
| Reconciliation | Notifications are informational, so a lost event means a missing notification, not a wrong balance. A gap in `sourceSequence` is logged, never filled by guessing. A DLT record can be replayed after it is fixed |
| Observability | Both sides log `eventId`, `eventType`, `correlationId`, `orderId`, `sourceSequence` and outcome; DLT counts are monitored with the others |

`data` (an acceptance):

```json
{
  "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
  "requesterId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
  "previousCourierId": null,
  "courierId": "5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10",
  "fromState": "OPEN",
  "toState": "ACCEPTED",
  "action": "ACCEPT",
  "sourceSequence": 4,
  "reasonCode": null,
  "snapshot": {
    "orderId": "513ea56a-41d5-49ad-b6c5-df81e2dd2b25",
    "requesterId": "1fd9b5c8-16cc-4460-a1cc-bc5ce0347a97",
    "courierId": "5b0f3c1e-8a52-4f8e-9d37-2c1b6e4a7f10",
    "status": "ACCEPTED",
    "title": "Buy coffee",
    "description": "Flat white from the library cafe",
    "creditReward": 3,
    "pickupDeadline": "2026-10-30T10:00:00Z",
    "pickupLocationId": "…",
    "dropoffLocationId": "…",
    "pickupLocationName": "Library cafe",
    "dropoffLocationName": "Block E lobby"
  }
}
```

- `action` is one of `SUBMIT`, `OPEN`, `FAIL_RESERVATION`, `CANCEL`, `EXPIRE`, `ACCEPT`,
  `WITHDRAW`, `PICK_UP`, `DELIVER`, `COMPLETE`, `EDIT`, `REWARD_CHANGE_APPLIED`,
  `REWARD_CHANGE_REJECTED`. Details-only edits are published too (`fromState` = `toState`), because
  Chat's timeline needs them; Notification records them as `IGNORED`.
- **`previousCourierId` keeps the courier a transition removed.** Withdrawal (T9, T10) and
  cancellation after acceptance (T11) clear `courierId`, so the recipient for those rows is
  `previousCourierId`. `snapshot.status` equals `toState`.
- `reasonCode` is the safe, approved reason for `RESERVATION_FAILED` and rejected reward changes;
  otherwise null. Notification shows only approved codes, never free text.
- `snapshot` is the order as it was right after the change, so later edits do not rewrite past
  notifications and Notification never calls Order.

### `sourceSequence`

A per-order counter for published transitions, from the shared rule "starts at 1 and is contiguous
per source/stream/aggregate, not entity version" ([contract notes](../docs/contracts/README.md)).

- **Only committed transitions take a number.** Order increments it in the same transaction that
  writes the transition and its outbox row; a rejected or rolled-back request (a late accept, a
  race loser, a repeated action) takes none. So consumers can treat a gap as a missing event.
- **Not the JPA `version`.** That also changes for writes that publish nothing, such as Credit
  status updates, so it would leave gaps.
- **Lazy expiry** (an action on an overdue OPEN order) commits `OPEN → EXPIRED` with the next number
  and a `SYSTEM` actor, then rejects the action. The caller only triggered it, so the expiry is
  not attributed to them and the requester is still notified.
- Order stores the last number taken in `orders.lifecycle_sequence` (Order V4). Publishing is
  behind `ORDER_LIFECYCLE_EVENTS_ENABLED`, off by default and on in Compose. While it is off no
  number is taken; when it is turned on, each order's stream starts at 1 from its next transition
  and earlier transitions are never published, so a consumer must not expect history from before
  that point.

Example: submit (1), opened (2), title edited (3), Alice accepts (4), Alice withdraws (5), Bob
accepts (6). The requester gets `ORDER_ACCEPTED` twice, keys `513ea56a…:4` and `513ea56a…:6`;
an accept after expiry adds nothing.

## Planned shared changes

The plan was approved on 2026-11-04 (iteration 0). Each shared file still has one nominated editor
and needs review from the affected owners when it is changed ([root AGENTS.md](../AGENTS.md)).
Iteration 3 applied the Kafka, secrets, Compose/`.env.example`, gateway and CI rows. The
Kubernetes, network-policy, header, observability and rate-limit rows remain planned.

XueTing owns Notification's Kafka and Kubernetes changes (from 2026-11-07).

| Area | Change | Owner |
| --- | --- | --- |
| Kafka topics and ACLs (`deploy/kafka/initialize.sh`, `verify.sh`) | Create `order.lifecycle.events` and its DLT. Add user `notification_service`: Read and Describe on `credit.events` and `order.lifecycle.events`, Read on group `notification-service`, Write on `credit.events.DLT` and `order.lifecycle.events.DLT`, and IdempotentWrite. Give `order_service` Write on `order.lifecycle.events`. Give `kafka_ui` read access to the new topics and group. | XueTing |
| Kafka secrets (`broker-entrypoint.sh`, `k8s/New-KafkaSecrets.ps1`, `k8s/broker.yaml`, `Test-LocalKafka.sh`) | Add the password `KAFKA_NOTIFICATION_SERVICE_PASSWORD` | XueTing |
| DLT sharing | Notification writes failed `credit.events` records to the existing `credit.events.DLT`. Spring's `kafka_dlt-original-consumer-group` header says which consumer failed | XueTing |
| Compose and `.env.example` | Add `notification-service` and `notification-db`, the `NOTIFICATION_DB_*` variables and the Kafka password. Every new `${VAR:?}` goes into `.env.example`, every CI job that runs Compose and `Test-LocalKafka.sh` | All |
| Gateway (`application.yml`, `k8s/deployment.yaml`) | Routes `/api/notifications/**` and `/docs/notification/openapi.json`, later the UI routes, and `NOTIFICATION_SERVICE_URL` | Gateway nominee |
| Kubernetes | Add `notification-service/k8s/` (copied from Order's layout), and `notification` in `New-DatabaseSecret.ps1` and `Test-LocalDeployment.ps1` | XueTing |
| Network policies (`deploy/k8s/network/policies.yaml`) | New `foc-notification` and `foc-notification-db` policies. Add `notification-service` to `foc-user` ingress, the Kafka client policy and gateway egress (port 8086) | XueTing |
| CI | Add `notification-service` to `SERVICES` in `image_plan.py` and its test, and a backend job in `ci.yml` | All |
| Header bell | A link and badge in every service's header (iteration 7, done) | Darryl, Jun Hui, Eldridge |
| Observability | Expose Notification metrics (endpoint to agree) and add its dashboards and alerts (iteration 9) | Jun Hui |
| Gateway rate limit | A per-user limit on `/api/notifications/**` against runaway polling | Gateway nominee |

## Decisions

Approved with the iteration 0–2 brief (2026-11-02):
- Failed `credit.events` records go to the shared `credit.events.DLT`; no new DLT topic.
- Any session role, including `ADMIN`, may read; each user reads only their own notifications.
- `GET /api/notifications` returns stored rows from iteration 1 on (moved to `/me`, below).
- The requester gets no notification for `CourierCompensated`.

Approved with the `read-api` brief (2026-11-03):
- The read API follows the shared contract: `GET /api/notifications/me`, `content`/`totalElements`,
  size 1–100, server-rendered `message` and `readAt`.
- Credit notifications are also de-duplicated by `operationId`; a repeat is `DUPLICATE_OPERATION`.
- `OrderTransitioned` uses the shared schema (`previousCourierId`, `reasonCode`, `snapshot`,
  `sourceSequence`) instead of this document's first draft.

Approved with iteration 0 (2026-11-04):
- The contract proposal and the [planned shared changes](#planned-shared-changes).
- A separate `order.lifecycle.events` topic rather than more events on `order.events`.
- The courier keeps both notifications for T11 and T14.
- **Retention:** delete read notifications after 30 days and every notification after 90 days.
  Keep inbox rows **at least 30 days**: DLT topics retain records for 30 days, so a replay after the
  inbox row was pruned would notify twice. Enforced by the retention job (iteration 8): "read"
  counts from `read_at`, "every notification" from `created_at`, and startup refuses an inbox
  period under 30 days.

Approved with the `ui` brief (2026-11-08):
- The bell goes in the header of every frontend (User, Supplier, Order, Credit, Admin and
  Notification), between the role selector and the account menu; `design.md` records it.
- The page wording in the README, and opening an errand also marks the notification read.

Approved with the `order-lifecycle` brief (2026-11-08):
- The 9 `ORDER_*` types of the shared contract and the README wording. No
  `ORDER_REWARD_CHANGE_REJECTED`: it is not in the contract, so a rejected reward change notifies
  nobody for now.
- The errand title from the snapshot is stored in `params`; the reservation reason as its code.
- A `sourceSequence` gap is logged and the event still handled.

Approved with the `read-state` brief (2026-11-05):
- Read marking follows the shared contract; repeating it keeps the first `readAt`.
- Errors `NOTIFICATION_NOT_FOUND` (404, including another user's notification) and `INVALID_ID`
  (400), in Order's style.
- The unread count is a separate endpoint, added to the shared contract (below). No mark-all-read
  for now.

### Contract addition: unread count

Added to the shared package with this change (`build_contracts.py`, regenerated
[n2h.openapi.json](../docs/contracts/n2h.openapi.json) and `http.examples.json`).

| Item | Contract |
| --- | --- |
| Operation | `GET /api/notifications/me/unread-count`, `operationId` `notification_get__api_notifications_me_unread_count`, `x-owner` `notification-service`, `security` `userBearer` |
| `200` body | Schema `UnreadCount`: `{ "unreadCount": integer, minimum 0 }`, required, `additionalProperties: false` |
| Errors | The package's standard `Problem` set (`400`, `401`, `403`, `404`, `409`, `503`), like every operation; this service returns `401` and `403` |
| Example | `{"unreadCount": 3}` in `http.examples.json` |
| Why separate | `NotificationPage` sets `additionalProperties: false`, so a field there is a contract change too; a separate call keeps the bell's poll to one indexed count, without a page query |

To confirm with the team:
1. How metrics are exposed and collected (iteration 9), and the alert thresholds.
2. Whether the gateway rate-limits `/api/notifications/**`, and at what rate.

Implementation details (no decision needed):
- `auto-offset-reset=earliest`: on first start the service reads the 7 days still on `credit.events`,
  so recent accounts get their welcome notification.
- Live updates use polling first (iteration 7); server-sent events are optional (iteration 10).
  They would need a way to send the token, because the browser's `EventSource` cannot set an
  `Authorization` header and a token in the URL leaks into logs.

## Practices review (2026-11-04)

Checked against a general multi-channel notification design (validator, preference manager,
template engine, router, one queue and worker pool per channel, provider fallback, monitoring).
Notification is in-app only (no email/push/SMS, see the README scope), so the channel half does not
apply.

| Practice | Here | Decision |
| --- | --- | --- |
| Versioned event schema: ID, type, version, time, generic data | Blueprint envelope; `eventVersion` checked | In place. An unsupported version of a mapped type goes to the DLT, so this consumer must accept a new version before its producer emits it |
| At-least-once delivery with idempotency keys | Ack after commit; inbox by `eventId`; business key per operation | In place. Keys live in the same PostgreSQL transaction as the notification, not a Redis cache: a cache check is not atomic with the write and loses keys on eviction. No Redis |
| Templates outside code | `NotificationMessages`, rendered when read | Keep templates in code, with a test per type. A database template store lets copy change without review or tests, and only the team edits copy. Rendering when read already gives the main benefit: new wording applies to past notifications without a migration |
| Preference manager | None | Muting types is not in the backlog; adding it is new scope and needs approval |
| Router, channel queues, workers, provider fallback | None | Not applicable; see [Fallback](#fallback) |
| Event-driven, not polling a database for new events | Kafka consumer | In place. The bell's polling (iteration 7) is different: a browser asks for its own unread count; no service scans a table to discover events |
| Horizontal scaling | Stateless service; group `notification-service` on 3 partitions | Up to 3 consumer instances share the work; more sit idle. The record key (order or user ID) sends every event for one aggregate, including a republished Credit outcome, to one partition, so duplicates are handled one after another; the unique business key covers the rest. API instances scale freely |
| Sharding, multi-region, channel partitioning | One PostgreSQL | Not needed at D3 scale; the recipient indexes cover NF2. Revisit only if NF2 fails under the agreed load |
| Rate limiting | None | Polling browsers are the main load. Limiting belongs in the gateway (gateway nominee); iteration 7 keeps polling light ([Polling](#polling)) |
| Observability | Logs with `eventId`, `eventType`, `correlationId`, outcome; health only | Expanded in iteration 9 ([Observability](#observability)) |

### Fallback

No channel fallback is needed.

- **Delivery is a database write** in Notification's own transaction. No provider can fail after a
  "send". Broker and database errors are retried and then dead-lettered; an outage leaves events on
  Kafka (7-day retention) to consume on restart. Only an outage longer than that loses
  notifications.
- **The inbox is the fallback for an offline user:** the notification waits until they open the app.
- **Notifications are informational.** The errand page and Credit balance stay authoritative, so a
  missing notification never hides a fact. Nothing here is security- or time-critical; account
  emails such as verification belong to User Service.
- **The in-app equivalent is in the UI:** if a poll fails, keep the last known count or show an
  error, never a misleading `0`.

### Polling

For the bell (iteration 7): poll only the unread count, about every 30 seconds, and only while the
tab is visible; refresh when the tab regains focus; back off exponentially after errors. The list
loads when the Notifications page opens, not on every poll.

### Observability

For iteration 9, with Jun Hui (observability owner, [TASK_SPLIT.md](../TASK_SPLIT.md)):

- **Metrics** (Micrometer through Actuator; the exposure endpoint is agreed with Jun Hui):
  - events handled per topic and outcome (`NOTIFIED`, `IGNORED`, `DUPLICATE`,
    `DUPLICATE_OPERATION`, rejected): throughput and failure rate
  - delay from fact to notification, `created_at - occurred_at`: delivery latency
  - consumer lag and DLT record count
  - `/me` requests by status and duration: NF1 success rate and NF2 P95
  - share of notifications read (`read_at` set), after iteration 6: engagement
- **Alerts (proposed thresholds):** any new DLT record; consumer lag growing for 5 minutes; `/me`
  server errors above 1% over 10 minutes (NF1 allows 1%).
- **Logs:** one structured line per handled event with `eventId`, `eventType`, `correlationId`,
  outcome, and the notification and recipient UUIDs when one is stored. Put `correlationId` in the
  log context so every line for one event can be found. `correlationId` already links Order, Credit
  and Notification for one errand; no tracing system is in the repo. Never log tokens or payloads.

## Iterations

Each one is a `/foc-iterate-feature notification-…` run.

| # | Iteration | Status |
|---|---|---|
| 0 | Contract proposal and shared-change plan (this document) | Done; approved 2026-11-04 |
| 1 | Service skeleton: Flyway V1, JWT validation, health, OpenAPI, notification list | Done |
| 2 | `credit.events` consumer: inbox, fingerprint, DLT; `CREDITS_*` notifications | Done |
| 2a | `read-api`: shared-contract list API with messages; `operationId` business key | Done (PR #114) |
| 3 | `wiring`: Kafka identity, ACLs and lifecycle topic, Compose, gateway routes, CI job; port 8086 | Done (PR #116) |
| 3b | `k8s`: Notification and its database in `foc-local`, network policies, gateway env, Order lifecycle events on | Done (this change) |
| 4 | `order-lifecycle-events`: Order publishes `OrderTransitioned` to `order.lifecycle.events` | Done (PR #117); on in Compose, off in Kubernetes until 3b |
| 5 | `order-lifecycle`: `order.lifecycle.events` consumer, the 9 `ORDER_*` notifications, business key `orderId:sourceSequence`, gap warning (V3) | Done (this change) |
| 6 | `read-state`: `PATCH /api/notifications/me/{id}/read`, unread count | Done (PR #115) |
| 7 | `ui`: Notifications page, header bell in all six frontends, polled unread count ([Polling](#polling)) | Done (this change) |
| 8 | `retention`: hourly batched deletion for the approved 30/90-day policy (V2 indexes) | Done (this change) |
| 9 | Observability: metrics, alerts and structured logs ([Observability](#observability)) | After 3 |
| 10 | Optional: server-sent events for the badge | If time allows, after 7 |
| 11 | `pickup-reminders`: `ORDER_STILL_OPEN`, `PICKUP_DUE_SOON`, `PICKUP_OVERDUE` from lifecycle events; minute sender with `SKIP LOCKED` (V4) | Done (this change) |

## Verification

- **Every iteration:** `cd notification-service && ./mvnw -B verify` with JDK 17 and Docker running.
- **Handler:** each mapping, the IGNORED case, duplicates, the same `operationId` under a new
  `eventId` (`DUPLICATE_OPERATION`), `EVENT_ID_CONFLICT`, and every envelope or field violation
  rejected with nothing stored.
- **Read API:** the contract shape, each type's message, paging limits 1–100.
- **Read state:** `readAt` set once and kept on repeat and concurrent calls, `404` for another
  user's notification with nothing changed, `400` for a malformed ID, the unread count per
  recipient, and every other read-state route denied.
- **Kafka:** a published event becomes a notification, a redelivery stays at one row, and a
  rejected event reaches the DLT with its key and the `notification-service` group header.
- **Security:** `401` without a valid token, every role reads only its own `sub`, and other
  paths and methods are denied.
