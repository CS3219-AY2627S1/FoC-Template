# CHANGE-137 — Admin order completion / report resolution

Owner: Yao Xiang, order-service/penalty-integration, 2026-10-17.
User requests a completion counterpart to admin cancellation, including held
Orders, funding completion and selectable penalties. User explicitly approved both
choices on2026-10-17: assigned ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED including
held Orders; only admin-selected highest addition, null/empty means no score
change. Existing merge and CHANGE-134–136 retained. ADR-046 records this amendment.

## Approved detailed contract

- POST /api/orders/admin/{orderId}/complete in existing AdminOrderController.
- Existing RequireAdminRole/Firebase role mechanism, local-only identity fallback;
  no supplied administrator ID. Requester/courier IDs are assertions against the
  locked Order, never authority or a freely chosen payment recipient.
- Dedicated AdminCompleteOrderRequest: requesterId and courierId nonblank <=128,
  optional appliedPenalties list <=32 of nonnull shared PenaltySystemPolicy names.
- Starting states: assigned ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED,
  including held Orders. Reject OPEN,
  terminal, no courier, participant mismatch and unresolved durable commands.
- Scoring: reuse admin-cancel highest addition only, stable enum tie
  order, null/empty means waiver, reward reason rejected. No additional automatic
  overdue addition or successful-delivery deduction.
- Preserve actual delivery timestamps and report hold history; do not invent an
  actual delivery when an administrator overrides a state. Existing nullable
  overdue semantics remain; if no actual delivery is confirmed, completed overdue
  remains unknown. Order resolution metadata records explicit decisions.
- Return OrderResponse200 after local atomic commit (not confirmation of Credit
  settlement). Validation400, unauthenticated401, nonadmin403, missing404,
  terminal/participants/changed replay/unresolved/NOWAIT contention409,
  role-provider503. Existing admin-cancel error message must stay unchanged.

## Components, consistency and ownership

AdminOrderController -> AdminOrderCompletionService -> locked Order.completeByAdmin.
Keep business validation in the domain; API DTO and mapping remain at the boundary.
Use existing getForLifecycleUpdate NOWAIT + unresolved-command guard. One transaction
commits COMPLETED, checkpoint, bound ADMIN_COMPLETE receipt, existing seven-field
OrderCompletionTaskEvent and selected penalty intent if any. Server command ID
ADMIN_COMPLETE:<orderId>; immutable canonical participant/admin/policy binding.
Exact replay returns current Order without another event; changed input rejects.
Terminal state and shared row lock serialize completion/cancellation/worker races.
Only after durable writes, signal existing AFTER_COMMIT outbox dispatcher; retain
stable-ID retry. No synchronous Credit settlement or new topic/payload/migration.
Reuse existing admin decision/time/reason/amount columns (V10), no new persistence.
Ordinary requester and scheduler holds must remain effective.

## Peer evidence

Credit current decoder/message DTO consumes exactly seven compact fields and
eventVersion2/body-matching attributes. CreditOrderCompletionEventHandler maps to
ORDER_COMPLETION; CreditService validates resulting COMPLETED + assigned courier +
positive amount. JpaCreditRepository.settle deduplicates event ID and locks the
reservation, checks matching amount/courier, requires RESERVED (PAID replay safe),
then transfers and writes ledgers atomically. Existing contract is
MATCHES_APPROVED_CONTRACT; no provider change required for another completion
trigger. Push authentication/subscription paths remain unchanged. User penalty
consumer is still FEEDBACK-014 and not implemented by this Order increment.

Read actual CreditOrderEventController, JsonOrderEventPayloadDecoder,
OrderEventMessage, CreditOrderCompletionEventHandler, CreditService and
JpaCreditRepository plus decoder/handler tests. Earlier guessed aggregate-consumer
file names were absent; discovery located the actual split handlers. No peer edit.

## Traceability and verification plan

Sprint2–3 continuation: D1 NTH1 admin oversight, NTH2 penalties, NTH3 resolution;
approved admin cancellation ADR-044 and timing/decision ADR-045 extended by explicit
admin completion/held-funding authority. Existing completion sequence/outbox reused.
Domain, service, API route and actual PostgreSQL tests first: starting states,
terminal rejection, participants, held override versus ordinary guards, max/tie/
waiver/invalid reward/null list entries, identity401/403, replay/changed-input,
rollback including second-intent failure, actual NOWAIT contention and competing
cancel/complete outcome. OpenAPI endpoint and response contract; generated JAR.
Peer decoder/handler/service tests verify current compatibility independently.
Frontend baseline inspected; no new UI control, layout or browser claim. No sibling
backend/config/cloud/deployment change. Existing source fingerprints unchanged,
no unresolved merge entries. Workflow/skill/profile/allocation/active context loaded.

## Verification before the pending choices

Current Credit decoder/handler/service unit tests run read-only:8 passed, zero
failures/errors/skips (change137-peer-tests.log). This verifies current compact
decoding/handler mapping and service regressions, not a new deployed settlement.
No application source, endpoint or tests for admin completion have been created
at that prior stopping point. Those two choices are now approved as recorded at
the top; continue with TDD. No architecture/interaction approval remains pending.

## Completed Order increment — 2026-10-17

- RED domain test compilation failed on absent completeByAdmin, before source
  implementation. Focused53 tests then passed, including existing cancellation
  regressions and five actual PostgreSQL cases for the new flow.
- Fresh root Maven verify: common12 + Order486 =498 tests, zero failures/errors/
  skips; both unchanged coverage gates and executable JAR build pass. Source
  changes complete; no additional approval is pending for this Order increment.
- MVC verifies anonymous401/non-admin403, verified admin principal, malformed/
  missing courier400, business409 and completion-specific lock409. Existing
  cancellation lock message is preserved. Separate local-profile check verifies
  unauthenticated local-admin completion. OpenAPI lists admin-order-controller
  and documents200/400/401/403/404/409/503; requesterId/courierId required.
- Domain covers all four held/assigned active states, OPEN and terminal rejection,
  participant/assignment/reward validation, waiver/selected decision and preserved
  delivery facts. Ordinary requester/automatic hold guards remain unchanged.
- Service verifies funding-only null/empty even when overdue; one highest/tie
  addition and no automatic score/reward; canonical exact replay, different admin/
  input rejection, repository guard and no early dispatch signal on failure.
- PostgreSQL tests5/5 verify real retained report rows, saved decision/version/
  checkpoint/receipt/outbox, rollback on second-intent failure, NOWAIT conflict/
  retry and concurrent admin cancel-versus-complete with only one financial intent.
- Existing V10 metadata is reused; no migration/local DB/application-container
  mutation required. Generic AdminOrderExceptionHandler replaces the old advice
  name; packaged JAR contains new completion service and no obsolete advice class.
- AsyncAPI documentation1.2.1 changes trigger descriptions only. YAML/Ajv checks
  accept the six existing addition mappings and reject bad amount/reward/extra
  fields;408 qualified TOML keys unique (not a full TOML parser check). Task
  whitespace/no-unresolved-merge checks pass. No frontend source or browser check.

Preserved prior uncommitted merge/134–136 work; no sibling source, root config,
topic/IAM, commit/push or deployment. Rebuild matching Order image to run the new
endpoint. HTTP200 means local committed funding intent, not synchronous Credit
settlement; actual deployed financial confirmation and User scoring remain pending.
Report integration and penalty consumer/global reconciliation remain peer work.
