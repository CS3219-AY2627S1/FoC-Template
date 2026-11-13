# Compensation-first recovery: Order / Credit handoff

## Current integration update - 2026-10-27

CHANGE-158/ADR-055 extends the historical fixture milestone below with Vincent's
explicit approval: actual Order request publisher and separately authenticated
result receiver, strict local emulator gate, real Credit/DB/broker tests.
Credit 8ecb1e8/5ff41c3 now implements consumer/inbox, absent-key tombstones,
revision/preimage clear restoration and durable result outbox. Credit full verify
passes126 tests/coverage; real compensation11/11 and retained protocol16/16 pass.
Final Order584/common12=596 tests/coverage pass with no failures/errors/skips.
Credit126 separately passes; source a6cceee. Order now rejects slash/dot/reserved
opaque IDs before registration; simple keys and UUIDs remain valid.
No schemas/endpoints below were replaced. New transport defaults off and recovery
defaults retry; deployed settings/IAM/subscriptions remain a separate rollout.
Historical future/missing statements below describe the original handoff, not
the current code. Do not remove old endpoints or migrate old command policy.

Owner/requester: Vincent. Date: 2026-10-26. CHANGE-156 / ADR-054 / FEEDBACK-017.

**Approved milestone:** Order implementation against contract fixtures; live
compensation is disabled until Credit implements and verifies this contract.
This document requests peer work; it does not claim that work already exists.
Existing live retry protocol stays available during migration. Do not deploy the
new policy as live or delete old endpoints merely because this handoff exists.

## 1. What changes, and why the proposal needs these refinements

General engineering principle: a timeout means unknown outcome. The original
request might still execute. Compensation must undo an applied effect OR durably
prevent an unapplied/delayed effect. This is a saga, not a distributed SQL rollback.

The requested direction works with these corrections:

1. Commit intent before network I/O. Commit the decision to compensate AND an
   outbox message in one local transaction. A direct publish in a catch block
   can be lost if the process crashes or the broker is unavailable.
2. The final Order database commit is the success boundary. HTTP response loss,
   serialization failure or a crash after that commit must NOT reverse success.
3. Credit SUCCESS is only a remote observation. If required local writes remain
   pending past the recovery deadline, request compensation.
4. A known business rejection that authoritatively means no effect can close
   without financial reversal. An arbitrary later 401/403/404 is not proof that
   an earlier uncertain operation had no effect.
5. Choosing SUCCESS and choosing compensation must serialize on the command
   row. After compensation is chosen, a late worker cannot finalize the Order.
6. Keep retries for compensation messages/results. Stop retrying the original
   financial operation to force success. Delivery failure is never permission to
   declare FULLY_COMPENSATED without Credit's matching committed result.
7. A lease deadline, recovery deadline and business Order expiry are different
   clocks. Never infer failure merely from the age of a step while a valid
   worker lease still owns it.

## 2. Current outbound operation inventory (actual source inspected)

| Caller / purpose | Actual peer API | Mutates peer state? | Required treatment |
| --- | --- | --- | --- |
| Create and manual repost | PUT /api/credits/orders/{orderId}/reservation, body {requesterId,amount} | Yes | RESERVE saga step; new repost candidate ID, never original ID |
| Accept | PUT /api/credits/orders/{orderId}/courier-assignment, body {courierId} | Yes | ASSIGN_COURIER saga step |
| Accepted-only abort | POST /api/credits/orders/{orderId}/hold-for-reopen, no body | Yes | CLEAR_COURIER saga step |
| Existing recovery | POST /api/credits/commands/{K}/compensate, no body | Yes | Superseded by durable compensation request/result for new policy only |
| Role/eligibility | GET /api/users/role-context and /courier-eligibility | No | Read/auth checks, no financial compensation |
| Supplier pair validation | POST /api/suppliers/validate, body {pickupSupplierId,deliverySupplierId} | No | Read-only despite POST; no compensation |

No other outbound HTTP state mutation was found in Order's current production
Java adapters. Local sample Maps are not peer HTTP requests. Completion/refund
and penalty publishers are existing asynchronous effects with their own outbox;
they are not additional unsafe synchronous calls.

Extra call site: `OrderRepostService.prepareRepost` still directly reserves for
legacy/automatic repost. Manual durable REPOST must use this same reservation
workflow. Automatic repost remains deferred because it lacks delegated forward
authorization; under the new policy the legacy path must fail closed before any
reserve, never bypass the journal or use the lifecycle token as a user JWT.

Evidence: Order `adapter/HttpPeerAdapters.java`, `HttpCreditCommandGateway.java`,
`application/CreditServicePort.java`, `OrderRepostService.java`; actual Supplier
controller/service validate method and User controller role/eligibility methods.

## 3. Current Credit support and exact gaps

Actual existing implementation:

- Three mutations accept Idempotency-Key and X-Command-Generation together.
- Historical GET /api/credits/commands/{K} is owner-authorized.
- HTTP compensate can reverse an unassigned held RESERVE, or the exact assignment
  produced by ASSIGN_COURIER. PENDING/REJECTED registered commands can be fenced.
- `CreditCommandStore.compensate` requires an existing command; missing K returns
  COMMAND_NOT_FOUND. `CLEAR_COURIER -> false` deliberately requires reconciliation.
- Existing push controller receives only open-refund and completion. There is no
  compensation request subscriber, result publisher or transactional result outbox.

Classification for new async interface: **MISSING**. Missing-key fencing and safe
CLEAR_COURIER reversal: **INCOMPLETE_OR_INCOMPATIBLE**. Existing mutations:
**MATCHES_APPROVED_CONTRACT** for initial keyed requests, not proof of the new saga.

Inspect Credit `api/CreditController.java`, `persistence/CreditCommandStore.java`,
`CreditReservationEntity.java`, migration V6, `CreditOrderEventController.java`,
`security/SecurityConfig.java`, `config/CreditPushProperties.java` and
`CreditCommandRecoveryIntegrationTest` (including the test that refuses reversal
of a previously cleared courier).

## 4. Order states and final commit

Do not add lifecycle states to the `orders` table for the recovery protocol.
Use the durable command journal:

| Layer | Values | Meaning |
| --- | --- | --- |
| Credit step | PENDING / SUCCESS / FAILED / COMPENSATED | Unknown; confirmed applied; authoritative no-effect rejection; confirmed reversal/fence |
| Final local stage | PENDING / SUCCESS / FULLY_COMPENSATED | Waiting; all local writes committed; aborted request closed safely |
| Public command | PENDING or COMPLETED, outcome SUCCESS or REJECTED | Existing frontend protocol retained |

FULLY_COMPENSATED also represents a confirmed no-effect closure: in that case the
Credit step stays FAILED and no fictitious reversal/compensation event is recorded.
After a real Credit compensation result, Credit step becomes COMPENSATED. Keeping
the command PENDING while compensating preserves the existing per-order guard.

V15 extends `order_commands` with recovery_policy, credit_step_status,
final_stage_status, resolution_deadline_at, compensation_id and
compensation_generation; it adds a result inbox. The existing event outbox gains
a command_id foreign key: compensation entries reference the durable command
with a null order_id, because failed CREATE/REPOST may have no Order row. Existing
lifecycle events still require their original Order foreign key; a database
check enforces the two distinct reference forms. Never insert a fake OPEN Order
just to satisfy the old outbox foreign key.
New step fields are authoritative only for COMPENSATE commands. Old RETRY
history is not backfilled with invented remote observations; the new sweep never
interprets those default fields as unfinished new-policy work.

Successful local transaction includes Order state, assignment/history/checkpoints,
linked repost updates where relevant, receipt, all required outgoing facts and
the command SUCCESS result. SQL flush alone is not a commit. No required database
write may remain after the terminal marker's transaction.

```mermaid
sequenceDiagram
    participant UI
    participant O as Order + PostgreSQL
    participant C as Credit + PostgreSQL
    participant P as Pub/Sub
    UI->>O: action, key K, user authorization
    O->>O: commit immutable intent and deadline
    O->>C: initial keyed mutation
    alt confirmed effect and local commit wins
        C-->>O: matching APPLIED result
        O->>O: atomically commit Order + final SUCCESS
        O-->>UI: terminal SUCCESS
    else unknown response, failed finalization or stale unfinished command
        O->>O: lock; revoke worker; commit compensation intent C + outbox
        O-->>UI: 202 PENDING / COMPENSATING
        O->>P: publish durable compensation request C
        P->>C: request C (duplicates/order changes possible)
        C->>C: atomically reverse/fence + inbox + result outbox R
        C->>P: publish committed result R
        P->>O: result R
        O->>O: deduplicate; validate; commit FULLY_COMPENSATED
        UI->>O: existing GET command status
        O-->>UI: COMPLETED / REJECTED
    end
```

## 5. Initial synchronous requests: keep business bodies minimal

All original calls keep forwarded user Firebase authorization and immutable K:

```http
Authorization: Bearer <current-user-token>
Idempotency-Key: K
X-Command-Generation: 1
```

RESERVE body: `{"requesterId":"requester-uid","amount":5}`.
ASSIGN_COURIER body: `{"courierId":"courier-uid"}`.
CLEAR_COURIER has no body. Order ID is in the path, not duplicated in the body.
No supplier details, item descriptions, JWTs or entire Order snapshots are added.

Success remains reservation 201/200 or assignment/clear 200, with matching
Idempotency-Key and `Command-Outcome: APPLIED`. A saved definitive rejection
must carry its durable command outcome and stable business code. Preserve existing
400/401/403/404/409/503 contracts; a generic error is not historical proof.
Bind K permanently to operation+actor+order+amount where applicable; reject reuse
with different details. Same-key terminal replay never redoes the financial effect.

## 6. New compensation request contract

Proposed topic template: `credit-command-compensation-{environment}-v1`.
Credit subscription -> reserved future internal handler:
`POST /api/credits/internal/command-compensations` (Pub/Sub wrapped push).

Pub/Sub attributes: `eventType=CreditCompensationRequested`, `eventVersion=1`.
Decoded message data:

```json
{
  "eventId": "11111111-1111-4111-8111-111111111111",
  "commandId": "6b2cb2e2-8b71-4b5a-9f1a-2b5b3c8e07a4",
  "operation": "RESERVE",
  "orderId": "22087f91-26d8-4704-be72-0f7ba5df702b",
  "actorId": "requester-uid",
  "generation": 2,
  "amount": 5
}
```

`eventId` is stable compensation ID C, distinct from K and broker messageId.
For ASSIGN_COURIER or CLEAR_COURIER omit amount entirely; actorId is the courier.
K/actor are opaque nonblank strings max128, Order ID max36 for this Order contract,
generation positive integer, amount positive integer only for RESERVE. All repeated
deliveries of C must have exactly the same binding and compensation generation.
Credit calculates/verifies its own canonical binding hash; do not send Order's
full request hash (it includes fields Credit neither needs nor owns).

These fields are necessary if compensation arrives before Credit ever records K.
A key-only message cannot establish an absent binding safely.

### Credit transaction algorithm

1. Verify broker identity, subscription, type/version, envelope and decoded fields.
2. Insert-or-find K with immutable binding under a unique constraint. If absent,
   create a durable COMPENSATED tombstone with FENCED_NO_EFFECT. Do not execute
   the original operation just to create a record.
3. Serialize this handler with registration/execution/compensation on K. PostgreSQL
   insert-on-conflict followed by locked reread must handle execute racing insert.
4. Compare binding and generation; stale/conflicting messages cannot overwrite
   newer state. A tombstone is absorbing even for later higher-generation execute.
5. If registered PENDING/REJECTED, fence without effect. If APPLIED, use the
   operation-specific conditional reversal below. Already COMPENSATED replays.
6. Atomically commit financial reversal or tombstone, deduplication of C, saved
   result and durable outgoing result event R in Credit's own database transaction.
7. Acknowledge push with 204 only after commit. If DB commit fails, do not ACK.
   Duplicate C must re-ensure notification of the saved R without repeating money
   changes. Merely noticing that C was seen is not enough if its result was lost.
8. A publisher drains Credit's result outbox after commit. A crash after reversal
   but before result publication must recover automatically from that outbox.

For a well-formed request that cannot be reversed safely, save a nonterminal
RECONCILIATION_REQUIRED result and notification, ACK receipt, and escalate; do
not repeatedly mutate money. Invalid auth/envelope never changes finances; poison
messages require retained diagnostics and DLQ/operator handling.

### Exactly what to reverse

| Operation | If original effect applied | Required safety condition |
| --- | --- | --- |
| RESERVE | Release held amount to the original requester | Still RESERVED, unassigned, owned by reserve command K and expected revision; never refund PAID/transferred/unrelated money |
| ASSIGN_COURIER | Clear the assignment produced by K | Match assignment command identity and revision; matching courier UID alone is insufficient |
| CLEAR_COURIER | Restore the exact assignment that K cleared | Credit saved its pre-image before clearing; reservation still held, unassigned, last mutation/revision is K; no later assignment, settlement or refund |

For CLEAR_COURIER Credit must persist prior courier UID, assignment command/attempt
identity and revision together with the clear; restoration uses a new monotonically
increased revision and saved identity. It grants no new task or credit reservation,
so do not require fresh new-task courier eligibility to undo the previous clear.
If the exact pre-image is unavailable (including old historical clears), return
RECONCILIATION_REQUIRED. Never fabricate the pre-image from current Order state.

All assignment/clear/settle/refund paths must advance/check a shared reservation
revision, including compatible legacy paths, so an old compensation cannot undo
a later assignment by the same courier (the ABA race). Lock accounts in consistent
UID order where multiple accounts are involved.

## 7. New committed-result contract

Proposed topic template: `credit-command-compensation-result-{environment}-v1`.
Order subscription -> reserved future authenticated receiver:
`POST /api/orders/internal/credit-compensations`.
There is no live receiver in the fixture milestone.

Attributes: `eventType=CreditCompensationResult`, `eventVersion=1`.
Decoded data (R is stable for one immutable result, derived from C, outcome and
provider resolution revision; a later operator-resolved outcome needs a new R):

```json
{
  "eventId": "22222222-2222-4222-8222-222222222222",
  "compensationId": "11111111-1111-4111-8111-111111111111",
  "commandId": "6b2cb2e2-8b71-4b5a-9f1a-2b5b3c8e07a4",
  "operation": "RESERVE",
  "orderId": "22087f91-26d8-4704-be72-0f7ba5df702b",
  "generation": 2,
  "outcome": "COMPENSATED",
  "code": "REVERSED"
}
```

Successful compensation codes: REVERSED or FENCED_NO_EFFECT. Nonterminal:
outcome RECONCILIATION_REQUIRED with a stable reason code (e.g. REVISION_CHANGED,
ALREADY_SETTLED, PREIMAGE_UNAVAILABLE, COMMAND_BINDING_MISMATCH).
No balances, supplier fields, descriptions, user token or full Order data needed.

Order locks its command, validates C/K/order/operation/exact generation and
outcome/code, then atomically inserts its result inbox record and finalizes
COMPENSATED/FULLY_COMPENSATED/COMPLETED+REJECTED. Duplicate event IDs with changed
content conflict. A result for a committed SUCCESS is an invariant violation,
not permission to overwrite the Order. A reconciliation result remains PENDING
with a visible message, retained guard and alert/operator investigation.

## 8. Scheduling and concurrency

Persist resolutionDeadlineAt when intent is registered. It is configurable and
independent of expiresAt. Suggested fixture default120s; existing worker lease120s
and minute sweep remain separate controls. An active lease is not stolen just
because resolutionDeadlineAt passes.

The sweep locks each selected command independently. If final SUCCESS or
FULLY_COMPENSATED, skip. If incomplete and due with expired/no lease, revoke the
old owner/generation and choose compensation. If possible_effect is false after
that fence, close no-effect locally; otherwise enqueue C. A late worker must
check ownership in the same transaction as local finalization. Holding a lock
only during preflight validation is insufficient.

While waiting for Credit, retries republish the SAME C, never recreate an accept/
reserve/clear. If an outbox message was already published but its result remains
missing, redelivery must be able to reproduce the same saved R. Retained FAILED
outboxes after bounded attempts require operator redrive and alerts, not false
terminal compensation. No new IDs on redrive; no blind callback loops.

After confirmed success: create/repost -> OPEN; accept -> ACCEPTED; abort ->
OPEN/EXPIRED with existing history/penalty/refund intents. After compensation:
create/repost produces no candidate Order; original expired repost remains;
accept remains OPEN; abort remains ACCEPTED with original assigned courier.
Expiry waits for an unresolved acceptance; after it is compensated, a later
lifecycle pass may expire the OPEN Order and emit its ordinary refund event.

## 9. Authentication and delivery operations

Forward requests retain user JWT checks. Background compensation uses a trusted
broker channel and the original saved binding, not an expired user token or a
public lifecycle token. Restrict topic publishers to the relevant service identity;
only a dedicated verified Pub/Sub OIDC push identity/audience can invoke each
receiver. Separate this authentication from Firebase user-role conversion. The
subscription name inside the JSON body alone is not proof of origin.

A forwarded user JWT proves the end-user identity, not that a request passed
through Order's journal. Before live activation, agree how direct/unkeyed clients
are prevented from bypassing fencing on protected reservations (verified service
origin/private ingress or an agreed command permit, not a trusted UID header).
Credit must independently reject requester=courier self-assignment. The current
fixture milestone neither fixes nor claims to verify these provider security
boundaries. No new forward service credential is assumed by this document.

Local unauthenticated emulator push may exist only with explicit local environment
AND Auth/PubSub emulator settings, loopback exposure and a separate reviewed gate.
Never allow emulator push in staging/production. No tokens in event bodies/logs.

Provision topics, subscriptions, retry/backoff, DLQs and service IAM before enabling
publishers. Subscribe before publishing. Use environment-specific injected topic
names, not dev fallback names in staging/prod. Keep service CPU/min-instance
requirements for in-process recovery; measure oldest pending age, result latency,
failed outboxes, DLQs and reconciliation counts. Retain tombstones/results long
enough to fence all delayed/replayed requests; never silently reuse old keys.

Pub/Sub push may redeliver and does not provide exactly-once delivery. The
application transactions above provide one financial compensation per command.
Sources: [delivery behavior](https://docs.cloud.google.com/pubsub/docs/subscription-overview),
[exactly-once limitations](https://docs.cloud.google.com/pubsub/docs/exactly-once-delivery),
[authenticated push](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions),
[retry policy](https://docs.cloud.google.com/pubsub/docs/subscription-retry-policy),
[dead-letter topics](https://docs.cloud.google.com/pubsub/docs/dead-letter-topics).

## 10. Add / change / retire checklist for Credit's owner

Add: missing-key tombstones; exact pre-images and shared mutation revisions;
request consumer/inbox; conditional CLEAR_COURIER restoration; result outbox/
publisher; schemas, environment settings, IAM, retry/DLQ/runbooks and tests.

Change: share locked command/revision rules across original mutation, replay,
HTTP compensation and new consumer. Atomically persist original effect/result;
reject key/input mismatch; never execute a fenced key; duplicate C re-notifies R.

Retain initially: existing three HTTP mutation routes, generation/key validation,
historical lookup, HTTP compensation, balances/ledger and current completion/refund
handlers. Old commands/clients still depend on them. Never delete applied migrations.

Retire only after coordinated drain: Order's replay-to-force-success and its
HTTP missing-binding-create-then-compensate for new-policy commands; any unkeyed
mutation bypass that can evade the new fencing contract. Older protocol must be
drained/reconciled or explicitly routed by persisted policy, not guessed from age.
This is not approval to remove endpoints or existing subscribers immediately.

No User/Supplier mutation handoff is needed: inspected calls are reads. Keep their
current validation/authorization APIs. Report-originated Order holds are inbound
peer orchestration, not an Order outbound unsafe call to convert here.

## 11. Required verification before live activation

- Original applies, response lost -> one reverse, balances restored once.
- C arrives before original -> durable no-effect tombstone; every late execute,
  including higher-generation execute, cannot apply.
- Original and C race on first insert; duplicates/out-of-order requests/results.
- RESERVE compensation cannot release assigned/settled/unrelated funds.
- ASSIGN_COURIER compensation cannot clear a newer same-courier assignment.
- CLEAR_COURIER restoration exact pre-image succeeds once; newer mutation or
  missing pre-image returns reconciliation rather than blind reassignment.
- Credit crash before commit -> no partial reversal; crash after commit before
  publish -> durable result outbox recovery; duplicate C reproduces lost R.
- Order local rollback/unknown commit -> read terminal row before compensation;
  success-marker/Order/checkpoint/receipt/outbox remain atomic.
- Lease expiry + late success worker vs scheduler; no success after compensation
  decision and no compensation after local committed success.
- Cancel/expiry/start/admin/hold interactions preserve existing unresolved guard.
- Manual repost original/candidate identity stays correct and one successor only.
- Auth failures, tampered binding, wrong actor/order/operation/generation/result,
  emulator isolation and wrong publisher/subscription never change financial state.
- Compensation publication/result publication/result commit failures remain
  recoverable; FAILED/DLQ/unknown outcomes never become FULLY_COMPENSATED.
- Browser key survives reload/cleared storage via existing owned discovery;
  pending stays disabled, terminal rejection unlocks a fresh deliberate attempt.

Run actual Order and Credit processes against separate PostgreSQL databases and
the local Pub/Sub emulator; test cloud OIDC/IAM separately. Contract fixtures
cannot close FEEDBACK-017 or prove live crash recovery.
