# Archived feedback through CHANGE-159

Historical evidence, including superseded requests. For current pending work see [peer-service-api-feedback.md](peer-service-api-feedback.md). Archived routes and readiness statements are not current contracts.

# Peer Service API Feedback

## Effective retirement of accepted-cancellation publishing - CHANGE-155 / ADR-053 (2026-10-19)

User approved removing AcceptedOrderCancellationTaskEvent publishing AND legacy replay after inspecting staging: eight legacy rows were PUBLISHED, with no pending/failed rows shown. Preserve published history; this task does not modify any database or GCP resource. Production was not inspected: before rollout, verify no PENDING, IN_PROGRESS or FAILED legacy rows in each target database. Resolve any such rows explicitly before deployment; do not convert them into new score events or mark them PUBLISHED without broker confirmation.

Removed the legacy DTO, publisher/interface, factory/mapper methods, now-unused snapshot DTOs and dispatcher branch. The four current channels remain OpenOrderRefundTaskEvent, OrderCompletionTaskEvent, PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent. Courier abort still uses synchronous Credit hold/reopen and the existing final addition (plus refund when expired); no lifecycle, hold, penalty policy, idempotency or financial rules change. Historical database rows and immutable migrations remain intact. Other older refund/expiration normalization remains supported.

The retired topic setting is removed from Order config, deployment templates, local Compose/bootstrap, environment examples/staging/production settings, topic provisioning and CI topic checks. These scripts no longer require or create the old topic; they do not delete existing cloud topics or subscriptions. User Service consumes only the new scoring channels. Existing admin-provider authorization requests remain open. AsyncAPI1.3.0 describes four outgoing operations; earlier statements requiring accepted-cancellation replay/configuration are superseded by this amendment.

An unexpected non-published legacy row after deployment is unsupported and follows the existing bounded failure/recovery path, never automatic financial conversion. This is why the pre-deployment backlog check is required. Live User penalty processing, production backlog and cloud deletion are not verified here.


## Current User Service action required - CHANGE-154 (2026-10-19)

This section supersedes older accepted-cancellation scoring and admin API requests where they conflict.

### Penalty events: use the new addition/deduction flow

- Pause the legacy AcceptedOrderCancellationTaskEvent scoring path for new operations. Order no longer produces that event for new courier aborts; consume PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent instead (FEEDBACK-014). Credit refund/completion events remain separate and unchanged.
- Staging topics: courier-penalty-addition-dev-v1 and courier-penalty-deduction-dev-v1. Production equivalents use -prod-v1. Local Compose publishes to the emulator's -local-v1 topics; the User consumer/subscriptions remain pending.
- Payload: eventId, eventType, orderId, courierId, penaltyAmount, occurredAt, appliedReason. penaltyAmount is positive; event type specifies addition versus deduction. Active additions: ACCEPTED_TASK_CANCELLATION=2, OVERDUE_DELIVERY=1, WRONG_LOCATION_DELIVERY=4, ITEM_MISHANDLING_OR_DAMAGE=4, DELIBERATE_ITEM_RETENTION_OR_THEFT=10. SUCCESSFUL_DELIVERY deducts 1. COURIER_UNRESPONSIVE is historical-only, not a new selectable case.
- Apply exactly the transmitted final outcome to courierId; do not separately calculate a cancellation/overdue penalty from legacy or Credit events. Admin Apply Penalty only stores the highest policy in Order until the attempt ends; it does not send an immediate score event. One final outcome is recorded per courier assignment, not once per reusable Order ID.
- Authenticate delivery; atomically deduplicate eventId and mutate the score; acknowledge after commit or a known duplicate, and retry transient failures. Define the score-floor/ledger policy for out-of-order additions and deductions as described in FEEDBACK-014.
- Before disabling or replaying legacy subscriptions, inventory outstanding accepted-cancellation messages and processed outcomes. Agree a drain/reconciliation plan with User Service so historical penalties are neither lost nor applied twice. Do not delete legacy outbox/backlog support or provision/disable cloud subscriptions through this documentation update. New-flow publication is independent of consumer readiness; broker acceptance does not prove score application.

### Admin operations: admin-protected provider endpoints required

User Service must provide admin-authorized operations for the dashboard: paginated user search/directory and cross-user profile access (ADMIN-API-001), promotion (003), and safe deactivation (004). Reuse and harden an existing route where its contract fits; otherwise agree a dedicated admin route with the owner before linking the UI. Do not use an ordinary user's endpoint as a substitute for admin authorization. Exact new routes are not finalized by this request.

Validate the caller's Firebase token and authoritative admin role in the provider on every admin operation; never trust UI visibility, supplied actor IDs or a body-supplied role. Reject invalid authentication with401 and authenticated non-admin callers with403. Preserve existing non-admin/self-service contracts and permissions. Safe deactivation must consult Order involvement and retain the documented check/delete race limitations. No manual Suspend User or penalty-replacement endpoint is requested. Credit cross-user history is already admin-protected; cross-user balance remains ADMIN-API-005 pending provider verification, not an ordinary self-balance fallback. Pub/Sub delivery authentication is separate from these human-admin API checks.

Requested peer work is not claimed implemented or deployed. Existing live capability gates/placeholders remain until the owning service's contract and authorization are verified. See admin-peer-api-request.md for the individual requests.


## Admin completion producer — CHANGE-137,2026-10-17

Order now produces the existing compact OrderCompletionTaskEvent for authorized
admin completion of assigned active Orders, including report-held cases. Existing
Credit completion consumer/RESERVED settlement contract matches; no endpoint,
topic or payload change is requested. Credit still validates reservation/courier/
amount and deduplicates; deployed settlement confirmation is not claimed here.
Report resolution calls POST /api/orders/admin/{orderId}/complete with admin
Firebase credentials plus requesterId/courierId and optional appliedPenalties;
full input/error/replay contract is in service-contracts.md. Requester credentials
may place a report hold but cannot authorize this admin funding resolution.

For existing FEEDBACK-014, only the admin's single highest selected addition is
published. Null/empty means no scoring event, even for overdue Orders. No separate
automatic penalty/reward accompanies admin completion. Existing reason/amount
mapping and stable-event-ID subscriber dedup obligations are unchanged. User
consumer/global highest-effective-score reconciliation remain pending peer work.


## CHANGE-135 timing clarification (2026-10-17)

OrderResponse adds nullable ISO-8601 deliveryDeadlineAt and deliveredAt alongside
isOverdue. Delivery starts at START, not ACCEPT; expiresAt is the application
deadline. Existing authorized reads apply; no new peer endpoint, event field or
callback. Admin empty penalties waive even if overdue; no automatic additional
overdue penalty on that cancellation path. User score application remains FEEDBACK-014.


## Effective admin resolution amendment — CHANGE-134,2026-10-16

Order now supports admin cancellation of active Orders, including held Orders,
through POST /api/orders/admin/{orderId}/cancel with requesterId, nullable courierId
and nullable appliedPenalties (PenaltySystemPolicy name array). IDs must match
the locked Order. Null/empty penalties mean refund only; otherwise one highest
addition is emitted; reward SUCCESSFUL_DELIVERY is rejected. Current assignment
is preserved in OpenOrderRefundTaskEvent (CANCELLED) for Credit's existing
reservation/courier validation. Existing topics and seven-field envelopes stay.
No Credit endpoint/consumer change is requested by this matching contract.

FEEDBACK-014's addition consumer must additionally support report/admin reasons:
WRONG_LOCATION_DELIVERY=4, ITEM_MISHANDLING_OR_DAMAGE=4,
DELIBERATE_ITEM_RETENTION_OR_THEFT=10 and COURIER_UNRESPONSIVE=3 (user-approved).
The payload's appliedReason is the single selected case, not an array; tie4 uses
enum declaration order. Do not add scores for every submitted reason. Consumer
remains missing/unverified; per-Order highest-effective scoring across earlier
events and theft suspension remain User/Report responsibilities, not implemented
by this endpoint. Deduplicate stable eventId atomically with scoring.

Report Service can read GET /api/orders/{id} with an existing authorized admin or
Order participant Firebase token. OrderResponse now contains nullable isOverdue:
deliveryDeadlineAt is courier START time + deliveryTimeLimitMinutes, persisted
when starting. deliveredAt is the persisted actual delivery timestamp. Delivered
Orders compare deliveredAt; undelivered progressing Orders compare current time.
CANCELLED undelivered Orders freeze at persisted adminResolutionAt. Strictly after
deadline=true, at deadline=false; unstarted/unassigned/historical/missing timing=null.
Null means unknown/not applicable, not false. Do not use expiresAt or requester
completion time as delivery lateness. Existing role/ownership rules still apply;
this read does not authorize arbitrary service-to-service access.

Admin cancellation is an explicit held-funding resolution exception, not a
generic release: placement rows/flag are retained for history on the terminal
Order. No Report implementation or release endpoint is added. Report should wait
for committed200 and retry the same participant/penalty input on uncertainty;
different input after success is409. Event effects remain eventually consistent.

CHANGE-132 Java library API refinement: common type is PenaltySystemPolicy.
Reward lookup returns SUCCESSFUL_DELIVERY; getCourierPenaltyCases returns the
three report-only reasons, not cancellation/overdue/success; full-policy query
returns all6. Lists are immutable. No HTTP/event field/reason/topic change;
other services are not migrated by Order's adoption. FEEDBACK-014 remains open.


CHANGE-131 (D1 NTH2 PDF37-39): foc-common now additionally maps confirmed
WRONG_LOCATION_DELIVERY=4, ITEM_MISHANDLING_OR_DAMAGE=4 and
DELIBERATE_ITEM_RETENTION_OR_THEFT=10. These are shared policy constants for
future Report/admin resolution; no current Order flow emits them and current
AsyncAPI reason sets remain unchanged. Extend/verify the report-producer and
consumer wire contract before publishing those reasons. D1 requires admin
confirmation, highest applicable effective penalty per errand and permanent
suspension for deliberate retention/theft; enum lookup does not enforce these.
User scoring/suspension/report-resolution and FEEDBACK-014 remain pending.


CHANGE-130 / ADR-043 (2026-10-15): courier reason/amount mapping now lives in the
ordinary root foc-common Maven library, package sg.edu.nus.foc.common.penalty.
Order is the first consumer. This does not implement User's consumer or change
any HTTP/event contract; FEEDBACK-014 stays OPEN. Services can explicitly adopt
the shared policy later; consume stored event amounts without recomputing retries.


## FEEDBACK-015: Call Order involvement checks before deletion/deactivation

-2026-10-14, OPEN/MISSING deletion integration. User DELETE /api/users/{id}
  removes User; Supplier DELETE /api/suppliers/{id} soft-deactivates. Actual
  implementations do not consult Order. No provider source modified.
- Order supplies GET /api/orders/users/{userId}/active-involvement and
  GET /api/orders/suppliers/{supplierId}/active-involvement (CHANGE-129/ADR-042).
  IDs are URI parameters; no JSON body/paging. Forward a caller's Firebase Bearer
  token in production: Requester, Courier or Admin may query. Existing local
  authentication split unchanged; this is not trusted service identity proof.
-200 User JSON: {"userId":"user-id","hasActiveOrders":true}.
  Supplier JSON: {"supplierId":"supplier-id","hasActiveOrders":false}.
  Invalid ID400, caller401/403, role dependency503. Unknown IDs with no matching
  Orders return false, not404; validate entity existence in its owning service.
- Counts OPEN/ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED, including held Orders.
  User matches requester/current courier; Supplier matches pickup/delivery.
  Historic aborted courier attempts/terminal Orders do not count; OPEN with a
  past deadline still counts until lifecycle commits expiry. Queries use SQL EXISTS.
- Before deletion/deactivation, owner must enforce its own authority and refuse
  while hasActiveOrders=true. Treat request/auth/dependency failures as unknown,
  not false. This read is not deletion permission or a reservation; check/delete
  can race new Order admissions. Pending commands and terminal financial/penalty
  obligations are not covered. Agree deactivating/admission/reconciliation policy
  before claiming complete cross-service deletion safety.
- Existing Supplier lookup includes inactive records and reports missingIds;
  keep existing names when records remain. Missing/empty results display Deleted
  supplier in current Order UI, not a persisted Order name. User GET /{id} returns
  404 on absence; future User-name displays should distinguish this from5xx/network
  failures. Current branch has no User-name Order rows; none are fabricated.

## FEEDBACK-014: Explicit courier penalty subscribers (CHANGE-128 / ADR-041)

- Date: 2026-10-14; OPEN/MISSING. User has synchronous outcome functions but
  no Pub/Sub penalty consumer; no separate Penalty Service exists in checkout.
- Approved Order add/deduct publishers:
  courier-penalty-addition-{dev|prod}-v1 / courier-penalty-deduction-{dev|prod}-v1.
- Seven JSON fields: eventId, eventType, orderId, courierId, penaltyAmount,
  occurredAt, appliedReason. Event types PenaltyScoreAdditionEvent /
  PenaltyScoreDeductionEvent. Exact enum reasons/positive amounts:
  ACCEPTED_TASK_CANCELLATION: 2; OVERDUE_DELIVERY: 1; SUCCESSFUL_DELIVERY: 1.
  Direction comes from event type, not a negative amount. The approved successful
  deduction is1; do not use the existing HTTP helper's hardcoded deduction2.
- Target is assigned/cancelling courier, never completing requester/lifecycle.
  Same-ID retries require atomic consumer deduplication with score mutation.
  Sample and contract: CHANGE-128, ADR-041 and docs/asyncapi/asyncapi.yaml.
- User Service should consume both topics, authenticate delivery, decode Pub/Sub
  data, validate type/reason/amount, and atomically record eventId with score
  update. Ack only after commit or a known duplicate; retry transient failures.
- AcceptedOrderCancellationTaskEvent publishing/replay is retired by CHANGE-155.
  Preserve published history and check each deployment database for outstanding
  rows before rollout. Avoid scoring both legacy and new events. Credit consumers stay unchanged.
- Clamp ordering needs explicit User policy: two topics offer no cross-topic
  ordering; at score0, +1 then -1 yields0 but -1 then +1 yields1. Define deterministic
  ledger policy or explicitly accept arrival-order semantics. No consumer changes
  authorized or verified. Order implementation/tests do not verify this absent
  subscriber. Earlier FEEDBACK-002/009 penalty/overdue-source requests are
  superseded by this explicit transmitted-decision contract.

## FEEDBACK-013: Report-to-Order completion holds

- Date/owner: 2026-10-14; Report Service owner to be assigned; Order work by Yao Xiang.
- Status: OPEN. Actual Report caller is MISSING (no Report Service in this checkout).
- Approved Order placement implemented and tested; release explicitly deferred.
  [Contract/design](completion-hold-design.md), CHANGE-127 / ADR-040.
- PUT /api/orders/internal/{orderId}/completion-holds/{reportId}; JSON body
  {"requesterId":"forwarded-Firebase-UID"}; Firebase Bearer token of requester.
  Existing JWT/Requester role verification binds this ID to the token and checks
  ownership under the Order lock. This does not establish service identity or
  verify report existence. Existing local authentication remains unchanged.
- 200 DTO: orderId, reportId, isCompletionHold, version. Place on own OPEN,
  ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED Order. 400 invalid input;
  401/403 caller rejection; 404 missing Order; 409 terminal Order, unresolved
  command or report-ID binding conflict; 503 role dependency unavailable.
  Repeated same report/Order/requester placement is a no-op; conflicting binding
  rejects, including concurrent writes. No DELETE/release endpoint exists yet.
- Required Report behavior: persist/retry the same report identity, wait for hold
  confirmation before claiming completion is blocked. Forward requester auth
  and define durable recovery for failed/uncertain placement. Future release
  must preserve independent holds and replay safety; placement persists for now.
- D1 NTH2 PDF38/NTH3 PDF41 prohibit completion and final credit action while
  investigation is active. Hold placement/release alone does not settle credits,
  change Order status or apply penalties. General enquiries need no Order hold.
- Order tests prove SQL filtering and locked rechecks skip held expiry/completion,
  and domain guards block manual completion/cancellation/abort funding outcomes.
  No new funding event, status or penalty is produced by placement.
- Next verification: implement actual Report client, reconcile report/hold failure
  recovery and later approve release/resolution; drain old Order revisions before
  enabling Report traffic. No Report/User/Credit/Admin/Supplier source modified.

## FEEDBACK-011: User merge authorization and recovery safety

Rollback note (2026-10-11): Vincent explicitly requested reverting merge935d16d.
Commit834bb0d restores first-parent e516cfa exactly. Findings below are retained
for peer coordination against that reviewed main revision, not asserted to be
the current branch implementation. No peer fix or new contract was implemented.

- Date/revision:2026-10-11, merge935d16d versus Order first parent e516cfa.
- Status:OPEN. Classification:INCOMPLETE_OR_INCOMPATIBLE for trusted role
  administration and account/eligibility lifecycle during unresolved work.
  Owner:User Service; shared signup/focus frontend needs its owner's coordination.
- Expected existing boundary: User owns trusted role changes/eligibility and
  identity; Order owns active orders/commands and Credit owns financial effects.
  Identity removal or authority changes must not strand unresolved financial
  effects. Historical outcomes are not permission for a new courier action.
- Actual implemented lookup contracts remain MATCHES_APPROVED_CONTRACT at the
  wire boundary: authenticated GET /api/users/role-context returns userId/roles;
  GET /api/users/courier-eligibility returns isCourierEligible. This review is
  source/config inspection, not new real-user contract execution.

### Findings and required owner action

1. UserService.verifyAdmin returns roles==null || !roles.contains("admin"),
   whereas controllers reject only when !verifyAdmin. Ordinary users therefore
   pass GET /api/users/{userId}, PUT /api/users/{userId},
   PUT /api/users/{userId}/user-promotion and DELETE /api/users/{userId}; real
   admins are rejected. Promotion can inject admin into the role-context Order
   trusts for administrative reads/redrive. Correct and test positive membership,
   missing roles and ordinary-user denial before treating admin facts as safe.
   verifyRequester has the same inverse predicate in the new eligibility API,
   but Order still uses role-context, not requester-eligibility.
2. DELETE /api/users/me and administrative deletion remove Firebase then Mongo
   without checking active orders, pending commands or Credit obligations. A
   pending command's original owner can become unable to authorize reconciliation;
   Order's unresolved guard then still blocks competing expiry/cancellation.
   Agree a safe account-deletion/reconciliation policy across owners. This review
   does not invent a new peer endpoint or approve bypassing Order guards.
3. POST /api/users now saves Mongo then calls Credit registration-facts, while
   frontend AuthProvider still posts another registration fact afterward. Credit
   insert-if-absent prevents a second initial allocation for the same UID; do NOT
   claim double credits. However, an unknown Credit outcome leads User to delete
   its profile, or a failed second frontend call deletes Firebase after User has
   succeeded. Credit may already have committed. Choose one provisioning owner
   and durable outcome/reconciliation; never infer rollback from a timeout.
4. User adjustPenalty removes courier from roles; refreshSuspensionStatus is
   declared but never called. After the month ends, eligibility can return true
   while role-context still lacks courier. Order annotations and mutation/resume
   checks deny acceptance/abort, potentially leaving an assigned or pending abort
   unresolved. Agree and test restoration and existing-task/historical-recovery
   authorization; do not silently grant fresh courier operations to a suspension.

### Verification and stopping point

103 existing frontend tests pass; typecheck passes; lint has no errors/one
profile-test warning. Both Compose configurations validate and preserve HTTP/
local emulator selection. These tests mock shared auth and do not prove the new
User admin/signup/deletion/suspension semantics. No financial/identity mutation,
backend test rerun, merged image rebuild or cloud rollout performed. User/Credit/
Order/frontend application source, contracts and database schema remain unchanged
by this review. Required next action: owner fixes/agreement, then isolated actual
provider regression/contract tests. FEEDBACK-002 penalty consumers and FEEDBACK-005
delegation remain separate existing gaps; generic unauthenticated PUT penalty is
not an approved substitute for User's factual Pub/Sub consumers.

## Manual repost protocol verification — CHANGE-106 / ADR-037 (2026-10-11)

Manual REPOST reuses implemented Credit RESERVE/result/compensation with a stable
NEW candidate and ORIGINAL guard. Four actual Credit/PostgreSQL tests pass for
timeout replay, local rollback, saved rejection and late reversal; no new Credit
endpoint/payload/topic is requested. Exact contract and full regression/rollout
evidence: concurrency/concurrency-order-credit.md and CHANGE-106. This supersedes
only the manual-recovery exclusion below, not hosted IAM/OIDC/User/delegation gaps.

## Effective verification update — CHANGE-105 / ADR-036 (2026-10-11)

Current Credit command protocol and compact refund/completion implementation are
locally verified against actual Credit source/container, not the old snapshot-only
or stub-only descriptions below. Existing FEEDBACK-003/006/009/010 historical
gaps for the approved three-operation command and compact financial paths are
superseded by ADR-035/036 evidence in CHANGE-104/105. This does not prove hosted
IAM/OIDC, manual-repost crash recovery, unrelated legacy callers or User outcomes.

Local emulator publishes three topics; only refund/completion subscribe Credit.
Real Compose User/Supplier role/location validation and Credit reservation,
replay, clear/assign/refund/transfer pass the scoped smoke test. No Google cloud
configuration is altered at runtime. FEEDBACK-002 User penalty/completion consumer
and separate overdue-facts-source work remain missing/unverified; FEEDBACK-005
trusted delegation is deferred. No peer penalty endpoint is silently substituted.
The narrow approved Credit emulator-auth exception and exact changes/tests are
documented in concurrency/credit-local-emulator-security-interference.md.

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


CHANGE-088 / ADR-029 now implements an opt-in [local real broker connector](local-live-testing.md)
with isolated refund/completion push subscriptions and existing Google auth.
This resolves the absent local ingress configuration, NOT peer semantic gaps or
live financial verification. 60 config/safety and 16 nginx/fixture assertions pass;
gcloud/ADC/live tests outstanding. No missing endpoint request or feedback status
removed/upgraded on this basis. No Credit subscription to User penalty topic;
003/005/006/007 and User consumers remain as documented below.

Current handoff: **2026-10-09**, Vincent, `sprint-2-3-credit`, CHANGE-087.
Pre-CHANGE-092 evidence (refund/completion schema compatibility is now superseded by FEEDBACK-009).
Inspected integrated revision: `09e04a0` (`pull: credit service`).

Follow-up financial verification (2026-10-09, source unchanged): existing focused
Credit tests ran in Java 21 Docker from a read-only source copy, with isolated
Testcontainers PostgreSQL/credit_test (Flyway V1/V2). **27 tests passed, 0 failures,
0 errors, 0 skipped**, including 12 persistence integration tests. Refund for
CANCELLED/EXPIRED and completion transfer/deduplication are implemented and locally
tested at Credit's layers. This is NOT live Pub/Sub delivery, deployed IAM/OIDC,
full Order-to-Credit or coverage verification. Accepted-cancellation code/config
is intentionally unchanged at the user's request; 007 remains a separate gap.

This user-requested rewrite removes already-implemented Credit routes and
refund/completion handlers from the **missing implementation** list. Section 6
retains a small evidence register, not requests to build those capabilities again.
Remaining gaps include incompatible behavior, not just absent route names.
Source inspection and existing test source are NOT executed tests or confirmation
that GCP subscriptions/IAM/deployed consumers are working. No entry is upgraded
to VERIFIED solely because its implementation exists.

CHANGE-086 follow-up: Order now stores explicit automatic new expiry and latest
safe manual/automatic attempt failure code/message/time; UI reload reads them.
These are Order API/storage fields, NOT new peer request/event fields. Existing
reservation/assignment/reset/topic contracts below are unchanged. No new provider
route is needed for latest-outcome persistence. Trusted background credentials,
same-candidate durable tasks and all background retries remain paused; FEEDBACK
005/006 still require peer agreement. This does not verify auto repost in HTTP mode.
User explicitly requested replacing the whole document. Earlier proposals remain
recoverable in Git (including c993591); stable FEEDBACK IDs are retained below.
This is a peer-work request, NOT permission for Order to edit peer source, approve
contracts for peer owners, or claim live integration from stub tests.

## Status and boundaries

Inspection evidence: CreditController/DTOs, CreditService, JpaCreditRepository,
CreditOrderEventController, typed event handlers/OrderEventMessage,
CreditPushProperties, both security chains/role provider/push-token validator,
relevant API/persistence/consumer/security test source, application/deployment
configuration and infra/gcp/configure-credit-pubsub.sh; compared with Order's
HttpPeerAdapters, event DTOs/mapper and OrderTransitionService under ADR-025/028.
User event-consumer source search found no matching handlers. Supplier contracts
below retain the earlier inspection; no Supplier implementation change is claimed.

| Owner | Needed capability | Classification / stopping point |
| --- | --- | --- |
| Credit (Annablee) | Restrict cleared-reservation reset replay to the authorized attempt/caller | INCOMPLETE_OR_INCOMPATIBLE, FEEDBACK-003; route EXISTS |
| Credit (Annablee), platform owner | Align accepted-cancellation subscription with current User-only penalty flow | INCOMPLETE_OR_INCOMPATIBLE, FEEDBACK-007; legacy Credit refund handler EXISTS but is unsuitable |
| User | Abort penalty and completion consumers | MISSING, FEEDBACK-002; Order publisher exists |
| Credit (Annablee) | Active reservation confirmation/reconciliation | INCOMPLETE_OR_INCOMPATIBLE for durable retries, FEEDBACK-006 |
| User, Supplier, Credit | Trusted delegated background calls | MISSING, FEEDBACK-005; documentation ONLY |
| Credit/User | Compact refund/completion consumer migration and overdue data source | INCOMPLETE_OR_INCOMPATIBLE, FEEDBACK-009 |
| Supplier | Pair validation and batch lookup | Existing routes; no extra foreground business API needed |

**Latest user decision: pause ALL background retry implementation until peers agree.**
No durable retry task, candidate-ID persistence or retry worker is implemented.
Existing automatic repost code is not thereby a verified trusted-peer integration.
Foreground manual repost uses the current Firebase user token; HTTP mode NEVER
falls back to mocks. Mock mode is a separate test configuration.
Visible-page polling reads lists/balance every 15 seconds and on focus/mutation;
it does not trigger reposts, perform refunds or replace a peer consumer.

## 1. Credit Service — Annablee: remaining work only

### FEEDBACK-003: reset replay authorization and stale-attempt protection

Status: OPEN. Classification: INCOMPLETE_OR_INCOMPATIBLE for replay security.
The endpoint and core reset/hold behavior are implemented; do NOT recreate them.

~~~http
POST /api/credits/orders/{orderId}/hold-for-reopen
Authorization: Bearer <assigned courier Firebase ID token>
~~~

Request: **NO body**. Expected response: **exactly 200 OK, NO body**.

- Evidence: CreditController requires ROLE_COURIER; JpaCreditRepository locks the
  reservation and requires RESERVED. An assigned caller mismatch is rejected.
  BUT it returns success immediately when courierId is null, before checking
  callerId. Thus any caller with the courier role can obtain a successful reset
  response for an unassigned reservation, not only the courier replaying a reset.
- Required: retain enough Credit-owned authorization/replay evidence to authorize
  the legitimate cleared-assignment replay; deny an unrelated courier. Agree
  protection against stale resets after reassignment, including the same courier
  accepting again. Current path/token alone cannot distinguish same-courier
  attempts; any new command/attempt/generation field requires owner/user approval.
  This review does NOT add a field or select that design.
- Current Order safeguards must not be omitted when explaining this risk:
  cancelAccepted locks and validates the current ACCEPTED order/version, waits
  for Credit's exact 200, then commits OPEN/EXPIRED and a command receipt. A
  failed call leaves it ACCEPTED, preventing new acceptance; a committed command
  replay returns before another Credit call. Thus a normal serialized abort/
  acceptance does NOT exhibit the simplified stale-clear example. Credit-side
  replay authorization and delayed/direct duplicate requests or a future retry
  mechanism remain separate hardening concerns, not an observed normal-flow bug.
- Preserve the existing no-body request and bodyless 200 unless a coordinated
  contract amendment is approved. No refund in this call; retain reserved amount.
  Unauthorized replay should return 403; incompatible state/generation 409;
  invalid token 401; missing reservation 404; persistence failure 503, using the
  existing envelope in section 4. No tokens may be saved as replay proof.
- Provider tests must cover unrelated caller after null reset, legitimate lost-
  response replay, reassignment, repeated same-courier attempts and concurrency.
  Existing tests cover wrong caller while assigned, not the cleared-state gap.
- Order still calls this BEFORE every abort. On failure it remains ACCEPTED with
  no new history/outcome event. On success current state resolves OPEN/EXPIRED;
  every abort emits User penalty facts, and EXPIRED additionally emits refund.

### FEEDBACK-007: Credit's accepted-cancellation consumer uses superseded semantics

Status: OPEN. Classification: INCOMPLETE_OR_INCOMPATIBLE.
Owners: Annablee plus subscription/platform owner; coordinate User owner.

Approved current contract (ADR-025):

- Topic `accepted-order-cancellation-dev-v1` / production
  `accepted-order-cancellation-prod-v1` (ORDER_ACCEPTED_CANCELLATION_TOPIC).
- Event `AcceptedOrderCancellationTaskEvent`, version 1. Section 4 full envelope;
  actorId is aborting courier; order.courierId=null; order.status is OPEN or
  EXPIRED. This is **User penalty signaling, NOT a Credit refund instruction**.
- OPEN keeps its same reservation. EXPIRED receives a separate
  `OpenOrderRefundTaskEvent` on `open-order-refund-dev-v1` / prod-v1 for Credit.

Actual implementation: the accepted-cancellation endpoint invokes its fixed
Credit handler, whose CreditService validation requires ABORTED and whose processOutcome
calls repository.refund. Its tests use ABORTED snapshots. The provisioning script
also creates `credit-accepted-order-cancellation-dev-v1` / prod-v1 subscriptions.
Consequently current Order OPEN/EXPIRED penalty events are rejected (400), rather
than implementing the approved flow. Simply allowing those statuses while still
refunding is UNSAFE: an OPEN reopened order must retain its reservation.

Required peer action: align Credit subscription provisioning/routing with the
current financial topics (refund and completion only); keep accepted-cancellation
penalties in User Service. Coordinate any legacy ABORTED messages/subscription
cutover and dead-letter recovery explicitly; do not silently delete queued work
or rewrite Order snapshots to ABORTED. No extra Credit endpoint or response is
required by this current penalty flow. How to handle legacy deliveries is an
owner-agreed rollout decision, not an implemented assumption in this review.

Required tests: abort before expiry -> reservation remains RESERVED; abort at/
after expiry -> separate refund event releases once; delivery order/duplicates do
not double-release; User separately receives every abort. Do NOT ACK incompatible
legacy financial messages without a reviewed reconciliation plan.

### FEEDBACK-006: reservation confirmation and future retry safety

Status: OPEN. Classification: INCOMPLETE_OR_INCOMPATIBLE for future retry safety;
the existing PUT/GET routes are implemented, not missing.

These provider endpoints already exist:

~~~http
PUT /api/credits/orders/{newOrderId}/reservation
Authorization: Bearer <requester Firebase ID token>
Content-Type: application/json
~~~

~~~json
{ "requesterId": "requester-firebase-uid", "amount": 5 }
~~~

Current response: 201 for new, 200 for identical replay:

~~~json
{
  "orderId": "new-business-order-id",
  "requesterId": "requester-firebase-uid",
  "courierId": null,
  "amount": 5,
  "status": "RESERVED",
  "balance": {
    "userId": "requester-firebase-uid",
    "totalBalance": 50,
    "reservedBalance": 5,
    "usableBalance": 45,
    "asOf": "2026-10-09T04:00:00Z"
  },
  "createdAt": "2026-10-09T04:00:00Z",
  "updatedAt": "2026-10-09T04:00:00Z",
  "refundedAt": null,
  "paidAt": null
}
~~~

GET /api/credits/orders/{newOrderId}/reservation exists, requester-authenticated;
200 returns the same reservation fields, but **balance is omitted** on GET.
404 means not observed, not proof an in-flight PUT cannot commit later.

Before implementing durable retries, agree and verify:

- Matching ID/requester/amount and ACTIVE RESERVED must be confirmed before OPEN.
  An identical replay of REFUNDED/PAID must not be treated as a fresh active hold.
  JpaCreditRepository.replayReservation currently checks requester/amount but
  not status, returning an existing REFUNDED/PAID reservation with 200 as well.
  Agree terminal-state behavior and test it; do not silently reactivate/pay twice.
- One candidate NEW business UUID per saved attempt, reused across uncertain
  writes via GET/idempotent PUT. Candidate IDs are NOT identity credentials.
- Compensation/reconciliation for remote success + local rollback, late success
  after expiry, missing/invalid/mismatched confirmations and concurrent attempts.
  This includes courier assignment succeeding remotely before Order acceptance
  fails, and reset succeeding before Order abort commits. FEEDBACK-004's route
  is implemented, but a multi-database recovery protocol is not established by it.
- Current Order reserve adapter ignores success body; CHANGE-085 fixes semantic
  errors only. Confirmation/recovery remains NOT implemented; no new unapproved
  recovery route is invented here.

Existing semantic distinction: **409 INSUFFICIENT_CREDITS** versus
**409 RESERVATION_CONFLICT**. Order preserves the first code for manual UI;
other 409s remain conflicts. 401/403 stop; temporary transport/server failure
does not prove low funds. Delayed refund and inadequate funds can cause the SAME
balance error: do not label refund pending without authoritative Credit facts.
No new CreditsRefunded event or refund-confirmation gate is approved here.

GET /api/credits/me already serves balance polling; no new API is required for
this UI. Missing accounts require the existing signup registration-facts flow.

#### 2026-10-10 proposed creation-recovery extension (ARCH-EVO-034)

Documentation/discussion only; not an approved wire contract or implementation.
Existing PUT/GET can support same-ID reservation reconciliation with valid caller
authorization. Order still needs to persist the intent before the write and
interpret the response's matching requester/amount/order ID and RESERVED state.
Current adapter discards that body. Neither service's local transaction makes
these two commits atomic.

Credit owner discussion required for compensation when a reservation succeeds but
OPEN cannot subsequently be committed, including expiry or permanent rejection:

- Agree an idempotent authorized cancellation/refund operation for a creation
  intent that never became an Order. Exact route/event, fields and responses are
  UNRESOLVED; do not fabricate a CANCELLED Order snapshot on the existing topic.
- The operation must resolve the same reservation identity, release at most once,
  and return or expose authoritative terminal state. A PAID reservation must not
  be blindly refunded or reactivated by creation recovery.
- Agree terminal fencing for cancellation before/alongside a delayed reservation
  write. GET 404 alone cannot establish that the write will never commit. A
  delayed original PUT must not create a hold after compensation was finalized.
  Any operation ID/fencing token and its retention are contract decisions, not
  assumed existing fields. Order worker leases alone cannot fence remote writes.
- Test lost successful replies, matching/terminal replay, concurrent duplicate
  requests, local failure after remote commit, compensation replay and delayed PUT
  versus cancellation. Existing matching PUT/GET routes are not called missing;
  this additional recovery protocol remains INCOMPLETE_OR_INCOMPATIBLE.

Unattended authorization is separately FEEDBACK-005 and remains paused. No
browser token persistence, authorization bypass, new endpoint/topic or Credit
source change is authorized by this proposal. Durable creation recovery is
PROPOSED, not a verified financial integration.

#### Proposed operation-key replay for foreground commands and recovery

Vincent asks for a review of one frontend command key carried through Order to
Credit for reservation, assignment and reset. This is a proposal under ARCH-EVO-034,
NOT an approved addition to ADR-018's current no-command-field peer contracts.

- Existing routes remain PUT reservation, PUT courier-assignment and POST
  hold-for-reopen as above. Order's inbound commandId is currently not forwarded.
  Reservation uses business ID/requester/amount replay; assignment/reset inspect
  current state. Historical activity identity/result replay for all three is
  INCOMPLETE_OR_INCOMPATIBLE for the proposed recovery requirement, not another
  missing copy of the existing business endpoint.
- Discuss an authenticated operation key scoped by operation/caller, immutable
  target/actor/payload binding, atomic financial effect + deduplication/result,
  equivalent success/rejection replay and concurrent duplicate behavior. Exact key
  header/body, request DTO additions, response/status-query format and retention
  are UNRESOLVED; do not silently change the current request contracts.
- A separate committed Credit PENDING record is optional for single-DB synchronous
  work. If used, agree stale-claim recovery. Do not mark a command completed before
  its financial effect commits or only in a later unrelated success transaction.
  Rejection replay must follow rollback/no-effect guarantees; transient/auth errors
  are not immutable business rejection. Validate caller on every replay.
- Same business order can have repeated courier attempts; stale historical reset
  or assignment must not affect a newer attempt. Coordinate FEEDBACK-003 for any
  operation/generation amendment; actor/order ID alone is not an agreed solution.
- Agree recovery authorization (005), late-write/compensation protocol (006) and
  lost reply, changed payload, simultaneous duplicates, concurrent UI/worker,
  restart and stale-reset tests before implementing or claiming compatibility.

#### Proposed three-command implementation plan: agreement needed before code

2026-10-10, PROPOSED under ARCH-EVO-034. Existing routes and business bodies are
not missing; their historical command replay/recovery is classified
INCOMPLETE_OR_INCOMPATIBLE for the new requirement. No peer change authorized.

- Candidate transport: `Idempotency-Key: <frontend commandId>` on the three
  existing reservation/assignment/hold calls, with existing Firebase bearer and
  unchanged JSON/no-body shapes. Header name/protocol NOT agreed yet. Different
  operations/actors require separate keys and server scope/input binding.
- Credit must atomically commit the financial mutation with its durable historical
  operation key and safe equivalent result, serialize concurrent duplicates and
  validate caller/ownership on every replay. A historical success must not mutate
  a newer courier attempt; current nullable-courier checks alone are insufficient.
- Agree whether existing bodyless 200 replies remain usable or whether a result
  query/operation receipt is needed. Reservation success must include/read matching
  ACTIVE RESERVED state; terminal refunded/paid replay is not a fresh reservation.
  Operation lookup must support the authorized courier for assignment/reset;
  existing requester-only GET is not assumed suitable for that role.
- Agree definitive no-effect rejection versus ambiguous/unresolved response;
  retention, wrong-input key conflict, old/new attempt fencing, late writes and
  reconciliation/compensation when local acceptance/creation is now invalid.
  Exact additional endpoint/path/request/response is pending owner agreement;
  no unsafe use of existing full-Order refund event for an absent Order is selected.
- Interim authorization proposal: persist NO Firebase token; scheduler identifies
  recovery but financial replay waits for user-authenticated same-key resume.
  Fully unattended delegation remains FEEDBACK-005 and paused. Expired-token 401
  cannot erase an earlier ambiguous financial operation. Credit must never accept
  an activity key/requesterId alone as authority.
- Required tests after agreement: all three lost-response/commit-replay paths,
  same-key changed-input/caller rejection, concurrent duplicates, expired-token
  then refreshed-token replay, reset versus later acceptance/late worker, terminal
  reservation replay and agreed compensation. Tests must use actual provider;
  mocks cannot close 003/006. Owner Annablee; next step contract discussion and
  reinspection, not Order-only assumption or provider source edit.

## 2. User Service

### FEEDBACK-002 (User): courier-abort penalty subscriber

Development topic **accepted-order-cancellation-dev-v1**; production from
ORDER_ACCEPTED_CANCELLATION_TOPIC. Event AcceptedOrderCancellationTaskEvent,
version 1, unchanged envelope/snapshot in section 4.

- EVERY successful ACCEPTED-only courier abort emits this after synchronous
  Credit reset: both OPEN and EXPIRED current outcomes.
- **actorId is the aborting courier**. Snapshot courierId is already null.
  Do not charge the requester or try to identify the offender using null.
- Snapshot status is OPEN or EXPIRED, NOT ABORTED. Immutable ABORTED attempt
  history is separate and is not embedded in these messages.
- Deduplicate eventId and apply User-owned penalty/score/suspension policy once.
  Do not calculate refunds or financial deductions on this topic.
- ACK after durable User effects commit. Retry temporary failures and provide
  monitored dead-letter/reconciliation handling for permanent failures.

### FEEDBACK-002 (User): completion-facts subscriber

Create a **separate User subscription** to order-completion-dev-v1 (production
ORDER_COMPLETION_TOPIC). Do not share a competing-consumer subscription with
Credit: BOTH services need every completion.

OrderCompletionTaskEvent now carries only the seven-field COMPLETED body in section 4.
Identify courier via courierId. Apply User-owned on-time/late policy once by eventId
only after agreeing the authoritative separate overdue source (FEEDBACK-009);
this body has no overdue or deadline facts. ACK after durable effects commit.
Order does not prescribe a new numeric penalty rule.

Existing GET /api/users/role-context returns userId/roles from authenticated
Firebase UID and User-owned role records:

~~~json
{ "userId": "firebase-uid", "roles": ["requester", "courier"] }
~~~

Existing GET /api/users/courier-eligibility provides eligibility. These are not
delegated requester APIs for a service identity; FEEDBACK-005 covers that gap,
not a candidate-ID approval lookup.

## 3. Supplier Service

No missing foreground business API found for current Order needs:

~~~http
POST /api/suppliers/validate
Authorization: Bearer <Firebase user ID token>
Content-Type: application/json
~~~

~~~json
{ "pickupSupplierId": "pickup-id", "deliverySupplierId": "delivery-id" }
~~~

200 valid: { "valid": true, "problems": [] }.
200 invalid:

~~~json
{
  "valid": false,
  "problems": [
    { "field": "pickupSupplierId", "supplierId": "pickup-id", "reason": "INACTIVE" }
  ]
}
~~~

Reasons include NOT_FOUND, INACTIVE, SAME_SUPPLIER. Order already requires
explicit valid:true; false/missing confirmation fails closed (CHANGE-083).
Existing authenticated POST /api/suppliers/lookup with
{ "ids": ["pickup-id", "delivery-id"] } supplies display resolution.
No new subscription or catalogue-write permission is requested.
Only a restricted trusted validation/read authorization extension is needed
for unattended calls, if peers approve FEEDBACK-005.

## 4. Exact event data, ACK and error formats

Authoritative serialization: messagingpublisher/dto/*TaskEvent.java,
OrderEventSnapshot, RepostPlanEventSnapshot, OrderTaskEventMapper.

Effective compact refund/completion JSON message data (schema v2):

~~~json
{
  "eventId": "stable-event-uuid",
  "eventType": "OrderCompletionTaskEvent",
  "orderId": "business-order-id",
  "orderStatus": "COMPLETED",
  "creditAmount": 5,
  "occurredAt": "2026-10-09T04:00:00Z",
  "courierId": "courier-firebase-uid"
}
~~~

Refund has the same seven keys, eventType OpenOrderRefundTaskEvent and orderStatus
CANCELLED or EXPIRED. courierId may be null and is still present. No requester's ID,
versions, snapshot/history, actor, overdue or deadline is sent. Credit looks up
its own transaction by orderId; User overdue-source agreement remains FEEDBACK-009.
Pub/Sub attributes retain eventId/eventType/eventVersion=2. See FEEDBACK-009 for
consumer incompatibility, rollout and required tests.

Accepted cancellation JSON message data remains version 1:

~~~json
{
  "eventId": "stable-event-uuid",
  "eventType": "AcceptedOrderCancellationTaskEvent",
  "eventVersion": 1,
  "orderId": "business-order-id",
  "orderVersion": 7,
  "occurredAt": "2026-10-09T04:00:00Z",
  "actorId": "courier-firebase-uid",
  "order": {
    "id": "business-order-id",
    "requesterId": "requester-firebase-uid",
    "courierId": null,
    "itemDescription": "Collect a parcel",
    "pickupSupplierId": "pickup-id",
    "deliverySupplierId": "delivery-id",
    "offeredCredits": 5,
    "status": "OPEN",
    "createdAt": "2026-10-09T01:00:00Z",
    "expiresAt": "2026-10-09T02:00:00Z",
    "deliveryTimeLimitMinutes": 15,
    "version": 7,
    "originalOrderId": null,
    "repostedOrderId": null,
    "repostPlan": {
      "enabled": true,
      "dueAt": "2026-10-09T02:15:00Z",
      "creditAmount": 6,
      "deliveryDurationMinutes": 30,
      "used": false
    }
  }
}
~~~

Accepted cancellation retains the envelope/snapshot keys above, without overdue or
overdueAt. Resulting status is OPEN or EXPIRED, actorId is the aborting courier,
and snapshot courierId is cleared. Its User-only penalty subscription remains.
repostPlan and links may be null; no checkpoints, internal row UUID, attemptId,
generic facts, outcomeType or repostExpiresAt is included.

Order commits status and event intent atomically, attempts immediate after-commit
publication, then recovers pending/failed rows every 15 minutes for ALL three
events. Pub/Sub message-ID success means broker acceptance, NOT completed refund,
settlement or penalty. Consumer owners provision separate environment-matched
subscriptions, least-privilege subscriber IAM, durable deduplication, retry/
dead-letter monitoring and recovery. Pull ACK or authenticated push/function
handler is for owners to agree/provision; no callback endpoint is invented here.
Push wraps JSON as base64 message.data; decode before validating type/version,
the appropriate body schema and stable event ID. Snapshot ID/version checks apply
only to the unchanged accepted event. Duplicate delivery is expected.

Existing Credit HTTP error envelope (example assignment state conflict):

~~~json
{
  "status": 409,
  "error": "RESERVATION_CONFLICT",
  "message": "Reservation state does not permit this operation.",
  "path": "/api/credits/orders/business-order-id/courier-assignment",
  "timestamp": "2026-10-09T04:00:00Z",
  "details": []
}
~~~

Reservation INSUFFICIENT_CREDITS/RESERVATION_CONFLICT are already provider-defined;
do not infer from error text. Credit also distinguishes ACCOUNT_NOT_FOUND and
RESERVATION_NOT_FOUND (404), EVENT_CONFLICT (409), VALIDATION_ERROR (400),
UNAUTHENTICATED (401), FORBIDDEN (403), SERVICE_UNAVAILABLE (503). Replay/recovery
gaps require peer agreement. Events return ACK, NOT a JSON result to Order.

## 5. FEEDBACK-005: trusted background authorization — documentation ONLY

**DO NOT IMPLEMENT YET. ALL background retry implementation is PAUSED by user.**
Involved: **Order, User, Supplier, Credit, platform/deployment IAM owner**.

Automatic repost and saved manual retries would run without a browser. Firebase
user ID tokens expire. A requesterId, candidateId, lifecycle secret or
verified=true flag is not authenticated delegated authority. Foreground Firebase
token forwarding remains unchanged.

Proposal to discuss, NOT a selected credential protocol:

Credit now authenticates **Pub/Sub incoming push** with Google OIDC, but that
is a different trust boundary from Order making delegated outbound reservation
calls. Its business routes still use Firebase caller UID, and reservation still
requires UID=requesterId. Push authentication does NOT close FEEDBACK-005.

| Service | Required work after agreement |
| --- | --- |
| Order | Authenticate using renewable restricted service identity; prove saved consent/ownership; send delegated requester through agreed contract; no saved user refresh tokens |
| User | Verify trusted Order caller AND authorize requester role lookup/delegated action using current roles/revocation; current token-derived role-context cannot treat service subject as requester UID |
| Supplier | Verify trusted caller; permit only agreed pair validation/read operations; keep activation rules; no writes |
| Credit | Verify trusted caller; authorize only agreed on-behalf-of reservation/read/reset/assignment; enforce ownership/account/state/idempotency without arbitrary requesterId bypass |
| Platform | Agree identities, issuer/audience, token transport, least privilege, renewal/rotation, local testing and secret handling; no shared service-account keys |

Peers can implement service-verification middleware/function plus restricted
delegated endpoints, or extend existing routes with explicitly distinguished
service authorization. **Exact routes, headers, claims, audience and additional
JSON are TBD with peers.** Cloud Run IAM identity is a candidate proof, not
sufficient application delegation by itself. A restricted User lookup would take
delegated requesterId and return agreed userId/roles facts only to authorized
callers; no unapproved route is prescribed.

Agree wrong-service/audience/expired-token rejection, requester/operation scope,
revoked roles/consent, renewal, replay, audit attribution and error semantics.
Tests must cover positive consent, forged requester, unpermitted actions, wrong
caller, revocation, token renewal, duplicate operations and local/cloud runtime.

Until agreement: NO retry worker (including mock mode), anonymous peer calls,
indefinite cached Firebase token, bypass, or HTTP fallback to mocks.
Same-candidate persistence/backoff/reconciliation remains an approved design on
hold. Current manual errors and authenticated read polling work independently.

## 6. Implemented Credit capabilities — evidence, NOT outstanding build requests

These have been ruled out as absent endpoints/handlers on `09e04a0`.
Status: READY_FOR_VERIFICATION for live integration where compatible; NOT live
VERIFIED. Initial review inspected test source only; the subsequent focused
execution below verifies Credit-local behavior, not deployed subscriptions.

| Feedback / capability | Actual implemented contract | Source comparison |
| --- | --- | --- |
| FEEDBACK-004: courier assignment | PUT /api/credits/orders/{orderId}/courier-assignment; Firebase courier bearer; JSON {"courierId":"courier-uid"}; exactly 200, empty body | MATCHES_APPROVED_CONTRACT for the synchronous route and basic guards; recovery remains FEEDBACK-006 |
| FEEDBACK-003: core reset | POST /api/credits/orders/{orderId}/hold-for-reopen; Firebase courier bearer; no body; exactly 200, empty body | Route/reset exists; replay security remains INCOMPLETE_OR_INCOMPATIBLE in section 1 |
| FEEDBACK-002 Credit: refund | OpenOrderRefundTaskEvent v1; CANCELLED/EXPIRED and null courier; old order ID/requester/amount checked; release once | Historical v1 match; current compact v2 INCOMPLETE_OR_INCOMPATIBLE, FEEDBACK-009; accepted-topic gap remains 007 |
| FEEDBACK-002 Credit: completion | OrderCompletionTaskEvent v1; COMPLETED, matching courier and overdue facts; debit requester reserved/total and credit courier once | Historical v1 match; current compact v2 INCOMPLETE_OR_INCOMPATIBLE, FEEDBACK-009 |
| Existing reservation/read/balance/signup | PUT/GET reservation; GET /me; POST /registration-facts | Present; no duplicate route requested; terminal replay safety remains FEEDBACK-006 |

### Concrete implementation/test evidence

Paths below are relative to repository root; peer files remain read-only.

- `credit-service/src/main/java/sg/edu/nus/foc/credit/api/CreditController.java`:
  route method, role/self checks and bodyless 200; `CourierAssignmentRequest`
  validates a nonblank maximum-128-character courierId.
- `credit-service/src/main/java/sg/edu/nus/foc/credit/persistence/JpaCreditRepository.java`:
  row-locked RESERVED assignment, courier account existence, same-assignment
  replay/different-assignment conflict; reset retains reservation; transactional
  refund/settlement, event ID+payload hash deduplication, ledger/account updates.
- `credit-service/src/main/java/sg/edu/nus/foc/credit/messaging/JsonOrderEventPayloadDecoder.java`,
  the three typed Credit handlers and `OrderEventMessage.java`: matching former
  v1 envelope/snapshot fields, subscription/type guardrails and the completion-only
  overdue fact. These requirements remain incompatible with CHANGE-092 compact
  refund/completion bodies; see FEEDBACK-009.
- `credit-service/src/main/java/sg/edu/nus/foc/credit/api/CreditOrderEventController.java`:
  typed POST routes under `/api/credits/internal/order-events/` decode wrapped
  Base64 data and return **204 NO BODY after processing/transaction commit**.
  This is the push ACK,
  not a refund/completion JSON response or callback to Order.
- `credit-service/src/main/java/sg/edu/nus/foc/credit/security/SecurityConfig.java`
  and `PubSubPushTokenValidator.java`: separate push chain checks Google-signed
  issuer/audience/configured service-account email/email_verified; business
  chain remains Firebase. `HttpUserServiceRoleProvider` forwards the user token
  and validates response userId. Local mock role configuration is not proof of
  live User role integration.
- Existing test source: `credit-service/src/test/java/sg/edu/nus/foc/credit/api/CreditApiIntegrationTest.java`,
  `persistence/JpaCreditRepositoryIntegrationTest.java`,
  `messaging/JsonOrderEventPayloadDecoderTest.java`,
  `messaging/CreditOrderEventHandlersTest.java`,
  `api/CreditOrderEventControllerTest.java`, `security/SecurityComponentsTest.java`.
  Positive, negative and duplicate cases exist; legacy ABORTED consumer cases do
  NOT establish ADR-025 compliance. Missing replay cases are listed in section 1.
- Current verification: `./mvnw verify` in Java 21 with isolated PostgreSQL.
  PASS: 79 tests with no failures/errors/skips, OpenAPI validation and JaCoCo
  line/branch gates. Tested persistence settlement moved requester 50 -> 40, reserved 10 ->
  0, courier 50 -> 60; replay did not transfer again. Expired refund released
  reserved funds and marked REFUNDED; CANCELLED service/consumer mapping is also
  covered. This split-layer run does not exercise cloud transport or live Order
  publishing. Some existing cases test the legacy accepted-cancellation handler;
  their success is NOT current 007 compliance. Maven test, not verify: no coverage
  gate or full Credit test-suite pass is claimed.
- Order comparison: `order-service/src/main/java/sg/edu/nus/foc/order/adapter/HttpPeerAdapters.java`,
  `order-service/src/main/java/sg/edu/nus/foc/order/application/OrderTransitionService.java`
  and Order's `messagingpublisher/dto/` and `messagingpublisher/mapper/` files.
  No Order HTTP adapter change
  is needed just to discover these implemented routes.

### Topic/subscription provisioning exists; deployed delivery remains unverified

| Current required financial stream | Dev topic -> Credit subscription | Production topic -> Credit subscription |
| --- | --- | --- |
| Refund | open-order-refund-dev-v1 -> credit-open-order-refund-dev-v1 | open-order-refund-prod-v1 -> credit-open-order-refund-prod-v1 |
| Completion | order-completion-dev-v1 -> credit-order-completion-dev-v1 | order-completion-prod-v1 -> credit-order-completion-prod-v1 |

Project: `protean-vigil-509704-q4`. Settings are in CreditPushProperties,
application.yaml, deploy/env.yaml and infra/environments/{staging,production}.env.
Push envelope received by the existing Credit endpoint:

~~~json
{
  "message": {
    "data": "BASE64_OF_ORDER_EVENT_JSON_FROM_SECTION_4",
    "messageId": "pubsub-message-id"
  },
  "subscription": "projects/protean-vigil-509704-q4/subscriptions/credit-open-order-refund-dev-v1"
}
~~~

The separate `infra/gcp/configure-credit-pubsub.sh staging` script creates/updates
authenticated push subscriptions to the deployed Credit URL plus the matching
`/api/credits/internal/order-events/open-refund`, `/accepted-cancellation`, or
`/completion` path, matching OIDC audience/service identity,
retry settings, DLQ/recovery subscription and IAM. Bootstrap documents this
separate step; merely running bootstrap/Compose does not prove it was run.
The current script ALSO provisions the incompatible accepted-cancellation stream
listed in FEEDBACK-007; resolve that before using it for the current workflow.
Production is intentionally disabled by CREDIT_PUBSUB_PRODUCTION_ENABLED=false;
enabling/provisioning requires the platform owner's approval and staging checks.

Local Compose settings use an internal Docker hostname/local push identity;
they do not create a publicly reachable authenticated Cloud Pub/Sub push path
to a developer's machine. A configured subscription name is not a live subscriber.
No gcloud executable was found in this runner, and no live GCP/ledger/browser
test was performed; cloud subscription existence, IAM, actual ACK and balances
remain runtime gates, not missing Java consumer implementations.

**FEEDBACK-001 remains SUPERSEDED:** synchronous release/settlement endpoints
are not required by the effective event flow. Order's unused legacy settle
adapter method does not create a new provider requirement. No CreditsRefunded
callback/event or refund-confirmation gate is requested by this review.

## Owner handoff / closing criteria

1. Annablee addresses remaining reset replay protection (003), terminal replay/
   cross-service reconciliation (006) and legacy accepted-cancellation routing
   (007). Do NOT ask her to recreate the implemented assignment/reset routes or
   refund/completion handlers. Runtime test the compatible implemented contracts.
2. User owner agrees/implements abort and completion subscriptions separately.
3. User/Supplier/Credit/platform agree FEEDBACK-005 before background work resumes.
4. Peer completion reports are READY_FOR_VERIFICATION, not VERIFIED. Reinspect
   source/DTO/security/tests, run authenticated positive/negative/idempotency/
   concurrency/timeout/consumer tests against isolated data before closing.
5. Platform owner verifies compatible subscriptions/IAM/push identity/DLQ and
   authenticated refund/settlement balances after the 007 cutover. Production
   promotion remains a separate approved action.
6. Order stub/publisher/RTL tests and this source review do not prove live money
   movement, penalties, deployed subscriptions or Sprint completion. Peer source,
   infrastructure, application code and databases were NOT changed in this review.

## FEEDBACK-008: Pub/Sub push incorrectly inherits Firebase user-role conversion

Date: 2026-10-09. Owner: Credit (Annablee). Status: READY_FOR_VERIFICATION.
Classification: INCOMPLETE_OR_INCOMPATIBLE. Existing endpoint, not a missing API.
CHANGE-088 / ADR-029 live verification blocker; no new contract proposed.

- Expected: the matching typed POST under `/api/credits/internal/order-events/`
  receives the wrapped envelope
  in section 6 and Authorization: Bearer <Google push service-account OIDC token>.
  Validate Google signature, expiry, issuer, configured audience, verified email
  and approved service account. This identity is NOT a Firebase user and must
  not be sent to /api/users/role-context. Process the financial event and return
  204 with no body only after durable effects commit; invalid identity stays 401.
- Observed: real local ingress POSTs return 500. Matching Credit errors at
  06:48:12Z, 06:48:26Z, 06:48:43Z and 06:49:01Z show
  FirebaseRoleAuthoritiesConverter -> HttpUserServiceRoleProvider -> User's
  /api/users/role-context -> 401 Invalid authentication token, before the
  Credit event controller can process the refund. User's rejection is correct.
- Source before CHANGE-090: credit-service/security/SecurityConfig.java (under its Java package),
  push chain line 68 supplies a dedicated decoder but no dedicated authentication
  converter. The global JwtAuthenticationConverter bean at lines 137-140 uses
  FirebaseRoleAuthoritiesConverter. Spring Security 7.1.1 automatically selects
  that bean when a chain does not explicitly provide a converter:
  https://github.com/spring-projects/spring-security/blob/7.1.1/config/src/main/java/org/springframework/security/config/annotation/web/configurers/oauth2/server/resource/OAuth2ResourceServerConfigurer.java
- Required provider correction: explicitly isolate push authentication conversion
  from Firebase user-role conversion, retaining the existing Google push decoder
  and all token/identity checks. Preserve Firebase role lookup for ordinary Credit
  user APIs. Do not enable mock roles, strip bearer tokens or permit anonymous push.
- Required regression: signed valid push identity reaches the handler with ZERO
  RoleProvider calls even when User role lookup is unavailable; wrong signature,
  issuer, expiry, audience, email or email_verified fails; user APIs still use
  Firebase roles/ownership guards. Then test live CANCELLED/EXPIRED refunds and
  COMPLETED transfers, plus duplicate delivery, with ledger/balance evidence.
- Initial evidence: logs and source inspection, before a fixed/tested implementation.
  Earlier 27 Credit outcome tests did not verify this live security-chain path.
  Initial Check's unauthenticated 401 and ingress 404/405 are expected negative
  probes; they cannot establish authenticated financial delivery. CANCELLED Order
  state and broker publication are not confirmation of refund completion.
- Initial stopping point: peer source remained unchanged while explicit separate
  Credit-edit authorization was pending clarification. Superseded by approval below.
  Preserve queued/DLQ events for recovery; do not reset databases or republish with
  new event IDs. After a fix, rebuild only Credit, retain the tunnel URL, and verify
  retry/DLQ recovery and exactly-once financial effects before marking VERIFIED.

### Approved narrow repair - CHANGE-090 (2026-10-09)

Vincent explicitly approved the Credit security fix and regression tests for this
one task, with an interference Markdown. Only SecurityConfig's push-chain converter
selection and new PubSubPushSecurityTest change. Existing Google decoder/validators,
Firebase user chain, business logic, schemas, consumers, endpoints and cloud
configuration remain unchanged. Annablee's ownership and all other peer boundaries
are retained. See changes/CHANGE-090-credit-push-security-interference.md.

Observed red: valid locally signed push fails through FirebaseRoleAuthoritiesConverter.
After the explicit independent converter, all 15 new bearer-filter cases and the
full 80-test Credit suite pass (no failures/errors/skips), including a fresh clean
source-only Java 21 run: 95.48% lines / 85.56% branches, existing 80% gates unchanged.
Source/test commit 198cd7c. A local JWKS replaces Google's public-key URL only for tests. Role lookup
and financial collaborators are mocked in the security slice, not live integrations.

Still required: owner review, rebuild the local Credit image, real Google push 204,
CANCELLED/EXPIRED refund and COMPLETED transfer balance/ledger evidence, duplicate
delivery and queued/DLQ recovery. Local tests do not close this live gate or prove
the user's existing cancelled reservation has been refunded. Status is deliberately
not VERIFIED. Background repost credentials/retries remain paused.

## 7. Current Order-to-Credit payload audit (2026-10-09)

Read-only audit requested by Vincent on sprint-2-3-credit. No application, event
schema, peer, database or infrastructure changes are approved by this audit.
Expected contracts: ADR-011 full completion/refund snapshots, ADR-018 minimal
assignment/reset requests, ADR-025 User-only accepted-cancellation penalties.
Evidence: Order HttpPeerAdapters/CreditServicePort and all production call sites;
event DTOs/factory/mapper/publishers; CreditController/request DTOs,
CreditOrderEventController/OrderEventMessage/typed Credit event handlers,
CreditService/JpaCreditRepository; existing test source and local-live/cloud
provisioning configuration. Field-name-only runtime outbox SELECTs confirm the
persisted envelope/snapshot shapes for all three types, without exposing raw
descriptions, user IDs or credentials. This does not prove financial delivery.

### HTTP requests: active shapes match and are already small

All backend paths below start with `/api/credits`. Real foreground requests
forward the current Firebase bearer header; caller identity is not established
by an ID in JSON. Credit owns balances and existing reservation details.

| Operation/caller | Method/path | Exact request body | Provider result / assessment |
| --- | --- | --- | --- |
| Create and both repost paths | PUT `/orders/{orderId}/reservation` | `{"requesterId":"requester-uid","amount":5}` | 201 new/200 replay with ReservationResponse; both fields are used; MATCHES_APPROVED_CONTRACT for payload shape |
| Accept | PUT `/orders/{orderId}/courier-assignment` | `{"courierId":"courier-uid"}` | Exactly 200, no body; Credit checks authenticated self, active reservation and courier account; MATCHES_APPROVED_CONTRACT for payload shape |
| Every assigned courier abort | POST `/orders/{orderId}/hold-for-reopen` | NO body | Exactly 200, no body; Credit gets caller from JWT and stored reservation; retains funds, clears courier; MATCHES_APPROVED_CONTRACT for shape, existing FEEDBACK-003 security/replay gap retained |
| Frontend signup, not an Order backend call | POST `/registration-facts` | `{"eventId":"uuid","userId":"user-uid","occurredAt":"ISO-UTC"}` | 201 new/200 replay, AccountResponse; fields are used for self-check, provisioning and deduplication |
| Frontend balance polling | GET `/me` | NO body | 200 BalanceResponse, authenticated UID selects account; 404 for missing account |

Order ID is already in the path. No need to add description, pickup/delivery,
penalty points, balances, expected Order version or the full Order to these
requests. The adapter currently ignores reservation response content; active-
state replay/reconciliation remains FEEDBACK-006, not a reason to add outbound
fields or claim verified recovery. Assignment/reset enforce bodyless 200.

Dormant code: `CreditServicePort.settle`/HttpPeerAdapters.settle constructs
`POST /orders/{orderId}/settlement` with commandId/requesterId/courierId/amount.
Credit has no corresponding controller route and no Order production call site
invokes this method. Current completion uses its event instead. This is obsolete
adapter surface, NOT an active missing-provider requirement. An old adapter unit
test mocks the missing route; it does not verify that Credit implements it.
Removing that surface is a separate approved cleanup, not performed here.

### Historical v1 audit — superseded by CHANGE-092 compact bodies

Current envelope fields consumed for decoding/validation, ledger attribution or
duplicate-payload hashing: `eventId`, `eventType`, `eventVersion`, `orderId`,
`orderVersion`, `occurredAt`, `actorId`, and `order`. Current consumer explicitly
requires `order.id == orderId` and `order.version == orderVersion`; these repeated
fields are intentional consistency checks, not safe deletion candidates under v1.

Inside `order`, Credit reads exactly:

- `id` and `version`: envelope/snapshot consistency.
- `requesterId` and `offeredCredits`: must match Credit's stored reservation.
- `courierId`: must be null for refund, assigned/matching for completion.
- `status`: refund permits CANCELLED/EXPIRED; transfer requires COMPLETED.

Completion additionally carries `overdue` (required by the consumer) and
`overdueAt`. Credit includes them in its duplicate-payload hash, but settlement
transfers the reserved amount regardless of these facts. User Service owns
penalty policy and also needs completion facts; do not add penalty calculations
or a deduction amount to Order's Credit request on this basis.

The nine additional snapshot fields are NOT accessed by Credit's consumer or
passed to its CreditOutcomeEvent/financial repository:

`itemDescription`, `pickupSupplierId`, `deliverySupplierId`, `createdAt`,
`expiresAt`, `deliveryTimeLimitMinutes`, `originalOrderId`, `repostedOrderId`,
and `repostPlan` (including its nested scheduling/amount/duration/used data).

These fields satisfy the approved broader snapshot contract and Credit's incoming
DTO mirrors them, but they are unnecessary for its current refund/transfer work.
In particular, free-form request descriptions increase data exposure without
helping financial processing. Thus the events MATCH the approved v1 shape and
contain enough data, yet do NOT meet a strict Credit-only minimal-payload goal.
No new missing field was found for the current refund/completion consumer.

If Vincent chooses minimization, coordinate with Credit and User owners first:
decide shared minimal facts versus a separate financial contract, preserve
authentication/identity/version/idempotency, test serialization/deserialization
and both consumers, and agree old-v1 outbox/backlog/DLQ compatibility before
rollout. Do not mutate queued payloads or generate new event IDs for old refunds.
No new schema/version/topic or provider implementation is selected by this audit.

### Routing and return behavior

| Result | Published event / configured topic family | Intended consumer / required meaning |
| --- | --- | --- |
| Requester OPEN cancellation or unassigned OPEN expiry; expired abort after reset | OpenOrderRefundTaskEvent / `open-order-refund-*` | Credit releases the OLD order reservation exactly once; current snapshot CANCELLED/EXPIRED, courier null |
| Requester or >=48-hour scheduled completion | OrderCompletionTaskEvent / `order-completion-*` | Credit transfers reserved funds to the recorded courier; User separately processes completion facts |
| Every assigned courier abort | AcceptedOrderCancellationTaskEvent / `accepted-order-cancellation-*` | User penalties ONLY; current OPEN/EXPIRED, actorId is aborting courier; not a Credit refund command |

Google Pub/Sub supplies the authenticated wrapped push to the event's typed path
under `POST /api/credits/internal/order-events/`: message.data is Base64 event JSON,
plus subscription and optional messageId. Credit returns bodyless 204 after
processing, including an idempotent replay. Order's publisher instead receives a
Pub/Sub message ID; that is publication confirmation, not Credit completion.
Event data/attributes contain no Firebase token, password, roles or account
balances; HTTP/transport authentication remains separate from business payload.

Local-live helper correctly creates only Credit refund/completion subscriptions
and sets the accepted-cancellation subscription name to an unused placeholder.
Credit's older accepted-cancellation consumer/cloud provisioning still expects
ABORTED and refunds, so FEEDBACK-007 remains INCOMPLETE_OR_INCOMPATIBLE. Keep User
penalty routing separate; never adapt OPEN penalty events into Credit refunds.
Actual cloud subscription inventory and ledger effects were not verified here.

Verification limits: runtime field-name/publication-state SELECTs and static
producer/consumer/DTO/test-source comparisons performed; no tests rerun, financial
mutation, cloud write, message replay or source edit. Publication states observed
included a pending refund; PUBLISHED is not proof of a refund/transfer. Existing
003/005/006/007 entries and paused background-auth/retry scope remain unchanged.


### FEEDBACK-009 — Compact refund/completion consumers

- Status: OPEN; classification INCOMPLETE_OR_INCOMPATIBLE; approved Order-only schema milestone, not integration verification.
- Evidence: Credit OrderEventMessage and JsonOrderEventPayloadDecoder still require nested order and envelope/order matching versions; CreditOrderCompletionEventHandler requires completion overdue. These will reject the new bodies. User completion consumer/overdue source remains unverified. Do not mark these flows done.
- Credit action: consume OpenOrderRefundTaskEvent and OrderCompletionTaskEvent using the schema below; lookup its existing transaction/requester by orderId, refund CANCELLED/EXPIRED, transfer COMPLETED to the supplied courierId, verify amount/assignment against Credit-owned state and deduplicate eventId. Do not recreate already implemented reservation/assignment/reset endpoints.
- User action: completion still requires the existing overdue penalty / on-time score deduction policy, but this message supplies no overdue/deadline data. Agree and verify an authoritative separate source before implementing that policy; occurredAt alone cannot determine overdue. Accepted cancellation keeps its existing payload/penalty behavior.
- Order behavior: writes intent atomically; publishes after commit with Pub/Sub attributes eventId/eventType/eventVersion (2 for these bodies). Topics retain existing dev-v1/prod-v1 names; their suffix does not imply the new body is v1. Coordinate consumer rollout before using current topics for live financial tests. No peer code or cloud changes made.
- Request: implement/verify compact parsing, null courier refund, terminal statuses, duplicate/replay/amount/courier checks and failures. Next verification re-read peer schemas/tests, then real refund/completion and duplicate-delivery integration.

Compact body (both event types, exactly seven keys):

```json
{
  "eventId": "stable-event-uuid",
  "eventType": "OpenOrderRefundTaskEvent",
  "orderId": "public-order-id",
  "orderStatus": "EXPIRED",
  "creditAmount": 10,
  "occurredAt": "2026-10-09T12:00:00Z",
  "courierId": null
}
```

Completion uses eventType OrderCompletionTaskEvent, orderStatus COMPLETED and its assigned courierId. Refund uses CANCELLED or EXPIRED; courierId is the saved resulting Order value, including null. creditAmount is the integer offeredCredits. No requester, snapshot, actor, history, versions or overdue fields appear in either body. AcceptedOrderCancellationTaskEvent contract is unchanged.

## FEEDBACK-010: Credit historical command recovery protocol (2026-10-10)

### Effective provider integration update — 2026-10-11 (ADR-035 / CHANGE-104)

- Current classification: MATCHES_APPROVED_CONTRACT for the implemented five
  synchronous operations. Credit 497a8f9 supplies paired headers, immutable
  replay, owner-scoped result lookup, generations and conditional compensation.
  Order now has an actual HTTP gateway; the former mock-only gate is superseded.
- Executed provider evidence: eight isolated actual Credit/PostgreSQL recovery
  tests pass (lost response, local rollback, provider restart, acceptance reversal,
  abort history/reset without clearing a later assignment, same-key concurrent
  claim, replay and insufficient credits). Financial Credit is not mocked; User
  and Supplier validation fixtures are isolated-test scope, not live verification.
- Final evidence: ninth real socket-timeout-after-Credit-commit case also passes;
  externally isolated final full verify has 335 passes, no failures/errors/skips,
  95.53% lines / 80.73% branches. Early runs could publish synthetic dev-topic
  events; final tests mock only external dispatch, never Credit financial calls.
  No live delivery/effect claim from those early publications (CHANGE-104).
- Runtime rollout remains READY_FOR_VERIFICATION for the authenticated full
  local-live stack and cloud/browser gates. No request to recreate existing APIs;
  preserve the original proposal below as history. Broader provider security and
  cross-replica/chaos tests are not claimed solely by these eight scenarios.
- HTTP recovery without fresh user authorization remains pending for Continue.
  No saved tokens/delegated credentials or background repost recovery introduced.
  Existing event/User penalty findings remain separate; no Credit source changed.

- Owner: Annablee / Credit Service; requester: Vincent, branch
  `sprint-2-3-credit-service-concurrency`.
- Classification: **INCOMPLETE_OR_INCOMPATIBLE**. Existing reservation,
  courier-assignment and hold-for-reopen routes exist. Historical per-command
  replay/result retrieval, generation fencing and conditional reversal do not.
  This extends 003/006; it does not mark those entries verified or request that
  existing business routes be implemented again.
- Approval: ADR-033 / CHANGE-100 authorizes Order/frontend contract-stub tests
  only. **Live HTTP recovery remains disabled** until provider agreement and
  executed contract/integration tests. No Credit implementation was changed.
- Exact request bodies stay `{"requesterId":"uid","amount":5}`,
  `{"courierId":"uid"}`, and no body for reset. Proposed key/generation
  headers, authorized historical GET result, conditional POST compensation,
  expected result JSON/statuses and provider transactional algorithm are fully
  specified in [concurrency-order-credit.md](../concurrency/concurrency-order-credit.md).
- Required behavior: bind one key to immutable actor/operation/order/input;
  commit the financial effect and terminal record together; replay historical
  results without touching a newer assignment; fence stale workers and reversal;
  retain uncertainty after an earlier timeout followed by 401/403; allow owned
  past-result reads without requiring eligibility for a new courier task.
- Order stopping point: new coordinator/store/V5/UI run against the explicit
  process-local Credit stub only. Existing HTTP adapter is untouched. A live
  adapter and activation await approved response/header compatibility, real
  provider crash/restart tests and safe compensation tests.
- Unchanged: Credit/User/Supplier/Admin source, financial databases, event
  topics/payloads and existing 002/005/007/009 findings. No token storage or
  delegated credentials are introduced; repost background recovery is not resumed.
- Next verification: Annablee implements/agrees this protocol; re-inspect actual
  handlers, DTOs, migrations and tests; run same-key/different-key, lost response,
  provider/Order commit failures, stale reset/compensation and authorization
  contract tests. Only then assess READY_FOR_VERIFICATION / VERIFIED and remove
  Order's HTTP hard gate through a separately approved integration change.

## FEEDBACK-012: Post-revert main merge has incomplete profile frontend dependencies

### Effective follow-up - CHANGE-109, 2026-10-11

Status:READY_FOR_VERIFICATION. Vincent authorizes narrow frontend repair. Source/
testd7f72a8 replaces missing auth-profile context with account-keyed local loading
through existing useApi GET/me; username-only PUT and Firebase-verified email-only
PUT after token refresh. Save failure retains retry, stale account continuation
is blocked; password reauthentication and deletion-UI removal retained. No User
backend/AuthProvider/Order recovery/contract/config change.116 frontend tests,
typecheck/build pass; lint0errors/3 existing login warnings. Automated frontend
tests mock actual inspected shapes, not real peer execution. Isolated own-profile
username/email/password + desktop/mobile/browser/email-delivery smoke still needed.
The dated OPEN findings below are preserved history, not current compile status.

- Date/revision:2026-10-11, c2fe90c compared with first parent5bf1a15 and main
  second parentcd41186. Status:OPEN. Classification:INCOMPLETE_OR_INCOMPATIBLE
  for the merged profile client/shared-auth integration. Owner:shared frontend /
  User-feature owner. This is not a new backend endpoint request.
- Expected: profile/edit consumes a provider with profile, profileLoading and
  refreshProfile; User/Firebase profile data must stay aligned after email changes.
  Actual: current AuthContextValue supplies only user/loading/signIn/signUp/signOut/
  getIdToken. The newly added page references the three absent members on line20.
  They exist on main but earlier auth-provider changes remained reverted.
- Actual merge adds only frontend/src/app/profile/edit/page.tsx and two audit
  records. User/Credit/Supplier/Admin/Order backend, Compose and gateway trees are
  byte-identical to this merge's first parent. Existing authenticated role-context /
  courier-eligibility wire contracts and own username PUT/me body {username}
  are unchanged; no new actual-provider execution claim.
- Fresh npm run typecheck exits1 with three TS2339 errors. Existing103 frontend
  regressions in26 files pass without any edit-route test. Fresh29 configuration
  assertions pass. Shared frontend release is blocked despite unaffected backend
  diffs. Current ProfilePage also lacks the main version's edit navigation.
- Secondary source gap: new route changes email using Firebase and then refreshes
  profile, but current User GET/me only reads Mongo's saved email. Refresh alone
  cannot persist the new Firebase email. No live account mutation was performed.
- Required action: coordinate a narrow compatible profile/auth integration and
  authoritative email-sync policy, or explicitly defer/remove the unsupported
  route. Do not blindly restore the entire old merge: FEEDBACK-011 findings are
  historical owner-review context, not current newly introduced backend findings.
  Review-only request does not authorize a fix or reintegration.
- Next verification: add actual edit-route tests, ensure no token/UID/role or
  Order-command recovery weakening, typecheck/build pass, then isolated real-user
  username/email/password smoke checks. No peer/application/config/schema edits
  or new security/API design implemented; stopping point recorded in Vincent work.


## FEEDBACK-015 — Delivered-item Report Service and hold-release orchestration

**Status: MISSING.** Report Service is not in this checkout. Local Order demo is not a provider implementation. User approved local prototype and live Coming soon. D1 NTH report/penalty investigation scope is refined by CHANGE-141/ADR-048.

Expected authenticated interfaces (Report team owns final implementation):

| Operation | Proposed contract | Authorization/behavior |
| --- | --- | --- |
| Submit | POST /api/reports {orderId, violationCategory, explanation, attachmentIds:[]} | Verified requester, own DELIVERED order only; resolve participants from Order, never trust courier/requester IDs from caller. One active case per order for this first slice. |
| Personal lists | GET /api/reports/mine?mode=submitted or against&page=1&size=20 | Verified UID; SQL participant/status filtering before pagination. |
| Detail | GET /api/reports/{reportId} | Participant or verified admin only; current Order reference, private evidence access. |
| Response | PUT /api/reports/{reportId}/courier-response {explanation,attachmentIds:[]} | Assigned reported courier once before response deadline; server compares clock. |
| Admin list | GET /api/reports/admin?status=READY_FOR_REVIEW&page=1&size=20 | Verified admin; status/creation pagination. |
| Resolve | PUT /api/reports/admin/{reportId}/resolve {resolutionNote} | Verified admin; READY_FOR_REVIEW -> RESOLVED; save actor/time/reason and durable Order release intent. |

Response schema: id, orderId, requesterId, courierId, status, violationCategory, requesterExplanation, requesterAttachments[], courierExplanation(nullable), courierAttachments[], createdAt, courierResponseDeadline, courierResponseSubmittedAt(nullable), resolvedAt/by/note(nullable). Attachments require private access-controlled IDs/name/contentType/download URLs; never public permanent evidence URLs. Proposed category enum names: ITEM_MISHANDLING_OR_DAMAGE and WRONG_LOCATION_DELIVERY. Other categories deferred. Explanation1..2000; demo limits3 files2MiB PNG/JPEG/WebP/PDF are prototype limits to confirm for production.

Statuses only AWAITING_COURIER_RESPONSE, READY_FOR_REVIEW, RESOLVED. Deadline=createdAt+8h. On response or deadline, Report backend transitions ready; late response returns409. Admin may review no-response cases. Missing records404, wrong role/participant403, invalid body400, conflicting/resolved requests409; exact successful retries stable. Report team supplies durable deadline processing and request-idempotency rather than relying on UI polling.

Order endpoints now supplied: existing PUT /api/orders/internal/{orderId}/completion-holds/{reportId} with requester Firebase authorization and requesterId body; new PUT /api/orders/admin/{orderId}/completion-holds/{reportId}/release with resolving admin Firebase authorization and no body. Release returns OrderResponse and is idempotent; it releases that report only, including after explicit admin terminal resolution, retaining other holds. No internal trusted-service authentication bypass.

Creation must coordinate durable Report intent and Order hold before acknowledging acceptance; handle failure/retry without orphaning an active report or silently completing the Order. Resolution must durably save/observe pending release, retry transient409/5xx/timeouts with authorized continuation, and expose recovery failures. A Report marked RESOLVED is not evidence that Order release succeeded. Finance actions remain separately confirmed Order admin cancel/complete; resolving alone never cancels, completes or changes penalty. Admin late-penalty waiver is POST /api/orders/admin/{orderId}/overdue-waiver {reason}, DELIVERED only before first completion; factual isOverdue remains true. No score event on waiver itself.

Next verification: inspect Report provider DTO/controller/security/storage/upload/deadline/recovery tests; verify both services and multi-hold races, real tokens and failed-release recovery before replacing Coming soon. No sibling backend changed.


## FEEDBACK-016 — Withdrawn penalty replacement proposal

**Status: WITHDRAWN (CHANGE-146/ADR-050, 2026-10-19).** No User Service penalty-replacement endpoint or adjustment consumer is required. Apply Penalty stores a monotonic policy in Order Service; final scoring uses the existing addition/deduction events. The old contract is retained only in superseded ADR-049, not as peer work. Existing role lookup still applies.

### FEEDBACK-015 amendment — CHANGE-144

The response deadline and automatic readiness timer are removed. There is no courierResponseDeadline field. Courier may respond once while unresolved; response sets READY_FOR_REVIEW. Admin may resolve any unresolved report with a required reply saved in resolutionNote; RESOLVED is the sole final status. Lists must support Open (all non-resolved) and Closed (RESOLVED) grouping before pagination and return accurate totals. Resolution retains durable report-specific Order hold release; financial and penalty actions remain on the Order page. The older eight-hour and READY-only requirements above are superseded.


FEEDBACK-016 WITHDRAWN under CHANGE-146/ADR-050 (2026-10-19): no synchronous User penalty-replacement endpoint/consumer is needed by the current Order design. Earlier proposed contract is historical only. Admin applies a non-waivable maximum policy locally before final outcome; User receives exactly the existing final addition/deduction event. No new topic or retroactive reward/penalty replacement. Existing initial-event consumer idempotency and other peer gaps remain independently relevant.


## Effective CHANGE-147 — Report reply privacy and active policy choices (2026-10-19)

Approved Yao Xiang: admin resolution reply is visible only to the submitter and reviewing admins; courier participants still see resolved status/time and other existing case information. Local prototype list/detail responses redact resolutionNote on copied snapshots, and UI hides the reply in courier views. Production Report Service is still missing and must enforce this with verified caller identity, never client-supplied roles. Live Reports remain Coming soon.

COURIER_UNRESPONSIVE is retired from active policy lists and new admin apply/cancel choices. Its enum/amount remain only for historical persisted rows and existing outbox events; immutable migrations and saved penalties are not rewritten or waived. Six active policies; three selectable report penalties (wrong location4, damage4, theft10). Cancellation UI selects one radio case and sends the existing one-element list; stored maximum semantics and existing penalty topics remain unchanged.

Report cards omit Order descriptions; closed cards are muted but remain navigable. Requester/courier names link to admin profiles, IDs have separate copy rows. Admin table names, email, roles and IDs truncate visually while full values remain in titles/copy/details. No sibling backend or shared runtime/CI/cloud configuration changes. See CHANGE-147.


## Effective CHANGE-153 — Hold eligibility and paused funding (2026-10-19)

Yao Xiang approved placing a requester-owned completion hold on any Order status except COMPLETED. This supersedes delivered-only placement and the old blanket terminal-state rejection for new holds. Preserve status, ownership/role checks, bound report IDs, locked transaction and release history. A hold placed after cancellation/expiry records a hold only; it does not restore lifecycle state or reverse settled funding.

The user explicitly clarified that ordinary cancellation, expiry and courier abort (and their refunds/penalties) must remain paused, in addition to requester/automatic completion. START, PICKUP and DELIVER continue normally; acceptance keeps its existing behavior. Admin cancellation remains the previously approved explicit override. Auto-completion and expiry retain held-row SQL exclusion. Report mock submission fixtures remain delivered-item samples; this change broadens the real Order hold endpoint, not a production Report Service implementation.

No schema, event/topic, frontend, shared configuration or sibling backend change. This is eligibility validation only. See CHANGE-153 and ADR-052.

## FEEDBACK-017 - Compensation-first Credit command protocol

### Current verification update - CHANGE-158, 2026-10-27

Status: READY_FOR_VERIFICATION for final rollout; local application integration
has actual evidence. Credit8ecb1e8/5ff41c3 supplies consumer/inbox, absent-K
tombstones, revisions/exact CLEAR_COURIER restoration, result outbox/publisher,
push isolation and retained FAILED redrive. Shapes MATCHES_APPROVED_CONTRACT.
Credit full126 tests/coverage pass. Actual Order/Credit/PostgreSQL/emulator
suite11/11 and retained real protocol16/16 pass. Final Order584/common12=596
tests pass with no failures/errors/skips, including the identifier audit.
Order95.01% LINE/82.16% BRANCH, original gates pass. Source a6cceee; local
contract/financial integration verified, cloud rollout remains gated.

Cloud OIDC/IAM/subscription provisioning, direct/unkeyed financial-call boundary
and coordinated activation are unverified. Default transport off/retry preserved.
The original missing-provider description below is historical. Local emulator
evidence is not a whole-feature/cloud VERIFIED claim.

- Date/owner: 2026-10-26; Credit service owner. Requested by Vincent under
  CHANGE-156/ADR-054. Status: OPEN; actual asynchronous interface MISSING.
- Expected: original keyed synchronous mutation; compensation request via Pub/Sub;
  atomic reverse-or-fence, including missing original command; durable committed
  result event back to Order. Safe pre-image/revision restoration for CLEAR_COURIER
  was explicitly selected. No JWTs, supplier details or Order snapshots in events.
- Actual inspected code: CreditController three mutations and HTTP status/compensate;
  CreditCommandStore registered-command reversals/fencing; CreditOrderEventController
  only completion/open-refund pushes; V6 command schema and existing recovery tests.
  Initial APIs MATCHES_APPROVED_CONTRACT. New request/result consumers/publishers
  are MISSING; absent-K fencing and CLEAR_COURIER reversal are
  INCOMPLETE_OR_INCOMPATIBLE. Current clear compensation returns reconciliation;
  command lookup/compensate requires a previously registered command.
- Required additions: compensation inbox/consumer, missing-key binding/tombstone,
  exact assignment pre-images and mutation revisions, conditional clear reversal,
  saved idempotent result plus transactional Credit outbox/publisher, OIDC/IAM,
  environment topics/subscriptions/retry/DLQ and actual contract/integration tests.
- Exact input/output/algorithms/retirement plan:
  [compensation-workflow-handoff.md](../concurrency/compensation-workflow-handoff.md).
  Existing HTTP keys/generations/history/compensate and ordinary Credit consumers
  remain until old clients/commands are drained; do not delete applied migrations.
- Order stopping point: explicitly approved contract-fixture implementation only;
  no live compensation transport/receiver enabled, no peer source changed. A
  publisher ACK alone never completes the command. No original mutation replay
  after uncertainty in the new policy. Existing default live protocol retained.
- Resume condition: peer supplies implemented schemas, tombstone race tests,
  exact-clear-restoration tests, financial/inbox/outbox atomicity and authenticated
  request/result delivery. Set READY_FOR_VERIFICATION first; inspect actual code
  and run both services with isolated PostgreSQL/emulator before VERIFIED or activation.
- Tests affected: new Order workflow/journal/gate/UI fixtures and real PostgreSQL
  concurrency tests; actual Credit failure/duplicate/delayed-execute/ABA/restart
  and Google OIDC tests remain required. No User/Supplier mutation API requested:
  inspected Order calls to them are reads, including Supplier POST validation.

### FEEDBACK-005 resumption inspection - 2026-10-26

Vincent requests credential-free automatic repost, assuming services trust each
other, and permits peer edits if minor. Actual background interfaces are still
MISSING: User roles/eligibility derive UID from JWT, Supplier validation requires
authentication, and Credit reservation requires JWT subject=requester plus role
for keyed commands. Existing internal-ingress deployment permits network-wide
callers, including the gateway; it does not authenticate Order as a distinct caller.
Gateway blocks Credit internal routes but needs matching isolation for any new
User/Supplier routes. Local loopback debug ports also trust local host callers.

Opening a reservation endpoint without a user JWT is a security/financial contract
change, not merely a controller alias. The durable automatic workflow also needs
stable command/candidate identity, saved consent, current requester validation,
one-successor locking and final-commit/compensation handling. The existing automatic
path uses legacy reserve inside its local transaction and is not invoked by the
minute job. ADR-054/FEEDBACK-017 still block live compensation; tokenless routes
alone cannot close either gap. No peer edits made during this review. Detailed
expanded-scope/trust/activation approval is required before TDD; existing feedback
and handoff records will be reused rather than creating per-peer duplicate docs.


## Effective HANDOFF alignment - CHANGE-159 / ADR-056 (2026-10-28)

See [reporting-order-integration.md](reporting-order-integration.md) for the current active-requester list/atomic report hold contracts, approved current-snapshot retry clarification (no new migration), explicit admin No penalty override, ready User/Credit admin links and deferred synchronous resolution design. New public hold placement is PUT /api/orders/mine/active/{orderId}/report-holds/{reportId} with requireAssignedCourier; caller identity comes from the token. SQL list is GET /api/orders/mine/active. Holds still pause ordinary funding/penalty outcomes and allow START/PICKUP/DELIVER. Existing admin cancellation overrides held funding.

Admin null/empty cancellation selections now suppress scoring even when provisional appliedPenalty was stored; selected additions compete with the stored maximum. Prior claims that No penalty cannot waive stored scoring are superseded for ADMIN CANCELLATION only. The provisional audit remains; requester/auto completion and Apply Penalty policy are unchanged.

Credit selected-user balance and User admin profile/promotion/deactivation are source-ready and linked with independent balance error handling. User paginated directory remains missing. Reporting source and non-callback resolve/result/conditional-restore contracts are missing; coordinator/live report resolution is explicitly deferred, not mocked as completed. No sibling backend, shared config, topic, migration or GCP edit.


### FEEDBACK-018 - Reporting resolution coordinator dependencies (CHANGE-159)

Reporting Service is absent from this checkout. Existing handoff PATCH status calls Order release first; do not call it back from Order. Need owner-agreed resolve-without-callback, stable-key result lookup and conditional fenced restore with saved preimage/revision; initial call synchronous, crash/timeout recovery durable. User explicitly deferred integration until that contract exists. See reporting-order-integration.md for sequence, commit boundary and creation-intent/orphan-hold risk. New active list/hold contracts are implemented on Order side; Report must accept current-snapshot retries rather than frozen placement facts. No sibling code changed.

## ADMIN-API-001 closure — CHANGE-161,2026-10-29

## User Service — admin name search (ADMIN-API-001)

- **Needed:** an admin-authorized, database-filtered, paginated User search. Current GET /api/users returns an unpaged array and is unsuitable.
- **Proposed contract, for owner agreement:** GET /api/users?searchBy=name&q=Alex&page=1&size=20. Firebase Bearer token; provider verifies admin. Case-insensitive partial username search; empty query lists all; deterministic username/userId ordering; filter/count before paging. Page starts at1; size1..100.
- **200:** {items:[User],page,size,totalItems,totalPages}. Each User keeps the existing profile fields: id, userId, username, email, roles, penalty, isCourierSuspended, suspensionEndDate and status (ACTIVE/DEACTIVATION_PENDING/DEACTIVATED); nullable phone/address only if available. Do not invent Credit balances.
- **Errors:**400 invalid query,401 unauthenticated,403 non-admin,503 unavailable dependency; standard error envelope.
- **Order UI until ready:** ID is the only search category. Existing admin GET /api/users/{userId} supplies exact search/profile; it is already linked and is not a pending API. No fetch-all/filter workaround. Tell Order when name search and its authorization/paging tests are ready.


User authorizes implementing the missing directory directly. GET /api/users/admin/search now supplies bounded initial list/name/ID search with existing active-admin authorization and safe display DTO. Legacy unpaged GET remains unchanged; proposal to change its return type is superseded. Full User36 tests, including Mongo query and security/OpenAPI tests, pass. Frontend links this real route in every mode. See ../../user-service/user-servicehandoff.md. Deployed authenticated integration remains unverified.

## Retained future background authorization note — outside CHANGE-161 Admin endpoint scope

## Future background repost authorization (FEEDBACK-005 — paused)

Renewable delegated authorization is still missing for unattended Order calls. Current User role/eligibility and Credit reservation derive the requester from a Firebase user token; that token is not a durable background credential. Pub/Sub push OIDC does not authorize outbound on-behalf-of actions.

User/Supplier/Credit/platform owners must agree trusted service identity, issuer/audience, delegated requester/consent/revocation, restricted operations, stable command IDs and audit/error/retry semantics. Exact new routes remain unapproved. See [archived proposal](peer-service-api-feedback-history.md#5-feedback-005-trusted-background-authorization--documentation-only). Foreground APIs remain unchanged; this is not required for the current Admin UI rollout.



## Report resolution requests completed in CHANGE-166 (2026-10-29)

## Report Service — resolution integration (FEEDBACK-018)

CHANGE-163 approved clarification2026-10-29: response deadline is required; preserve responseDeadlineAt and server-owned READY_FOR_REVIEW transition on timely response or deadline expiry. Admin may also resolve a still-awaiting report after a UI warning/confirmation. Persist required reply/resolutionNote, resolvedBy and resolvedAt; return reply only to submitter/admin. The provided Report model lacks these reply/audit fields and its resolved() guard currently blocks early resolution. Report owner must implement these changes plus the saga journal/conditional restore/fence/result protocol below. Category changes are not approved. Exact requirements and acceptance cases: [Report handoff](report-servicehandoff.md#approved-report-behavior--change-163-2026-10-29). This is pending provider/UI work, not a verified integration.

Report Service is absent. Order now has the user-approved guarded contract stub, default disabled. Actual peer integration remains pending; Admin Reports is local sample data/cloud Coming soon.

Required Report implementation (proposed contract, full examples in [handoff](report-servicehandoff.md)):

| Operation | Required input | Required result/guarantee |
|---|---|---|
| PUT /api/reports/internal/order-resolutions/{commandId} without Order callback | command/report/order/requester/courier/admin IDs, generation1, reply; verified admin token | Durable bound APPLIED/NO_EFFECT response; exact replay. Save prior state/reply and resulting revision atomically inside Report. |
| Pub/Sub compensation consumer | Eight fields: eventId, commandId, reportId, orderId, requesterId, courierId, adminId, generation2 | Deduplicate and fence delayed generation1; conditionally restore only this operation, preserving newer work. |
| Committed result producer | Same bound IDs plus compensationId, result eventId, outcome/code | Report outbox publishes COMPENSATED (REVERSED/FENCED_NO_EFFECT) or RECONCILIATION_REQUIRED; repeated requests republish the saved result. Dedicated OIDC push. |

This replaces the prior proposed HTTP restore/result-query requirement. Specify400/401/403/404/409/503 and conflicting-key behavior with the owner. Do not call a Report route that calls back into Order release. Keep the hold until local release commits; never compensate committed success due to a lost response. Request/result topics: report-resolution-compensation-{local|dev|prod}-v1 and report-resolution-compensation-result-{local|dev|prod}-v1. No GCP resources were created; agreed retention/reconciliation and real authenticated tests are activation gates.

Report creation must persist stable report/intent identity before remote hold placement and recover uncertain calls, preventing orphan holds. Confirm acceptance of Order's approved retry behavior: repeated placement reuses the hold but returns the **current** Order snapshot; delivery may have progressed. No snapshot migration is planned. Admin replies must be visible only to the submitter and authorized admins.
