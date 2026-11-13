# CHANGE-128: Explicit courier penalty events

- Date/owner: 2026-10-14, Yao Xiang, order-service/penalty-integration.
- Status: user approves Order-side implementation on2026-10-14; accepted
  cancellation +2, overdue +1, successful delivery -1. New addition replaces
  accepted-cancellation publication; Credit events and legacy replay retained.
  Existing CHANGE-127 work preserved; real penalty subscriber remains absent.
- Request: enum maps penalty reason to amount; accepted cancellation and overdue
  completion emit addition; on-time completion emits deduction, including system
  auto-completion. Two new Google Pub/Sub topics, minimal explicit payload.
- Workflow reloaded: parent/Order instructions, current Yao Xiang profile and
  branch, current scope/decisions/sprint, frontend baseline and source fingerprints.
  D1/Overall/UpdatedOverall fingerprints match previous verified context.

## Actual peer/source inspection

User Service UserService implements aborted +2, overdue +1, on-time -2, with
0/10 clamping. Its HTTP outcome handlers are not Pub/Sub subscribers. No separate
Penalty Service or penalty subscriber exists in this checkout. Actual consumer
integration is MISSING, to be recorded as FEEDBACK-014; no peer changes authorized.

Order cancelAcceptedInternal currently emits AcceptedOrderCancellationTaskEvent
for every abort, plus OpenOrderRefundTaskEvent for EXPIRED. Completion emits the
compact Credit completion event. Existing overdue calculation compares actual
delivery time with acceptance plus delivery limit, not requester completion time.

## Approved implemented contract

- Enum CourierPenaltyCase: ACCEPTED_TASK_CANCELLATION(2), OVERDUE_DELIVERY(1),
  SUCCESSFUL_DELIVERY(1). Amounts are positive; event type selects add/deduct.
  User explicitly changes successful deduction from inspected2 to1. Numeric
  decisions belong to Order's enum; consumer applies the transmitted amount.
- PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent; separate typed
  publisher/interface pairs in messagingpublisher/publisher and interfaces.
- Topics courier-penalty-addition-dev-v1 / courier-penalty-deduction-dev-v1;
  corresponding -prod-v1 names, configurable Order YAML properties/environment.
  Shared topic-only configuration is separately approved; no live cloud changes.
- Exact seven JSON fields: eventId, eventType, orderId, courierId, penaltyAmount,
  occurredAt, appliedReason. courierId appears once. No separate actorId:
  cancellation targets the cancelling courier captured before reopening clears
  the Order courier; completion targets the assigned courier, never requester
  or lifecycle actor. Internal event/order version metadata remains in existing
  outbox/attributes rather than adding payload fields.

```json
{
  "eventId": "stable-outbox-event-id",
  "eventType": "PenaltyScoreAdditionEvent",
  "orderId": "order-id",
  "courierId": "assigned-courier-user-id",
  "penaltyAmount": 2,
  "occurredAt": "2026-10-14T08:00:00Z",
  "appliedReason": "ACCEPTED_TASK_CANCELLATION"
}
```

Every successful accepted cancellation adds2. Both manual and automatic
  completion add1 only if delivery was overdue, otherwise deduct1. Delivery exactly
at its limit is on time under existing isAfter semantics. Failed/held/rejected
operations and receipt replays create no new penalty event.

## Atomicity, replay and legacy routing

Enqueue the penalty in the same Order transaction as status/checkpoint/receipt
and existing required Credit event. After-commit listener publishes through the
existing bounded outbox dispatcher. Rollback removes the penalty intent; failed
publication retains the same stored payload/ID for retry/redrive. Stable ID is
derived from event type, stable command ID, Order ID, target courier identity and reason;
retries do not recalculate amount from a future enum version.

User approves replacing new AcceptedOrderCancellationTaskEvent publication with the
addition event, while retaining legacy dispatcher/DTO/publisher support for stored
outbox rows. Keep Credit completion/refund events unchanged. User should consume
the new penalty topics rather than also applying penalties from legacy outcome
topics, avoiding duplicate scoring under distinct IDs. Routing approved in chat.

## Consumer contract and limits

User Service is the requested score subscriber; its penalty handling is downstream
work. No separate Penalty Service exists or is implemented here.
Consumer must atomically deduplicate eventId with its score mutation, validate
type/reason/amount and authenticate delivery. Pub/Sub messageId is not eventId.

Addition/deduction across two topics do not have a cross-topic ordering guarantee.
With clamping, order can affect the result (score0: +1 then -1 yields0, whereas
-1 then +1 yields1). User owner must define arrival-order policy or deterministic
ledger/recomputation; separate topics alone do not solve ordering. No consumer
ordering/exactly-once or eventual-score guarantee is claimed here.

## Verification plan and results

TDD: enum and exact seven-field JSON, deterministic IDs/recipient/amount,
unexpired/expired cancellation, overdue/boundary/on-time manual and automatic
completion; replay/hold/rejection no-event; per-event dispatcher routing,
publication failure with stable retry payload, real PostgreSQL atomic rollback.
Update AsyncAPI, peer handoff, effective class/sequence design, contracts,
traceability/context/AI disclosure. Run applicable full backend verify. No new
frontend behavior proposed; no peer/cloud changes or live consumer claim.

## Completed verification

- Contract RED proved missing enum; two behavior RED failures proved manual
  boundary/system overdue completion lacked penalty events. Focused37 pass.
- Routing/retry/publishers plus real PG10 tests pass; injected penalty save failure
  rolls back completion checkpoint/receipt/Credit intent.
- First full403 run found three old single-event assertions; updated to require
  two events/signals and exactly one committed Order outcome. Second full run
  passed tests but failed branch coverage. Single typed internal mapper input
  replaces several nullable inputs; no threshold/exclusion changes.
- Final ./mvnw verify:403 tests, zero failures/errors/skips, original80% gates pass.
  Line2099/2208 (95.06%); branch884/1104 (80.07%).
- Python bootstrap3 tests pass: all five local topics, only two existing Credit
  subscriptions, repeated409 idempotency, non-private host rejected before network.
- Base/HTTP-peer Compose config --quiet pass; modified shell scripts pass Bash
  syntax checks. AsyncAPI YAML parses; internal references resolve; four current
  operations plus retained legacy replay.
- Source diff checked; no new frontend changes/rebuild, DB migration, actual cloud
  publication/provisioning, live consumer verification, app deployment or push.
- Evidence: ignored target/change128-{red,behavior-red,focused,atomic,verify,
  verify-final,verified}.log. Existing completion-hold work preserved.

## Approved environment wiring and remaining integration

User separately approves topic-only shared configuration: .env.example,
Compose local topic pins, staging/production settings, Order deploy env,
private-emulator bootstrap, existing Order topic provisioning and infra checks.
Staging penalties use dev-v1; production prod-v1; local Docker local-v1.
No sibling backend source or consumer changed.

Before cloud CI/deploy, infrastructure owner runs
infra/gcp/configure-order-pubsub.sh staging and production. This provisions both
new topics and Order publisher IAM; absent topics/IAM correctly fail check-infra.
No cloud command ran here. User owner must implement subscriptions with atomic
eventId dedup/score update, transmitted amounts (successful deduction1), clamp
ordering and coordinated legacy cutover. End-to-end scoring remains unverified.

