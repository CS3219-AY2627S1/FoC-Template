# Order Service API and event contracts

Implemented Order-side contract, updated 2026-10-16. D3 is the main implementation/demo
guide; requirement IDs remain the team's M3/M4 identifiers. Credit implements
the interface below in its [own service](../credit-service/API.md). No fake Credit
success is enabled in the runtime. Order supports acceptance, cancellation and
expiry, pickup, delivery, completion, disputes and overdue tracking with durable terminal-event
publication. Real Credit consumes these events; publishing alone does not confirm wallet settlement.

## Identity and conventions

- Base `/v1`, camelCase JSON, UUID identifiers, whole-number credit units.
- Every business request needs `Authorization: Bearer <access token>`. Order
  forwards it to User `GET /v1/users/me`, which verifies the token/current session.
  Order uses only current user ID, ACTIVE status and system role; it neither
  trusts client actor IDs nor stores user tokens/profile data.
- Order owns relationship/role checks. User/Supplier failures are not bypassed.
  Health endpoints remain unauthenticated and do not check these dependencies.
- Fixed configured HTTP origins, redirects disabled, bounded dependency requests.
  Protect inter-service traffic with TLS or the deployment's trusted internal
  network. Never send credentials to browser-configured destinations.
- Safe errors: `{error: {code, message, correlationId, fieldErrors}}`; dependency
  bodies, SQL and credentials are not echoed. 401 means invalid identity, 403 is
  role/relationship denial, 404 hides inaccessible resources, 409 is a conflict or
  definitively closed creation, 422 is input validation, 503 is unavailable service/storage.

## Endpoints

| Method/path | Behavior |
| --- | --- |
| `POST /v1/orders` | Create with mandatory `Idempotency-Key`; 201 new, 200 successful replay, 202 unresolved operation. |
| `POST /v1/orders/{orderId}/accept` | Current non-requester accepts an eligible OPEN order; 200 participant view. |
| `POST /v1/orders/{orderId}/cancel` | Requester cancels an eligible OPEN order; 200 participant view, Credit release asynchronous. |
| `POST /v1/orders/{orderId}/pickup` | Assigned courier advances ACCEPTED to PICKED_UP. |
| `POST /v1/orders/{orderId}/deliver` | Assigned courier advances PICKED_UP to DELIVERED; no reward transfer yet. |
| `POST /v1/orders/{orderId}/complete` | Requester confirms DELIVERED to COMPLETED; atomically records transfer-event intent. |
| `POST /v1/internal/orders/{orderId}/disputes` | Admin Service only: holds ACCEPTED/PICKED_UP/DELIVERED in DISPUTED for a new dispute. See [Disputed errands](#disputed-errands-admin-dashboard-n2f3). |
| `POST /v1/internal/orders/{orderId}/disputes/{disputeId}/restore` | Admin Service only: a withdrawn or rejected dispute returns the errand to its earlier state. |
| `POST /v1/internal/orders/{orderId}/disputes/{disputeId}/accept` | Admin Service only: an accepted dispute marks the errand FAILED; atomically records release-event intent. |
| `GET /v1/order-creations/{operationId}` | Creator-only progress; no mutation/finalization. 404 for other users. |
| `GET /v1/orders` | Available OPEN assessment list; excludes reached acceptance deadlines even before an expiry worker exists. Optional `supplierId`. |
| `GET /v1/orders/mine?relationship=requester` | Current user's requested orders across states. `courier` selects their assigned orders. |
| `GET /v1/orders/{orderId}` | Participant detail; other authenticated users get assessment data only while available, otherwise 404. |
| `GET /v1/orders/{orderId}/history` | Participant-only chronological transitions; initially null to OPEN. Administrators use the separate read-only admin history route below. |
| `GET /v1/admin/orders` | Current ADMIN/SUPER_ADMIN only. Every errand, newest first. Optional `requesterId`, `orderId`, `participantId` (requester or courier), repeated `state`, `supplierId`, `createdFrom`, `createdTo` and `overdue` filters apply together. No admin mutations/disputes. |
| `GET /v1/admin/orders/{orderId}` | Current ADMIN/SUPER_ADMIN only; read-only participant view of any errand, 404 when unknown. |
| `GET /v1/admin/orders/{orderId}/history` | Current ADMIN/SUPER_ADMIN only; read-only chronological transitions of any errand. |
| `GET /v1/admin/orders/analytics?from&to` | Current ADMIN/SUPER_ADMIN only; analytics for errands created in an inclusive Asia/Singapore date range of at most 366 days. |
| `GET /v1/admin/orders/analytics/users/{userId}?from&to` | Current ADMIN/SUPER_ADMIN only; one user's errand counts by state, separately as requester and as courier. |

Lists/history use `page` (1–1,000,000) and `pageSize` (1–50, default 20).
Response: `{items, page, pageSize, total}`. Lists sort created time descending,
then order ID descending; history sorts sequence ascending. Pagination is stable
within each request, not a frozen snapshot across requests. Unknown query fields
are rejected. Courier results include orders assigned through acceptance.

Assessment data: order ID, supplier ID/pickup snapshot, description, delivery
collection point, reward, state, deadlines and created time. Participant/admin
query data additionally includes requester/courier IDs and updated time. No
reservation IDs, email, user profile or authentication information are returned.
Free-text content is not an automatic PII scrubber; do not enter contact secrets.

## Accept, cancel and expire (2026-10-11)

The two POST actions accept no body (or `{}`) and no query parameters. Caller
identity always comes from fresh User authentication. Client-supplied actors,
roles, state, deadlines and unknown fields are rejected with 422. No admin bypass.
Unlike creation, these actions do not require an idempotency key: the immutable
order/actor/action identifies the one permitted acceptance or cancellation.

| Action | Guard | Result / credit effect |
| --- | --- | --- |
| Accept | OPEN, not requester, database time strictly before acceptance deadline | ACCEPTED, assigned courier and acceptedAt; existing reservation stays reserved |
| Cancel | OPEN, requester, database time strictly before acceptance deadline | CANCELLED, cancelledAt and `order.cancelled.v1`; Credit release pending |
| Expire | OPEN, acceptance deadline reached/passed | EXPIRED, expiredAt and `order.expired.v1`; Credit release pending |

Expiry is an independent worker action, not a public endpoint or a side effect of
a rejected request. At deadline equality, both accept and cancel return 409
`DEADLINE_PASSED`, even if the worker has not persisted EXPIRED yet. OPEN listings
already exclude such orders. Expiry never changes ACCEPTED orders. `expiredAt`
is the actual persisted transition time, not a fabricated deadline timestamp;
compare it with acceptanceDeadline when measuring expiry latency.

Every mutation locks the Order row, obtains PostgreSQL `clock_timestamp()` after
the lock, rechecks guards, then commits state/timestamp, history and any terminal
outbox event in one transaction. No dependency call is made while holding the
lock. Accept/cancel races before the deadline produce one winner; at/after it,
neither is eligible and expiry wins. Worker replicas use SKIP LOCKED batches.

Retries by the assigned courier return the current participant view without
another acceptance (including after later fulfilment advances). Repeated requester
cancellation of CANCELLED returns the existing view. No duplicate history/event
is added. Conflicting or other non-OPEN actions return 409 `ORDER_NOT_OPEN`;
self-acceptance returns 403 `SELF_ACCEPTANCE`; missing order or unrelated
cancellation returns 404 `NOT_FOUND`. Conflict bodies never expose participant
IDs. Authentication/dependency errors still fail closed. A lost response can be
retried with the same action and actor; it cannot reserve or release twice in Order.

Participant responses add nullable `acceptedAt`, `cancelledAt`, `expiredAt`.
History represents expiry as `actorType: "SYSTEM", actorId: null`; user actions
retain their authenticated UUID. History ordering remains per-order sequence.

## Administrator oversight and analytics (Admin Dashboard N2)

These read-only routes re-check the caller's current ADMIN/SUPER_ADMIN role with User on every
request (403 otherwise) and never change errands. Apart from
[disputes](#disputed-errands-admin-dashboard-n2f3), administrators cannot accept, fulfil,
complete, cancel or fail errands, and the participant routes keep their rules for every caller.

- Creation-date filters and analytics periods are Asia/Singapore (UTC+8) calendar days:
  `createdFrom`/`from` starts at 00:00 SGT and `createdTo`/`to` includes that whole day. A
  start later than the end, an unknown state or an unknown query field returns 422.
- `overdue=true` selects errands with a recorded overdue marker; `overdue=false` the rest.
- Analytics covers errands created in the period: counts by state, daily creations, and
  completion, cancellation, expiry and failure rates. Each rate is the number of those errands
  now in that state divided by all errands created in the period, or `null` (N/A) when none were
  created. Requesters and couriers are counted separately; a user in both roles counts once in
  `distinctParticipants`. Mean creation-to-completion minutes cover COMPLETED errands, overall
  and per supplier, or `null` when there are none. Supplier names come from the latest stored
  pickup snapshot.
- Analytics is computed on request from Order's own records and states its period, time zone and
  generation time.

## Disputed errands (Admin Dashboard N2F3)

Participants no longer fail errands themselves. A requester or courier who reports a problem, or
an administrator who records one, holds the errand in `DISPUTED` until the dispute is withdrawn
or decided. Admin Service owns the dispute and its workflow; Order only stores the errand's
state and moves credits through its existing terminal path.

These routes are internal. They require `X-FoC-Service-Secret` equal to Order's
`ADMIN_SERVICE_SECRET` (Admin Service's `ORDER_SERVICE_SECRET`) and are not routed by the edge
proxy, so a participant cannot skip Admin Service's dispute rules. Admin Service also forwards
the acting user's bearer token: Order re-checks it with User, requires a participant of the
errand for `actorType: "USER"` and a current ADMIN/SUPER_ADMIN for `actorType: "ADMIN"` and for
accepting.

| Route | Body | Allowed from | Result |
| --- | --- | --- | --- |
| `POST .../disputes` | `{"disputeId": uuid, "actorType": "USER" \| "ADMIN"}` | ACCEPTED, PICKED_UP, DELIVERED | DISPUTED, remembering `disputedFromState`, `disputeId` and `disputedAt`. |
| `POST .../disputes/{disputeId}/restore` | `{"actorType": "USER" \| "ADMIN"}` (USER: the reporter withdrew; ADMIN: rejected) | DISPUTED for this dispute | The remembered state; the dispute fields are cleared. |
| `POST .../disputes/{disputeId}/accept` | `{"reason": FailureReason, "details": string?}` | DISPUTED for this dispute | FAILED with the reporter's selected reason and `Other` text; `order.failed.v1` releases the reserved reward to the requester. |

- `FailureReason` is one of `ITEM_UNAVAILABLE`, `ITEM_DAMAGED`, `UNABLE_TO_PICK_UP`,
  `UNABLE_TO_DELIVER`, `PARTICIPANT_UNREACHABLE` or `OTHER`; `details` is trimmed nonblank text
  up to 500 characters and is required for `OTHER`.
- Only one dispute holds an errand at a time: another dispute returns `409 DISPUTE_OPEN`. Any
  other source state returns `409 INVALID_TRANSITION`; COMPLETED is never reversed. Once the
  errand is back in its earlier state, a new dispute may be opened.
- While DISPUTED, pickup, delivery and confirmation return `409 ERRAND_DISPUTED`; a retry of an
  action already recorded before the dispute still returns `200`. DISPUTED is not terminal, so
  no Credit event is written and the reward stays reserved.
- Each change takes the same row lock and history path as participant actions. Repeating the
  same open, restore or accept for the same dispute returns `200` and changes nothing.
- History rows entering or leaving DISPUTED carry the `disputeId` and `actorType` `USER` or
  `ADMIN`. Participants see `decidedByAdministrator: true` and the dispute ID on a FAILED errand,
  but never which administrator: `actorId`, `failedBy` and `decidedBy` are `null` in participant
  views and present in admin views.
- An unconfigured `ADMIN_SERVICE_SECRET` returns `503 SERVICE_NOT_CONFIGURED`; a missing or
  wrong credential returns `401 UNAUTHENTICATED_SERVICE`.
- Errands that failed before disputed errands existed keep what was recorded. Participant
  failures keep `failedBy` and their reason; earlier administrator decisions may show
  `failureReason: "ADMIN_DECISION"`. The migration marks these rows `legacy_record`, which exempts
  only them from the new failure rules. New errands always follow the rules above.

## Fulfilment, completion and overdue

Pickup/delivery/completion accept no body (or `{}`) and no query fields, with fresh
User authentication and the same per-order locking/atomic history guarantees.
Only the designated participant can perform each action; another participant
receives 403 `FORBIDDEN`, unrelated users 404 `NOT_FOUND`. Skipped/reversed actions
without a recorded prior success return 409 `INVALID_TRANSITION` without mutation.
A successful actor/action retry returns the current projection, including after
later transitions, without changing timestamps, history or events. No admin bypass.

Participant projections add nullable `pickedUpAt`, `deliveredAt`, `completedAt`
and `overdueAt`. Only requester confirmation of DELIVERED creates COMPLETED and
`order.completed.v1`; delivery alone never requests transfer. Completion does not
call Credit synchronously. Order success is not a wallet-settlement acknowledgment.
No auto-completion timer is implemented: a non-responsive requester in DELIVERED
remains a policy question, not permission to invent a payment or failure transition.

The independent `order-expiry` worker now also checks overdue delivery, in separate
bounded SKIP LOCKED transactions using the existing interval/batch settings. An
ACCEPTED/PICKED_UP errand at/after deliveryDeadline gets `overdueAt=deliveryDeadline`.
This denotes when lateness began, not the worker's detection time. The marker does
not change state, add a state-transition history entry, emit a Credit event or block
late pickup/delivery. Valid late actions also set the marker in their transaction,
so a delayed worker cannot miss lateness if delivery wins the race. Rejected actions
and replays do not cause overdue writes. Preserve the marker after late delivery
and completion. On-time DELIVERED orders awaiting confirmation are not overdue.
OPEN/CANCELLED/EXPIRED/FAILED/COMPLETED/DISPUTED do not newly acquire markers in the worker.
A late dispute records/preserves the marker as history before changing to DISPUTED; an errand
returned to ACCEPTED/PICKED_UP after its deadline is marked by the worker's next pass.

## Terminal events: Credit-facing v1 contract

Order implements these producer messages; Credit owns the queue, consumer and
settlement transaction documented in [its contract](../credit-service/API.md).
Example:

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440010",
  "eventType": "order.cancelled.v1",
  "orderId": "550e8400-e29b-41d4-a716-446655440001",
  "reservationId": "550e8400-e29b-41d4-a716-446655440011",
  "occurredAt": "2026-10-11T04:00:00Z"
}
```

- Expiry and failure use the same shape with `eventType: "order.expired.v1"` or
  `"order.failed.v1"`. Failure carries no actor, reason, details or penalty. UUID eventId
  stays identical on every publication attempt. No profile, free text, tokens or
  balances are included. Credit resolves the owner/amount from its own reservation
  and validates its binding to orderId. Reservation creation-abort recovery still
  uses its separate HTTP fence; it is not a cancellation event for a nonexistent order.
- Completion uses `eventType: "order.completed.v1"` plus `requesterId`, `courierId`
  and positive integer `amount`. These immutable fields are copied from the locked
  Order into the outbox transaction, not supplied by the caller or fetched later.
  Credit must verify the reservation/order/requester/amount, provision the recipient
  wallet if appropriate under its own contract, and atomically transfer exactly the
  reserved reward to that courier, deduplicating eventId and reservation settlement.
  A missing wallet should be retried/reconciled, not acknowledged as a successful
  payment or silently redirected. Transfer after CLOSED/RELEASED is a conflict;
  duplicate transfer cannot pay twice or change recipient. Simulator checks are
  test evidence only; real wallet accounting/reconciliation belongs to Credit.
- Match User's durable topic exchange convention, default `foc.events`; routing
  key and AMQP type equal eventType, message ID equals eventId. Messages are
  persistent; publisher confirms and mandatory routing are enabled. No public
  queue is created by Order. Credit must provision durable bindings for all four types
  before production use. Mandatory routing proves at least one queue received it,
  not specifically Credit, and certainly not that credits were released.
- `outbox_events.PENDING` includes unsent/retryable events. No route, broker outage
  or lost confirmation retains intent. `PUBLISHED` means broker-confirmed only.
  A durable Credit queue retains messages while its consumer is offline.
- Delivery is **at least once**, not exactly once. Crash after publish but before
  database acknowledgment can duplicate the identical event. Credit must dedupe
  eventId and apply settlement at most once per reservation in its own transaction;
  do not acknowledge consumption before that transaction commits. Release after
  transfer must not alter balances. These consumer rules are not implemented here.
- One terminal event per order is enforced by an Order-local unique constraint.
  No cross-order ordering is required. Consumers must tolerate duplicates and
  delayed events without reversing a completed settlement.
- Worker claims one event for 30 seconds, publishes with a 5-second total timeout,
  and fences acknowledgments/retries by lease token. Retry delays are 1, 2, 4, 8,
  16, 32, then at most 60 seconds, indefinitely; no silent discard or fake success.
  Expiry has a separate process so broker waits cannot stall deadline processing.
- Logs carry eventId/orderId/type/attempt/outcome, never credentials or exception
  text. Inspect pending rows and oldest next_attempt_at alongside worker logs.
  Retention/cleanup and consumer settlement-status reporting are deferred.

Transport reference: [aio-pika publisher confirmations and mandatory returns](https://docs.aio-pika.com/apidoc.html#exchange).

## Create example

Use future timestamps, not the illustrative dates below. Keys accept 1–128 ASCII
letters/digits or `.`, `_`, `:`, `-`. Retain the same key and body across retries.

```http
POST /v1/orders
Authorization: Bearer {{accessToken}}
Idempotency-Key: {{creationKey}}
Content-Type: application/json
```

```json
{
  "supplierId": "550e8400-e29b-41d4-a716-446655440000",
  "itemDescription": "One vegetarian sandwich",
  "deliveryLocation": "COM3 level 1 collection point",
  "reward": 10,
  "acceptanceDeadline": "2026-10-10T12:30:00+08:00",
  "deliveryDeadline": "2026-10-10T13:00:00+08:00"
}
```

Descriptions are trimmed/nonblank, max 1000 characters; delivery location max 300.
Reward is an integer from 1 to 2,147,483,647; floats/booleans are rejected. These
limits are implementation choices, not extra backlog targets. Deadlines must be
ISO timestamps with offsets, normalized to UTC. Delivery is strictly later than
acceptance; acceptance must still be future at finalization. Protected/unknown
fields are rejected. Identity is never taken from the body.

Supplier normal detail `/api/v1/suppliers/{id}` must confirm ACTIVE. Name, building
area, pickup description, floor, optional coordinates and source updated time are
snapshotted. Later reads do not depend on Supplier. Validation is at a particular
instant, not an atomic cross-service lock against later deactivation. Permanent
Supplier deletion still needs a separately agreed race-safe reference protocol.

201/200 return the participant Order projection with generated `orderId`, OPEN,
requester ID, null courier, pickup snapshot and timestamps. Successful retry
returns the current Order projection without reserving twice or adding history.

202 includes `operationId`, `stage`, `statusUrl`, `retryCreation`, `errorCode` and
nullable `orderId`, plus Location and Retry-After headers. It means no successful
OPEN result is being claimed. Poll the status URL, then resend the **same POST
body and key** when `retryCreation=true`. The user's current session and Supplier
eligibility are rechecked. SUCCEEDED exposes the order ID; ABORTED is a final
failed attempt. A new attempt after ABORTED needs a new key. Operation records
are retained, so used keys remain bound to their original request.

## Storage and recovery

- `creation_operations`: durable validated payload, request/key hashes, generated
  IDs, stage, lease token/deadline, retry timing and safe result. No balances/tokens.
- `orders`: only confirmed-funded records; external UUIDs are not foreign keys
  into another service. `order_history` has an Order-local foreign key.
- Finalization atomically inserts the Order and initial history and marks the
  operation SUCCEEDED. A storage error does not trigger an immediate blind release:
  a later attempt first rereads durable state to resolve an uncertain commit.
- Unique requester/key and order IDs arbitrate duplicate creation. A short durable
  lease with an unguessable fencing token prevents stale processors from changing
  current records. External HTTP calls happen outside DB transactions.
- The independent worker queries reservation status. Before deadline, it makes an
  attempt READY_TO_FINALIZE for a fresh requester retry; it never saves user tokens.
- After deadline or a definite failure, persist ABORTING before external compensation.
  Finalization cannot cross that fence. Persist ABORTED only after Credit confirms
  its own durable CLOSED fence. SUCCEEDED operations are never compensated here.
- Default scan 5 seconds, batch 50, 30-second lease; transient failures use capped
  exponential backoff/jitter (up to 60 seconds), without discarding operations.
  Safe deferred logs carry operation/order IDs and error codes, not request contents.
  Unavailable Credit or an incompatible contract remains visible/pending, not success.

## Order-to-Credit interface

The runtime client uses a dedicated `CREDIT_SERVICE_SECRET` as
`X-FoC-Service-Secret`. Credit must provision/validate an Order-specific identity
with only the permitted operations. This is **not** Supplier's secret or a user
bearer token. Credential rotation and final contract compatibility require the
Credit owner's agreement. Configure the real Credit origin and matching secret
as described in the root README. If either setting is blank, new creation returns
503 without creating an operation/reserving anything; there is no mock fallback.

| Request | Required behavior |
| --- | --- |
| `PUT /v1/internal/order-reservations/{orderId}` | Body `{operationId, requesterId, amount}`; reserve atomically at most once per order. 201 first/200 replay; immutable identifiers and amount. 409 codes `INSUFFICIENT_CREDIT` or `WALLET_NOT_READY` are definitive negative responses. |
| `GET /v1/internal/order-reservations/{orderId}` | 200 authoritative status or 404 absent at that instant. A 404 does not rule out a delayed in-flight reserve. |
| `PUT /v1/internal/order-reservations/{orderId}/creation-abort` | Same body; 200/201 CLOSED only after releasing any reservation and durably fencing future reserve requests, even if no reservation exists yet. Idempotent; never reverse a transferred reward. |

Every successful response contains `operationId`, `orderId`, `requesterId`, integer
`amount`, `reservationId` and `state`. RESERVED/RELEASED/TRANSFERRED require a UUID
reservation ID; CLOSED may have null. Reserve must return RESERVED; abort must
return CLOSED. Order validates identifiers/amount, rejects unexpected fields and
fails safely on malformed or mismatched responses. RESERVED is not proof of
completion/transfer; those belong to later terminal-event integration.

Credit abort must serialize against reserve for the same order. Merely releasing
an existing reservation is insufficient: a delayed reserve could arrive afterward.
This creation-abort operation compensates an unpublished attempt; it is
not cancellation of an OPEN Order and does not fabricate a lifecycle event.

## Verification coverage

Unit/API tests cover validation, current identity, privacy/admin checks, replay,
timeout/deadline recovery and dependency contracts with explicit doubles. Real
PostgreSQL tests exercise competing requests, leases, transaction rollback,
lost commit acknowledgments, grants and queries in a disposable database.

Lifecycle coverage includes pickup, delivery, completion, overdue tracking and
disputed errands (hold, withdrawal, rejection and accepted failure), with security and
retry invariants. Credit owns
wallet conservation and ledger correctness. Verify terminal-event settlement
against Credit's wallet and ledger in an integrated environment. Automated doubles
under `tests/` exercise dependency behavior; they do not verify real settlement
or performance under load.
