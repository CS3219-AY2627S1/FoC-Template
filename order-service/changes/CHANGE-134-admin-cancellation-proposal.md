# CHANGE-134 — Admin cancellation and nullable response-field review

Date: 2026-10-16. Owner: Yao Xiang, `order-service/penalty-integration`.
Status: detailed behavior confirmed by Yao Xiang2026-10-16; implemented,
verification in progress. User approves every active state including held Orders,
all addition cases excluding successful delivery, new COURIER_UNRESPONSIVE=3 and
nullable isOverdue in OrderResponse. No sibling backend/UI control work requested.

## Effective confirmed details

OPEN/ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED may become CANCELLED, including
held Orders; terminal states reject. Original hold flag and immutable placement
history are retained. Null/empty list -> refund only; any addition case is
accepted, maximum amount wins, enum declaration order breaks ties. Null elements
and successful reward reject; penalties require an assigned courier.

COURIER_UNRESPONSIVE(3) is explicitly approved beyond D1's original six. The
existing report-policy subset includes it; full policy now7. Only a single
selected case is sent on the existing addition topic, with seven existing fields.

isOverdue is a Boolean JSON field in normal OrderResponse, no database column:
latest ACCEPTED time + delivery limit, compared strictly against actual delivered
time; before delivery use current time, after undelivered cancellation freeze at
cancel checkpoint. No assignment/historical courier attempt/missing timing=null.
Exact deadline=false; late requester/system confirmation does not make a timely
delivery overdue. Report calls existing authorized GET Order; null is unknown.
Read authorization is unchanged. New flag is not added to broker payloads.

OrderOverdueQuery reads one grouped database timing projection per bounded page,
not full checkpoint histories or one query per row. OrderMapper remains a Spring
MapStruct mapper, now an abstract mapper with pure generated base mapping and
batch enrichment. Spring requires the query bean; standalone mapper unit tests
can leave it unset and obtain null for this optional observation. API MVC test
fixtures mock that dependency. Domain/publisher completion calculation unchanged.

New request DTO and controller are separate files; existing admin list remains.
Server-derived ADMIN_CANCEL:orderId receipt key and normalized enum-set binding
make exact retries no-ops; changed administrator/participants/penalties conflict.
No extra body idempotency/version field, no migration/config/topic change.

The remaining proposal sections preserve the original review. Confirmed details
above and ADR-044 supersede their pending-decision wording.

## Requested behavior

Admin cancellation accepts Order ID, requester ID, courier ID and an optional
list of `PenaltySystemPolicy` cases. It produces a refund event and, when a
penalty applies, one addition event for the highest amount rather than summing.
No sibling service implementation or new topic is requested.

## Concrete proposed contract

`POST /api/orders/admin/{orderId}/cancel`, protected by existing
`@RequireAdminRole`. Traditional `AdminCancelOrderRequest` JSON:

```json
{
  "requesterId": "stored-requester-uid",
  "courierId": "stored-courier-uid",
  "appliedPenalties": ["WRONG_LOCATION_DELIVERY", "DELIBERATE_ITEM_RETENTION_OR_THEFT"]
}
```

Order ID is a path variable. The participant IDs are assertions checked against
the locked Order; they do not authorize the administrator or choose an arbitrary
penalty recipient. An unassigned Order has null courierId. A penalty cannot be
applied without an assigned courier. Null/empty penalty list produces refund
only; null list elements, unknown enum values and the reward-only successful
delivery case cannot silently become an addition. Highest magnitude wins;
equal amounts can use enum declaration order as a deterministic tie-breaker.
The permitted subset and active/held states are confirmed above.

Proposed response is existing `OrderResponse`, resulting `CANCELLED` status.
Do not add an unspecified nullable field. Typical errors:400 invalid request,
401/403 authentication/admin role,404 missing Order,409 invalid state, participant
mismatch, unresolved command, conflicting replay or row contention;503 role
provider unavailable. No unapproved new frontend controls.

## Components, transactions and concurrency

Controller -> dedicated admin cancellation application service -> aggregate
behavior/domain repositories -> PostgreSQL. Existing API mapper, explicit Java
types, Lombok DTO boilerplate and repository isolation conventions apply.

Acquire existing no-wait Order write lock and unresolved-command guard before
checking stored participants/state/hold. Use one local transaction for terminal
state, CANCELLED checkpoint, bound command receipt and required outbox rows.
Preserve the stored courier on the terminal Order/event so Credit can validate
its assignment. Select one penalty with the shared pure policy, without changing
the common module. Reuse factory/refund/addition publishers and stored event IDs.

Proposed replay identity: server-derived per-Order ADMIN_CANCEL operation key,
bound to authenticated admin and canonical participant/penalty input, using the
existing receipt table. Lock first, then check receipt. Exact replay returns
committed result without another outbox row; changed request cannot apply another
penalty to a terminal cancellation. This avoids inventing a required extra body
field beyond the user's requested data. No schema migration is expected.

Only outbox intents are written inside this transaction. Existing after-commit
signal triggers broker dispatch; publication failures retry from saved intent,
without undoing a committed cancellation. Refund/penalty subscribers are separate
and can finish at different times. Success response is local commit, not proof
that a refund/score change already occurred.

Existing report holds currently block every funding outcome (ADR-040); no release
endpoint exists. An admin override would be a new, explicit resolution exception,
not a generic release or deletion of immutable report-placement history. The
user must decide whether this endpoint is allowed to make that exception.

## Provider evidence and remaining integration boundary

Credit source inspected: `CreditService.validateOutcome` accepts CANCELLED or
EXPIRED for OPEN_ORDER_REFUND; `JpaCreditRepository.refund` checks event courier
against its reservation, validates amount/reservation and deduplicates before
refund. Its compact event/mapper support non-null courier IDs. Reusing the
existing refund contract for CANCELLED with the stored courier therefore fits
the inspected implementation; admin-cancellation runtime cases still need tests.

The User penalty subscriber remains absent in this checkout (existing
FEEDBACK-014). Report-related enum cases4/4/10 exist in common but are not yet
produced by current automatic transitions. Order-side publication alone is not
verified scoring or theft suspension. No existing service is modified here.

## Planned verification after business decisions

- Admin/non-admin/unauthenticated route behavior and generated OpenAPI.
- Null/empty penalties -> one refund; multiple -> one highest addition plus refund.
- Unknown/null/reward/disallowed cases; no courier; participant mismatches.
- Allowed active states; terminal rejection; chosen hold policy.
- Atomic rollback of Order/checkpoint/receipt/both intents on write failure.
- Same request replay and changed-input rejection; concurrent admin/lifecycle
  operations serialized by the real PostgreSQL lock and command guard.
- Refund event retains correct assigned courier and positive stored amount;
  penalty targets courier, not administrator/requester.
- Existing Order/common verification and unchanged consumer schemas/topics.

## Nullable OrderResponse compatibility

Current frontend uses TypeScript structural types and JSON transport without
an exact-field validator. Adding an optional nullable JSON property ordinarily
preserves existing reads. However, Admin Order details enumerate returned keys
and show unknown fields under Other information (null -> Not provided), so it
may visibly add a row. Strict external clients/exact-shape assertions can reject
new properties; nullability alone is not a universal compatibility guarantee.
An added DTO field also changes Lombok's all-args Java constructor, though no
manual `new OrderResponse(...)` call sites were found in current service source.
Use explicit MapStruct mapping and optional nullable frontend typing as needed.
Do not rename/remove/change existing fields or event payloads incidentally.

## Completed verification — 2026-10-16

- Root `mvnw.cmd -B -ntp -pl order-service -am verify`: common12 + Order455 =467
  tests, zero failures/errors/skips; existing coverage gates pass; executable JAR built.
- New PostgreSQL cases4/4 verify complete commit/replay, rollback on second outbox
  failure, actual grouped timing projection and NOWAIT contention/retry.
- Route tests5/5 verify anonymous401, courier403, decoded Firebase token/User-role
  admin identity, JSON enum/null validation, domain409 and lock-contention409. OpenAPI includes route
  responses and isOverdue; JSON emits isOverdue, not a duplicate overdue property.
- Frontend211 tests/39 files pass; typecheck passes; lint0 errors/3 existing unused
  variables in login-form.tsx. Only optional nullable Order typing changed here.
- AsyncAPI YAML parses and Ajv accepts all6 addition mappings while rejecting
  wrong amounts/reward/extra fields. Python validator unavailable; Node/Ajv was
  used instead, not a claim that the Python script ran.404 qualified TOML keys
  unique (not full TOML parsing). Task whitespace/no-conflict checks pass.
- Initial RED common12 tests detected the missing case (3 errors); focused first
  run hit5 String-versus-enum test assertions, corrected to actual typed status.
  One PowerShell Maven argument was unquoted and corrected before tests ran.
  Docker was initially stopped; started Desktop hidden for isolated test containers.
- First full run454 tests had2 new integration failures: expected raw exception
  was Spring-translated, and ordinary API lock waited. Test now checks the actual
  translated runtime error and rollback; admin uses the existing lifecycle NOWAIT
  lock/guard. Other APIs' blocking locks remain unchanged. Final full run passes.
- Final review added endpoint-scoped AdminOrderCancellationExceptionHandler:
  translated lock contention returns409 with retry guidance. Other endpoints'
  error behavior is unchanged. Actual PostgreSQL exception type and route
  translation are tested; final complete467-test verification and gates pass.

No Credit/User/Supplier source, topic/config, application image recreation,
production database mutation, deployment, stage/commit/push. Existing staged merge
work preserved. Actual subscriber scoring, per-Order historical highest penalty,
suspension, Report integration and authenticated deployed/browser checks remain
pending. Local intent commit is not proof of peer financial/score completion.
