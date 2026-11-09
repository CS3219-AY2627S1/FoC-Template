<!-- Current directory rule: CHANGE-161/ADR-058 supersedes CHANGE-160 ID-only/blank results. The real admin search API supplies initial User pages, ID and Name. Reports alone remains local sample/cloud Coming soon. -->

<!-- Current Admin boundary: CHANGE-160/ADR-057 supersedes earlier generic mock/readiness descriptions. Non-Report Admin APIs are real everywhere; Reports remains local-only mock and cloud Coming soon. -->

## Effective deferred-penalty amendment — CHANGE-146 / ADR-050 (2026-10-19)

## Effective retirement of accepted-cancellation publishing - CHANGE-155 / ADR-053 (2026-10-19)

User approved removing AcceptedOrderCancellationTaskEvent publishing AND legacy replay after inspecting staging: eight legacy rows were PUBLISHED, with no pending/failed rows shown. Preserve published history; this task does not modify any database or GCP resource. Production was not inspected: before rollout, verify no PENDING, IN_PROGRESS or FAILED legacy rows in each target database. Resolve any such rows explicitly before deployment; do not convert them into new score events or mark them PUBLISHED without broker confirmation.

Removed the legacy DTO, publisher/interface, factory/mapper methods, now-unused snapshot DTOs and dispatcher branch. The four current channels remain OpenOrderRefundTaskEvent, OrderCompletionTaskEvent, PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent. Courier abort still uses synchronous Credit hold/reopen and the existing final addition (plus refund when expired); no lifecycle, hold, penalty policy, idempotency or financial rules change. Historical database rows and immutable migrations remain intact. Other older refund/expiration normalization remains supported.

The retired topic setting is removed from Order config, deployment templates, local Compose/bootstrap, environment examples/staging/production settings, topic provisioning and CI topic checks. These scripts no longer require or create the old topic; they do not delete existing cloud topics or subscriptions. User Service consumes only the new scoring channels. Existing admin-provider authorization requests remain open. AsyncAPI1.3.0 describes four outgoing operations; earlier statements requiring accepted-cancellation replay/configuration are superseded by this amendment.

An unexpected non-published legacy row after deployment is unsupported and follows the existing bounded failure/recovery path, never automatic financial conversion. This is why the pre-deployment backlog check is required. Live User penalty processing, production backlog and cloud deletion are not verified here.


Approved Yao Xiang: remove penalty adjustment/replacement and the admin mark-completed API/UI. No synchronous User replacement call, setting, replacement topic, waiver or retroactive score modification exists in the current flow. User Service consumes only the existing final addition/deduction events. Requester and the auto-completion scheduler remain the completion actors.

Admin Apply penalty stores the highest report-case policy on the current assigned active Order, including held Orders. It cannot decrease/clear a stored penalty and emits no event or Credit/User penalty call. New POST /api/orders/admin/{orderId}/apply-penalty accepts {commandId, courierId, expectedVersion, policy, reason}; verified admin identity comes from the principal. NOWAIT locked transaction, pending-command guard and bound command receipt protect stale/concurrent/repeated calls. OrderResponse exposes appliedPenalty, derived appliedPenaltyAmount and actor/reason/time audit. Only report cases from getCourierPenaltyCases() are selectable. Terminal/unassigned/stale/wrong-courier requests409; invalid400; unauthorized401/403; missing404.

Requester/automatic completion chooses the highest stored report penalty or factual delivery overdue (1). If neither applies, it emits SUCCESSFUL_DELIVERY deduction (1); it never emits a reward plus a penalty. Previously persisted legacy waivers suppress only their overdue candidate; they cannot erase a stored report penalty, and no new waiver is allowed. Courier abort chooses max(stored policy, accepted cancellation2); archive retains stored policy/audit and reopening clears the current fields before another courier assignment. Admin cancellation chooses max(stored policy, explicitly selected policies) and never compares overdue; no stored/selected penalty means refund only. Existing initial outbox events and final per-attempt outcome recording remain atomic with the transition. Event wire schemas/topics are unchanged.

V14 adds Order and abort-archive policy/audit columns; V1-V13 and historical adjustment data remain untouched. Retired replacement records are historical only, with no runtime coordinator/gateway. No sibling backend, shared env/topic/CI/cloud changes. Report UI Open/Closed cards, required replies, no deadline and live Coming soon remain unchanged. Live Apply penalty uses the real Order API; local mode uses the isolated mock. Details and acceptance evidence: CHANGE-146/ADR-050.

## Effective penalty replacement and Report queue amendment — CHANGE-144 / ADR-049 (2026-10-18)

Approved Yao Xiang on order-service/penalty-integration: one current outcome per courier attempt, including No penalty or successful-delivery reward. Delivery stores factual overdue; completion/auto-completion read the stored flag. Initial outcomes are recorded atomically with completion/courier abort/admin resolution and existing event intents; original initial penalty/Credit topics and schemas are unchanged. A new acceptance has a new attempt identity, and an abort archive keeps the preceding identity.

Admin replacement is synchronous, not a new Pub/Sub topic. Order commits a stable-ID PENDING adjustment, calls User Service using fresh verified admin authorization, then confirms the current outcome in a second atomic transaction only after a matching reply. Another adjustment to that attempt is blocked while pending; exact same-ID authorized retry recovers timeouts/crashes. No bearer token is stored. User replacement endpoint is MISSING (FEEDBACK-016), so order.penalty-adjustment.enabled defaults false and live UI clearly disables writes. Local mock is isolated. Initial outbox publication never proves score application. New V13 tables preserve request audit/revision and current outcome; historical outcomes are not fabricated. Existing V1-V12 stay immutable.

Old overdue-waiver HTTP/UI is removed; V12 historical audit fields and previously saved decisions remain readable. Reports use Open/Closed cards with counts/pagination and visible five-second polling. No response deadline or deadline timer: courier may respond once while unresolved, and admin may resolve any open report with a required reply saved in resolutionNote. Case detail retains Order-first layout and links to separate Order financial actions. Report Service remains MISSING; HTTP-peer/staging/production Reports remain Coming soon. No sibling backend, shared environment/topic, CI or cloud configuration changes.



## Effective delivered-report review amendment — CHANGE-141 / ADR-048 (2026-10-18)

Approved Yao Xiang: new requester reports require own DELIVERED order; one damage/wrong-location category. Reports have AWAITING_COURIER_RESPONSE, READY_FOR_REVIEW and one RESOLVED final status. Courier response window is eight hours; server owns deadlines. Report Service is MISSING: the Report UI is a local-only isolated demo; HTTP-peer/staging/production show Coming soon and never fetch sample reports. Existing real Order financial actions remain separate from resolving a report.

Order stores deliveryOverdue at actual delivery, comparing deliveredAt against stored START plus duration deadline. isOverdue remains null before delivery or if historical timing is unknown; no runtime status refresh or new overdue scheduler. Admin waiver only before completion on DELIVERED late orders preserves the true lateness and saves actor/time/reason. Normal waived-late completion funds the courier but emits neither overdue addition nor successful-delivery reward. Explicit admin-selected penalties remain separate.

AdminOrderController adds PUT /api/orders/admin/{orderId}/completion-holds/{reportId}/release (no body) and POST /api/orders/admin/{orderId}/overdue-waiver ({reason}). Both verify admin role, use the verified principal, NOWAIT locked Order and the pending-command guard; all local writes are transactional. Release retains its report binding/audit and any other active holds. It may follow admin cancellation/completion and emits no funding event. Report Service must durably retry its release intent using forwarded admin Firebase authorization; no browser-only live orchestration exists. See FEEDBACK-015. V12 backfills only known delivery facts and adds waiver/release audit fields and an active-hold index; V1–V11 remain immutable.

Frontend uses existing theme/components, compact toolbar, darker selected rows and no redundant selection count. Normal/admin Reports poll every five seconds while visible; sample ownership, deadline and evidence checks are server-side in the gated prototype, which has no production identity authority or financial effects.

# Service Contracts

## Current gated compensation transport - ADR-055 / CHANGE-158

Credit implements the ADR-054 v1 request/result shapes. Initial mutations retain
Firebase user JWT/key/generation. Order publishes CreditCompensationRequested
from its durable outbox. Credit atomically reverses/fences, saves its inbox and
result outbox, then publishes CreditCompensationResult. Order's opt-in receiver
is POST /api/orders/internal/credit-compensations with a wrapped Pub/Sub envelope.
Separate Google OIDC verification checks issuer/signature/timestamps, audience
and verified configured service-account email, without Firebase role conversion.
Exact subscription/type/version and saved command/compensation/order/operation/
generation must match. 204 follows committed inbox/finalization only; invalid400,
unauthenticated401, conflicting409, persistence503/5xx for redelivery.
Order validates Credit-compatible opaque IDs before registration: no slash,
dot-only or reserved double-underscore IDs; simple keys/UUIDs remain accepted.

ORDER_COMPENSATION_ENABLED defaults false; explicit topic/subscription required.
Unsigned push requires local demo Auth and Pub/Sub emulators. Default recovery
remains retry; each saved command retains its policy across configuration changes.
No stored JWT, auto repost or cloud activation. Runtime evidence: CHANGE-158.

## Historical compensation-first fixture contract - ADR-054 / CHANGE-156

Existing live credit-command-v1 remains the default. Selecting
order.commands.recovery-policy=compensate uses credit-compensation-v1-fixture;
HTTP peers fail closed. Original business bodies/key headers stay minimal.
The exact new compensation request/result JSON, reserved future push paths,
matching/ownership/duplicate semantics and Credit work are specified in
[compensation-workflow-handoff.md](../concurrency/compensation-workflow-handoff.md).
No live endpoint or new deployed topic is asserted by this contract-fixture scope.

Public CommandView stays PENDING/COMPLETED and SUCCESS/REJECTED. COMPENSATING and
RECONCILIATION_REQUIRED are pending reasons; no user authorization is needed to
receive trusted compensation results. COMPLETED+REJECTED is returned only after
confirmed reversal/fence or authoritative no-effect closure. Browser polling
retains its key until that terminal result. Existing commands retain their saved
recovery policy; reusing a key to change policy conflicts.

## Admin table page size — CHANGE-140

CHANGE-140, Yao Xiang2026-10-17: Admin Orders requests20 rows in live/mock mode; local sample User table requests20. Shared frontend ADMIN_TABLE_PAGE_SIZE keeps Order exact-search metadata consistent. Server totals/pagination and scrolling retained; fewer matching records do not get blank filler rows. Supplier cards remain10 and Credit history20. Live User directory still awaits its existing provider; not enabled by this change. No backend/schema/API-shape/auth/config changes.


## Admin creation-date search — CHANGE-139

GET /api/orders additionally accepts optional exact orderId (max128), createdFrom and createdBefore (ISO8601 Instant, e.g. ending Z or with explicit offset). Existing status/page/size parameters and production ADMIN role remain. createdFrom is inclusive and createdBefore exclusive; either/both may be absent. If both exist, createdFrom must precede createdBefore; malformed/inverted ranges return400. SQL predicates combine all supplied criteria before paging and totals, sorted createdAt DESC then id for dated/exact searches. No HTTP/data schema breaking change.

For Singapore-local16–17October2026 inclusive, the UI submits:

```http
GET /api/orders?page=1&size=10&status=ACCEPTED&createdFrom=2026-10-15T16%3A00%3A00.000Z&createdBefore=2026-10-17T16%3A00%3A00.000Z
```

Date controls display DD/MM/YYYY, with calendar icons and accessible start/end names; blank means unrestricted. Browser-local midnight conversion advances by calendar day (not fixed24h), preserving timezone/DST correctness. End date before start is rejected in UI without HTTP and at the service boundary. Live exact-ID search with dates uses the admin list query, so a dated mismatch yields an empty filtered page, not an unfiltered detail. Default exact-ID/no-date adapter compatibility is retained.

The generic Admin sample Order list was removed in CHANGE-160; Admin calendar queries use the real Order endpoints in every mode. UI refresh retains the query, clears selected rows and disables/spins the existing icon while loading; Clear resets date/status/ID. No additional financial action or new peer API.


## Admin resolution dialog contracts — CHANGE-138

Existing POST /api/orders/admin/{orderId}/cancel and /complete additionally accept optional nullable resolutionReason (string, nonblank when supplied, max1000 characters). The new UI requires a preset or custom explanation. Existing clients may omit it. No freely supplied amount or new payment recipient is accepted.

```json
{"requesterId":"stored-requester-id","courierId":"stored-courier-id","appliedPenalties":["COURIER_UNRESPONSIVE","WRONG_LOCATION_DELIVERY"],"resolutionReason":"Report investigation resolved"}
```

OrderResponse adds nullable adminPenaltyDecision, adminPenaltyReason, adminPenaltyAmount, adminResolutionAt and adminResolutionReason. WAIVED means no score event; ADDITION_REQUESTED records intent, not proof User Service applied it. Penalty reason is the selected enum; resolution reason is the human explanation. Both persist with lifecycle/checkpoint/receipt/outbox in the same transaction. Canonical trimmed explanations are part of replay binding; changed reason conflicts409. Absent/null uses the exact old hash shape.

GET /api/orders/admin/penalty-policies uses the same production ADMIN/Firebase role chain (401/403/503 as existing endpoints);200 body is a list of {policy,penaltyAmount}, from shared PenaltySystemPolicy excluding SUCCESSFUL_DELIVERY. For example: [{"policy":"COURIER_UNRESPONSIVE","penaltyAmount":3}]. This illustrates one entry; actual response contains all six additions. Mapping is read-only in AdminOrderController/OrderMapper; no extra DB query or service required.

Historical Admin sample cancellation/completion routes are removed by CHANGE-160. Admin cancellation and Apply Penalty use real Order APIs locally and in cloud; admin completion remains retired. Reports alone retains its local prototype routes; see the effective CHANGE-160 section.


## Admin completion — CHANGE-137 / ADR-046

POST /api/orders/admin/{orderId}/complete (same AdminOrderController as list/cancel).
Production requires the verified Firebase user's ADMIN role. Local bypass uses
local-admin, as for cancellation. IDs in the body are participant assertions:

```json
{
  "requesterId": "stored-requester-user-id",
  "courierId": "stored-assigned-courier-user-id",
  "appliedPenalties": ["OVERDUE_DELIVERY", "COURIER_UNRESPONSIVE"]
}
```

Both IDs required/nonblank/max128; policy list optional/null or empty, max32,
nonnull enum elements. Allows assigned ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED,
including held Orders; rejects OPEN/terminal/no assignment and stored-ID mismatch.
Only the highest positive addition is selected (stable enum-order tie). Above
example adds3 once. SUCCESSFUL_DELIVERY is rejected. No automatic overdue addition
or successful-delivery deduction on this admin action. Empty means no score event.
Returns OrderResponse200 after atomic COMPLETED + checkpoint + bound receipt +
outbox. Credit transfer is asynchronous on existing OrderCompletionTaskEvent.
Optional PenaltyScoreAdditionEvent targets the stored courier, never the admin.
Same canonical input/admin replay emits nothing; changed replay409. Missing404,
invalid400, authentication401, role403/provider503, pending/terminal/participants/
NOWAIT contention409. No version input; latest locked participants/state validated.

Report integration must forward authorized admin Firebase credentials to resolve;
requester report-placement credentials cannot authorize this admin endpoint. Hold
flag/placement history remains on terminal Order; no generic release endpoint.
Actual deliveredAt/deadline are preserved. If completion overrides delivery
confirmation, deliveredAt/isOverdue stay unknown; adminResolutionAt is separate.
No new topic, payload field, database migration or subscriber operation.


CHANGE-136 (Yao Xiang, 2026-10-17): AdminOrderController now owns both GET
/api/orders and POST /api/orders/admin/{orderId}/cancel. The separate cancellation
controller is removed; paths, roles, validation, transaction service and event
contracts are unchanged. OrderResponse imports Schema normally; JsonProperty
retains isCompletionHold/isOverdue and Schema documents nullable timing.


CHANGE-135 / ADR-045 (Yao Xiang, 2026-10-17) supersedes the earlier overdue
reader: persist deliveryDeadlineAt at courier START plus delivery duration and
deliveredAt at delivery. isOverdue is a nullable timestamp comparison, without
checkpoint queries or a flag-refresh scheduler. Actual delivery freezes lateness;
adminResolutionAt freezes undelivered admin cancellations. Unstarted/unknown
legacy/historical timing stays null. Completion uses those same persisted facts.
V10 adds these timing fields and admin decision/reason/amount/resolution time;
WAIVED and ADDITION_REQUESTED record intent, never subscriber APPLIED. Ordinary
holds still block completion and courier abort; explicit admin cancellation may
resolve held Orders. UI score feedback/callbacks remain deferred. Existing event
payloads/topics/authentication and sibling backends are unchanged. See CHANGE-135.


CHANGE-134 / ADR-044 (Yao Xiang2026-10-16): POST /api/orders/admin/{orderId}/cancel
accepts requesterId, nullable courierId and optional appliedPenalties. Admin-only;
all active/held states -> CANCELLED; locked stored participants, maximum one
addition, no successful reward; refund and optional penalty commit in outbox.
Common adds COURIER_UNRESPONSIVE=3. OrderResponse nullable isOverdue is calculated
from persisted START deadline/delivery timing under CHANGE-135. Existing
roles/topics/schedulers unchanged; Report/User integration remains pending.


CHANGE-133: Admin selected-user history reuses Credit GET
/api/credits/users/{userId}/transactions?page=1&size=20. Admin bearer token,
no body; existing TransactionPageResponse, one-based pagination/size<=100.
Credit guards ADMIN;401/403/404/503 propagate to independent card retry.
No caller /me substitution, mock fallback or balance inference. Global API unused.

CHANGE-132 Java-only API refinement: PenaltySystemPolicy replaces the previous
enum name. getSuccessfulDeliveryReward returns SUCCESSFUL_DELIVERY;
getCourierPenaltyCases excludes cancellation/overdue/success; full-policy query
returns all6. Lists immutable/declaration ordered. Order is the first consumer;
HTTP/event JSON/reason strings/IDs are unchanged. No sibling migration or alias.

CHANGE-131: common penalty enum includes three future confirmed-report cases
(wrong location4, mishandling/damage4, deliberate retention/theft10). No current
Order API/event schema/reason-set expansion or automatic publication. Coordinate
future Report producer/consumer contracts and suspension/highest-penalty logic.

Effective CHANGE-130 / ADR-043: penalty enum Java ownership moves to the
foc-common Maven library (`sg.edu.nus.foc.common.penalty.PenaltySystemPolicy`).
No public penalty JSON, reason string/amount, event ID, topic or HTTP change.
No authentication API shared. Other services must explicitly adopt the library;
existing HTTP outcomes/User subscriber remain governed by FEEDBACK-014.

Effective CHANGE-129 / ADR-042:
GET /api/orders/users/{userId}/active-involvement -> {userId,hasActiveOrders}.
GET /api/orders/suppliers/{supplierId}/active-involvement -> {supplierId,hasActiveOrders}.
No body/paging; existing production Firebase/any recognized Order role.
Active = OPEN/ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED, including holds. Match
requester/current courier or pickup/delivery; exclude terminal/history attempts.
Unknown/no matching Order returns false; invalid ID400, caller401/403, role
dependency503. SQL EXISTS snapshot is not deletion permission; peer integration
and admission/obligation coordination pending (FEEDBACK-015).
Effective penalty amendment CHANGE-128 / ADR-041: new accepted cancellation
queues PenaltyScoreAdditionEvent (+2) instead of AcceptedOrderCancellationTaskEvent.
Completion queues its unchanged Credit event plus addition (+1 overdue delivery)
or deduction (1 successful delivery). Both manual/system completion use actual
delivery deadline facts. AsyncAPI/FEEDBACK-014 specify seven fields, positive
amounts, courier recipient, User cutover/deduplication and ordering gap.
Legacy accepted dispatch stays only for stored rows; earlier penalty expectations
below are historical where they differ. Actual User consumer remains missing.

CHANGE-159/160: selected-user balance/history use the existing admin-protected Credit APIs and full User profile/promotion/deactivation use their ready User APIs. The old generic Admin sample profile/history/role/CRUD routes are removed. Only /api/orders/admin-mock/reports remains, gated by ORDER_REPORT_DEMO_ENABLED, local environment and Auth emulator. The local Report prototype is not the production Report Service contract. Historical sample wire descriptions are retained in admin-peer-api-request-history.md.

Effective ADR-038/CHANGE-108: owned CommandView adds nullable displayDetails with
itemDescription, pickupSupplierId, deliverySupplierId, offeredCredits,
deliveryTimeLimitMinutes, expiresAt; existing ACCEPT/ABORT also orderStatus/version.
CREATE/REPOST use frozen input; no candidate Order card. Existing target projection
is command-owner only, not a general Order-read grant. All routes/status/resume,
Credit bodies/headers and event contracts unchanged. See ADR-038 for null/terminal
and storage-loss semantics.

## Effective expiry API retirement — CHANGE-107

Expiry is scheduler-only, called directly after command recovery and before
48-hour completion each minute. There is no HTTP expiry trigger. Existing
locking, pending guards and refund outbox/event contracts are unchanged. All
repost routes, including the optional local internal repost trigger, remain.

Effective ADR-037: POST /api/orders/commands/{originalId}/repost takes the existing
ManualRepostRequest JSON (commandId, actorId, expectedVersion, itemDescription,
offeredCredits, deliveryTimeLimitMinutes, expiresAt). Returns202 PENDING or200
COMPLETED CommandView. Legacy /{originalId}/repost delegates; successful Order JSON,
pending202, rejected ordinary error. Credit sees only new candidate RESERVE,
requesterId/amount and unchanged headers. Original ID remains Order guard/history.

## Effective transport/replay amendment — CHANGE-105 / ADR-036

Local demo-foc-local uses emulator-only three topics and two typed Credit pushes.
Cloud uses injected *-staging-v1 or *-prod-v1 topics and Google OIDC. Event JSON,
attributes and Credit mutation bodies/headers are unchanged. Accepted abort
facts are User-only: no Credit subscription. Actual local financial delivery
evidence is CHANGE-105; cloud IAM/penalty consumers are separate gates.

Legacy POST /api/orders, /{id}/accept and /{id}/cancel-accepted use the durable
coordinator: 200 Order JSON after success, 202 CommandView while unresolved,
ordinary error response on terminal rejection. Never switch keys/input while
pending. All newly saved receipts bind actor/order/immutable input; unbound
historical receipt replay fails closed. GET-by-ID allows requester/current
courier/admin, plus eligible couriers viewing available OPEN; otherwise 404.

ADMIN GET /api/orders/internal/outbox/failed?limit=1..100 returns
{"eventIds":["uuid"]}. ADMIN POST /api/orders/internal/outbox/{eventId}/redrive
has no body; 202 {"eventId":"uuid","state":"PENDING"} after committed reset,
404 absent/409 non-FAILED. It retains event identity/payload. Unauthorized callers
cannot use it. Immediate after-commit publication is asynchronous/bounded; after
10 failed attempts retain FAILED, no normal retries until explicit redrive.

## Effective Credit command contract — CHANGE-104 / ADR-035

The implementation in concurrency/concurrency-order-credit.md replaces the earlier missing-provider/stub-only milestone. Each mutation sends Authorization, Idempotency-Key and positive X-Command-Generation, retaining only requesterId/amount, courierId, or no body. Saved-result GET is owner-authorized; compensation POST has no body. Validate commandId/operation/orderId/outcome/code and mutation response markers. Plain 401/403, timeout, malformed response or unmarked rejection cannot resolve an earlier uncertain effect. Missing results replay only the same immutable key. Provider 497a8f9 is actual code; executed evidence and remaining gates belong to CHANGE-104.

## Current Pub/Sub representation — CHANGE-103 (2026-10-10)

[AsyncAPI](asyncapi/asyncapi.yaml) and its [guide](asyncapi/README.md) document
the three existing outgoing operations, exact compact v2 / abort snapshot v1
bodies, attributes, topic overrides and at-least-once outbox behavior.
No wire contract or receiver implementation is changed. Current Credit source
now accepts compact bodies with matching v2 attributes; older snapshot-consumer
claims below are historical, not current implementation evidence. Live
financial/penalty verification and feedback gates remain open.

## Effective foreground recovery exception — ADR-033 / CHANGE-100

CREATE/ACCEPT/CANCEL_ACCEPTED get a mock-only command API, committed intent,
immutable key/result and claim fencing. Actual Credit bodies are unchanged.
Historical operation-result and compensation are contract-stub assumptions in
`../concurrency/concurrency-order-credit.md`, NOT implemented/verified peer APIs.
HTTP recovery remains hard disabled.

## Effective compact-event amendment — CHANGE-092 / ADR-031 (2026-10-09)

Yao Xiang approved the exact seven-field Order-only payload: eventId, eventType, orderId, orderStatus, creditAmount, occurredAt, courierId. This replaces full snapshots and overdue facts ONLY for OpenOrderRefundTaskEvent and OrderCompletionTaskEvent. AcceptedOrderCancellationTaskEvent retains its existing v1 envelope/snapshot. Internal outbox versions and Pub/Sub eventVersion attribute remain (compact schema v2); topic names and DB schema unchanged. Old pending snapshot rows normalize at dispatch from their saved facts, with stable IDs. Lifecycle/outbox scheduling, locks, synchronous Credit assignment/reset and ADR-025 abort behavior remain. Historical v1 descriptions below are superseded for these two bodies. Credit currently requires the old snapshot and overdue; FEEDBACK-009 is INCOMPLETE_OR_INCOMPATIBLE. User completion penalties need an agreed separate overdue source. User approved implementing Order-only and documenting peer work; live integration remains blocked, Sprint [~].


## Effective validation amendment - CHANGE-091 / ADR-030

New automatic plans require repostDueAt >= original.expiresAt and
repostExpiresAt >= repostDueAt + 30 minutes. Manual submissions require expiresAt
>= submission + 30 minutes. Existing saved explicit-expiry automatic plans retain
their instructions, including shorter windows. Late automatic execution uses the
saved future expiry without demanding another 30 minutes from execution.
Creation/manual local validation failures use the existing details[field,message]
error envelope and identify only actual invalid fields. No peer API/event/schema
change. Latest user approval supersedes only the historical new-plan timing below.


## Credit Order-event push endpoints

Credit uses one authenticated Google Pub/Sub push endpoint per financial stream:
`/api/credits/internal/order-events/open-refund`,
`/api/credits/internal/order-events/accepted-cancellation`, and
`/api/credits/internal/order-events/completion`. Each route invokes its fixed
handler; the wrapped envelope's subscription and declared event type are checked
only as routing guardrails. Successful commits and idempotent replays return 204.

## Local delivery configuration — CHANGE-088 / ADR-029

The original shared endpoint has been replaced by the three typed paths above.
Wrapped Google push retains Google OIDC and subscription checks and returns 204
after processing. Isolated local financial subscriptions/topic names and a
stable custom audience now match Compose and Setup; HTTPS proxy preserves body
and bearer. See [runbook](local-live-testing.md). User penalty topic has no Credit
subscription here; User consumers/delegated authorization still require peers.
Synthetic routing tests do NOT verify actual push identities or ledger processing.

## Current provider evidence — CHANGE-087 (2026-10-09)

On sprint-2-3-credit, Credit's integrated 09e04a0 source implements the existing
PUT courier-assignment (courierId JSON, bodyless 200), POST hold-for-reopen
(no body, bodyless 200), and wrapped authenticated push refund/completion
(204 after durable processing) contracts. This is source evidence, not live
contract verification. No wire/schema change is approved by this review.
Remaining gaps: reset replay authorization (003), terminal replay/recovery (006),
delegated credentials (005), and incompatible ABORTED/refund handling of the
accepted-cancellation topic (007). ADR-025 remains authoritative: accepted
cancellation signals User penalties on OPEN/EXPIRED; only a separate refund event
releases an EXPIRED reservation. See peer feedback for requests/formats/evidence.
Prior dated missing-provider statements below are historical.

## Effective additive Order contract — CHANGE-086

`POST /api/orders` adds nullable `repostExpiresAt` (ISO UTC timestamp), REQUIRED
when automaticRepost=true. Require expiry > repostDueAt >= original expiresAt;
false ignores automatic-plan details. New expiry is never execution+duration.
Quarter-hour selection is a frontend rule, not a change to UTC wire format.
New automatic plans must provide the field; V4 disables legacy plans without it.

OrderResponse adds nullable repostExpiresAt, repostFailureCode,
repostFailureMessage and repostFailureAt to existing reads/commands/list items.
Only a safe latest eligible authorized attempt failure is persisted on the
original EXPIRED/unlinked order after rollback. A newer failure replaces it;
successful linkage clears it. Ownership/state/version/auth failures before an
eligible attempt cannot overwrite another user's message. Raw diagnostics and
tokens are never stored as outcomes. Failure persistence may increment the
original version: clients refetch it before another versioned manual attempt.

Manual repost request shape, all peer routes/topics/event JSON are unchanged.
No same-candidate durable job, retry worker, trusted credential or refund
confirmation gate is implemented. All background retry scope remains paused.
Earlier dated contract statements below remain historical evidence.


CHANGE-085: existing endpoint/DTO/topic shapes unchanged. Reservation 409 is
exposed as INSUFFICIENT_CREDITS ONLY when Credit confirms that semantic code;
other conflicts stay CONFLICT, 400/401/403/404 retain their classes and transport/
server failures become SERVICE_UNAVAILABLE. No raw peer diagnostic is exposed.
Frontend reads Order lists and /api/credits/me every 15 visible/auth-ready seconds
plus focus/mutation refresh. Manual repost failures do not produce a new OPEN
order; the short card message is client-local. Latest user instruction pauses
ALL background retry implementation pending peer agreement. No candidate task,
worker, security bypass, trusted credentials or new peer route implemented.
Current exact missing-provider handoff is peer-service-api-feedback.md.

CHANGE-084 / ADR-027 approves Order-side bounded same-ID retry and polling
principles, not new implemented endpoints/DTOs. Trusted service authorization
is a documentation-only proposal, explicitly deferred pending User/Supplier/
Credit owner agreement (FEEDBACK-005). Existing Firebase-user routes remain
unchanged. FEEDBACK-006 records reservation confirmation/reconciliation needs;
no new broker/refund-confirmation event is approved by this decision.

CHANGE-083 / ADR-026 replaces Order's two timer settings with ORDER_LIFECYCLE_CRON
(every minute) and sets outbox recovery to 15 minutes. Business endpoint/event
shapes remain unchanged in this repair. Explicit repost expiry/retry/status API
changes remain unimplemented; see the target diagram and FEEDBACK-005/006.
Supplier pair validation now requires explicit valid:true; false/missing rejects.

## Effective Sprint 2-3 amendments (CHANGE-082 / ADR-025)

This section supersedes historical abort/reopen descriptions below. Every ACCEPTED-only abort first calls bodyless `POST /api/credits/orders/{orderId}/hold-for-reopen`, requiring 200 after courierId reset and reservation retention. Current Order keeps its business ID and becomes OPEN/EXPIRED after a fresh deadline check; an immutable ABORTED courier attempt is stored separately. EVERY abort emits the accepted-cancellation event for User; only EXPIRED additionally emits the shared refund event for Credit. New refunds are not requested through the User penalty event. Peer feedback documents legacy reconciliation, missing APIs/subscribers, payload/status/authentication/retry requirements.

Courier `/mine` uses database-paginated current assignments plus ONLY that courier's immutable attempts. Existing response adds nullable `attemptId`; it is non-null for read-only ABORTED snapshots, null for current Orders. Both may share business `id`; clients key history by attemptId and never mutate a history snapshot. Requester `/mine` excludes EXPIRED originals only after successful repost linkage, before pagination/counting. Repost reserves a NEW ID, keeps old/new rows, and authenticated manual receipt replay validates requester/original linkage. No event schema/topic rename.

Acceptance still waits synchronously for bodyless 200 from `PUT /api/credits/orders/{orderId}/courier-assignment` with only courierId in JSON. Assignment/reset are Order-side approved stubs, not verified peer providers. No HTTP fallback to mocks. Automatic repost's current lifecycle credential is not a verified peer Firebase identity; FEEDBACK-005 remains open. Full NTH3 report/hold/admin contracts listed later are logical future scope, not implemented by CHANGE-082.

These are logical approved contracts. CHANGE-053/054 approve Order event snapshots and Google Cloud Pub/Sub; CHANGE-067/ADR-016 clarifies that snapshots omit checkpoint history. CHANGE-056 defines one `OrderCompletionTaskEvent` with `overdue` and `overdueAt` facts. CHANGE-063/ADR-013 approves atomic Order/outbox persistence, after-commit dispatch, and cron recovery with at-least-once delivery. CHANGE-064/ADR-014 adds a synchronous Credit hold before an unexpired accepted errand returns to `OPEN`; expired accepted cancellation remains event-driven. CHANGE-065/ADR-015 added Spring-scheduled OPEN expiry; CHANGE-071/ADR-019 supersedes only its separate event type so requester cancellation and scheduled expiry both emit `OpenOrderRefundTaskEvent` on one topic, distinguished by the resulting Order status.

CHANGE-073/ADR-021 configures real Pub/Sub with one GCP project and environment-specific topics. Local topic IDs are `order-completion-dev-v1`, `open-order-refund-dev-v1`, and `accepted-order-cancellation-dev-v1`; production topic IDs are deployment configuration. Grant publisher access at topic scope only. Local Compose uses each developer's ADC; Cloud Run uses its service identity.

CHANGE-068/ADR-017 adds the Order-side courier-assignment contract stub: Credit must confirm the reservation courier synchronously before Order persists acceptance. CHANGE-069/ADR-018 keeps Order versions local and makes assignment/hold requests minimal, while published events retain `orderVersion`. FEEDBACK-003's bodyless hold-by-Order-ID contract is agreed but not implemented by Credit; FEEDBACK-004's assignment contract and route remain open.

## Order Service consumes

### User Service

- `verifyIdentity(accessContext)`: authenticate protected order actions.
- Requester-only completion and `OPEN` cancellation use a User Service-confirmed requester identity that must match `Order.requesterId`.
- Courier-only acceptance, progress, and accepted-order cancellation use a User Service-confirmed courier identity. Acceptance requires no assigned courier; progress and accepted cancellation require a match with `Order.courierId`.
- `getRoleContext(userId)`: return requester/courier/admin role context.
- `getCourierEligibility(userId)`: return whether a courier may accept new errands.
- `getUserSummary(userId)`: minimal display identity for authorized views.
- User consumes `AcceptedOrderCancellationTaskEvent` for EVERY courier abort (current snapshot OPEN/EXPIRED): apply the configured penalty to actorId, not cleared courierId. User does not subscribe to requester OPEN-cancellation refunds.
- User consumes `OrderCompletionTaskEvent` for every completion: use `overdue` and `overdueAt` to apply the configured penalty when late or decrease the score when on time. Penalty/score policy remains User-owned.
- These are event subscriptions, not blocking Order-to-User requests. Payloads carry `eventId`, `eventVersion`, top-level `orderId`/`orderVersion`, the current Order/repost snapshot without checkpoint history, `actorId`, and `occurredAt`; consumers deduplicate at-least-once delivery. Completion carries overdue facts derived internally from checkpoints.

### Supplier Service

- `validateSupplierPair(pickupId, deliveryId)`: both IDs exist, both are active for creation, and they are distinct.
- `resolveSupplierDetails(supplierIds)`: current names, categories, and campus locations, including inactive suppliers for historical orders.

### Credit Service

- `reserveCredits(orderId, requesterId, amount)`: reserve before an original or repost becomes `OPEN`.
- `assignCourier(orderId, courierId)`: proposed synchronous operation during courier acceptance. `orderId` is in the path and `courierId` is the only request-body field. Order waits for `200 OK` before persisting `ACCEPTED`; Credit validates transaction details from its own record. See FEEDBACK-004.
- `holdForReopen(orderId)`: synchronously clear courierId while retaining funds on EVERY abort, including expired outcomes; no request body. Order waits for `200 OK` before saving OPEN/EXPIRED/history/events; failure leaves ACCEPTED. See FEEDBACK-003/CHANGE-082.
- Order checks its version locally before these calls; it does not send that version to Credit. Published Order events retain `orderVersion`.
- Credit consumes `OpenOrderRefundTaskEvent`: refund/release the reserved amount for either requester cancellation of an `OPEN` order (`order.status=CANCELLED`) or scheduled expiry of an unassigned `OPEN` order (`order.status=EXPIRED`). User is not involved. This event replaces Order's former synchronous Credit release call and the formerly separate expiration event.
- Credit consumes `OpenOrderRefundTaskEvent` also for expired courier aborts. Legacy ABORTED accepted-cancellation payloads require coordinated refund reconciliation; NEW accepted-cancellation events are User penalty facts, not Credit refund instructions.
- Credit consumes every `OrderCompletionTaskEvent`: transfer/settle the reserved credits to the courier.
- Same-order current ACCEPTED resolves directly OPEN/EXPIRED while ABORTED survives in immutable courier history (ADR-025 supersedes the prior prohibition). The hold endpoint is missing from the inspected Credit API; see FEEDBACK-003.
- `getReservationStatus(orderId)`: recovery/idempotency query after uncertain reservation responses.

## Order Service provides

- Admin all-orders query (CHANGE-057): `GET /api/orders`, optional `status`, one-based `page`/`size` pagination, `OrderPageResponse`; admin role required. Omitted status returns every status. This supports NTH1/Admin Service but does not implement its dashboard.

- Commands: `createOrder`, `acceptOrder`, `startTask`, `markPickedUp`, `markDelivered`, `confirmCompletion`, `cancelOpen`, `cancelAccepted`.
- Queries: `getOrder`, `listOrders`, `listAvailableOrders`, `getCheckpointHistory`, `getOrderFacts`.
- Reposting: creation-time automatic plan, `getManualRepostDraft`, and
  `requestManualRepost`. The legacy `configureReposting` route is retained for
  compatibility but rejects post-creation mutation.
- Internal lifecycle services: `processExpiry`, `processAutoRepost`, and `autoCompleteDue`; expiry has no HTTP trigger (CHANGE-107). Spring scheduler selects `DELIVERED` orders with a delivered checkpoint at or before `now - 48 hours`; the transition rechecks under lock and commits the ordinary completion checkpoint/receipt and `OrderCompletionTaskEvent` outbox row atomically.
- Requester report placement (CHANGE-127 / ADR-040): PUT
  /api/orders/internal/{orderId}/completion-holds/{reportId}, JSON requesterId,
  forwarded requester Firebase Bearer token. Verified own active Order only;
  200 orderId/reportId/isCompletionHold/version DTO. Atomic per-report insertion
  and Order flag under lock; identical replay no-op, conflicting binding409.
  SQL lifecycle selection/locked recheck and domain funding guards honor holds.
  Actual Report client is absent; FEEDBACK-013. Placement uses reportId, not
  the financial command/receipt protocol, and produces no settlement event.
- Future integration: `releaseCompletionHold`, `applyAdministrativeResolution`.
  Release is explicitly deferred; no release endpoint exists in this milestone.
- Facts: `subscribeToOrderOutcomes`, including typed completion, shared OPEN-refund, and accepted cancellation event contracts.

Only approved active-workstream contracts are implementable. See `sprints/sprint-2-3/README.md` for the current slice and `sprints/sprint-1/contracts.md` for historical scope.

## Common guarantees

- Authenticated actor context or trusted service identity.
- Command ID for idempotent create, reserve, transition, expiry, and repost operations; globally unique event ID and event version for each published event.
- Expected order version for state changes and explicit conflict on stale commands.
- Stable order, user, and supplier identifiers; never exchange database entities.
- Distinct validation, unauthorized, not found, conflict, dependency unavailable, reservation rejection, and accepted-for-processing failures.
- Event payloads contain event ID/version, order ID/version, actor IDs, event-specific facts, and occurred-at time without unnecessary private data.
- Completion/refund/abort commit state/checkpoints/history where applicable, receipt and event intent together; dispatch follows commit and recovery retries due outbox rows. Every abort waits synchronously for Credit reset, then emits User penalty, plus Credit refund only for EXPIRED. Pub/Sub subscribers are asynchronous; Order does not wait for their replies. Delivery is at least once and requires durable consumer deduplication. Provider/consumer guarantees are not verified by this Order-only milestone.


## UI time selection and background cadence

CHANGE-077/ADR-022 keeps Requester UI clock minutes 00/15/30/45 and upward
rounding without a backend quarter-hour constraint. ADR-026 supersedes timer
cadence: one minute job for due unassigned OPEN expiry and >=48h latest-delivery
completion; all-event outbox recovery every 15 minutes; immediate publication
retained. These are defaults, not runtime SLAs, especially with idle Cloud Run CPU.


## CHANGE-079 / ADR-024: Central role annotations (approved 2026-10-08)

Production Firebase validation resolves User Service roles once per request, verifies response identity against JWT subject, and enforces RequireRequesterRole/RequireCourierRole/RequireAdminRole. Order-specific production role mode defaults to HTTP; local anonymous/mock behavior remains. Adapters reuse verified roles/identity, retaining fresh courier eligibility and locked domain ownership/state guards before mutation. Shared reads accept any confirmed requester/courier/admin role; /mine uses its selected mode. Internal lifecycle/scheduler authorization, API bodies, event payloads and schema remain unchanged. See ADR-024 for endpoint policy, inspected peer contracts and positive/negative test obligations.

Historical CHANGE-093 changed only internal lifecycle processing boundaries: due-ID query and per-order transaction/lock/recheck, caught failures and successful-transition counts. Its then-retained expiry HTTP shortcut is retired by CHANGE-107. Internal successful-transition counts still exclude skipped/failed candidates. No foreign API or event body change.

## Personal Order status filter — CHANGE-094 / ADR-032

`GET /api/orders/mine?mode=requester|courier&userId=<verified-uid>&page=1&size=20&status=COMPLETED`

- status is an optional uppercase OrderStatus query parameter: OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP, DELIVERED, COMPLETED, CANCELLED, ABORTED, EXPIRED. Omitted/empty means all; invalid enum or mode returns 400 VALIDATION_ERROR. No request body or new endpoint.
- Same production Firebase/role and selected-mode/identity verification; status cannot broaden ownership. Existing local behavior retained.
- Response remains `{items,page,size,totalItems,totalPages}`; one-based page, default 20/max 100. Filtered counts and content share the same DB constraints.
- Requester status applies to current owned Orders and retains hiding linked EXPIRED originals. Courier status applies to current assignments plus that courier's immutable ABORTED attempts only when status=ABORTED; all includes both. Business id and nullable attemptId/history behavior unchanged.
- POST /{id}/cancel-accepted unchanged. Abort errand is presentation wording; state/history/credit/outbox behavior unchanged.
- Frontend Order refresh5 seconds while visible/auth-ready; same selected status/page on periodic/manual/focus/mutation reads. Credit polling remains15 seconds. No financial mutation is triggered by polling.

CHANGE-095 UI refinement: personal dropdown choices are mode-specific (requester excludes ABORTED; courier excludes OPEN/EXPIRED/CANCELLED). This does not alter /api/orders/mine accepted enum, page shape, ownership/auth or server query contract.

## Scheduler DB selection and independent outbox dispatch — CHANGE-096 (2026-10-10)

The active lifecycle paths retain CHANGE-093: DB-filtered IDs, separate REQUIRES_NEW expiry/completion workers, fresh NOWAIT locks and outside-proxy catch. Outbox recovery now selects bounded eligible event IDs in SQL (due PENDING or expired IN_PROGRESS lease), then individually claims/rechecks with SKIP LOCKED. Claim, markPublished and scheduleRetry use separate REQUIRES_NEW transactions; enqueue remains REQUIRED with Order/checkpoint/receipt. Dispatcher catches each event's claim/commit/retry-write errors, logs its ID and continues later events. A failed retry write leaves the committed lease recoverable after expiry. Neither scheduler nor batch coordinator is transactional. Pub/Sub publication stays outside DB transactions and is irreversible; stable-ID deduplication remains required. Legacy claimDue is retained for compatibility, unused by the active scheduler. No cadence, schema, event body, peer, frontend or paused repost change.

Internal repository addition only: findDueIds(now, limit) returns eligible event IDs in deterministic created_at/event_id order, bounded in SQL; each individual claim revalidates eligibility under lock. No HTTP or subscriber payload change. FEEDBACK-009 remains unresolved.

## Swagger current-origin server — CHANGE-098 (2026-10-10)

CHANGE-098 sets an explicit relative OpenAPI server / through OpenApiConfiguration. Swagger now resolves API calls against the origin serving the specification, retaining /api/orders paths and Firebase authorization. Live staging docs previously advertised an HTTP backend host despite HTTPS gateway UI. This is an Order-only documentation routing implementation detail; no gateway, peer, CORS allowlist, forwarded-header trust, schema, frontend or deployment-env change. Tests first: one expected server-URL failure and one existing documentation pass (target/change098-red.log). Fresh source-only wrapper-selected Maven3.9.16/Java21 offline verify:253 tests,0 failures/errors/skips, including28 PostgreSQL tests; coverage96.00% lines (1441/1501),83.72% branches (468/559), unchanged >=80% gates pass. Generated target/openapi.json servers=[{url:"/",description:"Current gateway or service origin"}];160 current POM/source/test/resource files equal the fresh tested copy. Logs/reports target/change098-verify.log and target/change098-source-check/target/, evidence target/change098-evidence.json. git diff --check passes. No local application container rebuild or real authenticated browser request; no commit/push/cloud deployment. Staging remains unchanged until Order Service redeployment.

## Backend creation expiry guard — CHANGE-099 (2026-10-10)

Existing contract, newly verified at the HTTP boundary: POST /api/orders requires
expiresAt >= server validation time + 30 minutes. OrderCreationService supplies
Instant.now(); Order.open enforces the minimum before Supplier validation/Credit
reservation/persistence. Earlier values produce HTTP 400 VALIDATION_ERROR with
an expiresAt detail. Client-supplied timestamps cannot replace the server clock.
Wire schema and role checks remain unchanged; exact domain boundary is inclusive.
Direct API regression uses mocked providers; it is not a live integration claim.


CHANGE-143 (2026-10-18): Report Order summary has labelled Description and requester/courier display names. Status label sits above one equal-height select/refresh row. Admin Orders live list/details resolve distinct User summary and Supplier detail IDs independently via existing gateway/token transport; never block Orders on name failure or substitute sample data. Loading labels, Deleted labels for404/empty, unavailable for transient errors; copy/navigation IDs preserved. No global name cache, DB-owned names or API/config changes. Live Reports remains Coming soon until FEEDBACK-015 provider exists.


## Effective CHANGE-147 — Report reply privacy and active policy choices (2026-10-19)

Approved Yao Xiang: admin resolution reply is visible only to the submitter and reviewing admins; courier participants still see resolved status/time and other existing case information. Local prototype list/detail responses redact resolutionNote on copied snapshots, and UI hides the reply in courier views. Production Report Service is still missing and must enforce this with verified caller identity, never client-supplied roles. Live Reports remain Coming soon.

COURIER_UNRESPONSIVE is retired from active policy lists and new admin apply/cancel choices. Its enum/amount remain only for historical persisted rows and existing outbox events; immutable migrations and saved penalties are not rewritten or waived. Six active policies; three selectable report penalties (wrong location4, damage4, theft10). Cancellation UI selects one radio case and sends the existing one-element list; stored maximum semantics and existing penalty topics remain unchanged.

Report cards omit Order descriptions; closed cards are muted but remain navigable. Requester/courier names link to admin profiles, IDs have separate copy rows. Admin table names, email, roles and IDs truncate visually while full values remain in titles/copy/details. No sibling backend or shared runtime/CI/cloud configuration changes. See CHANGE-147.


## Report list filters — CHANGE-149

The local Report list GET accepts optional orderId (exact related Order ID, trimmed, max128) and reportStatus (AWAITING_COURIER_RESPONSE, READY_FOR_REVIEW, RESOLVED). Existing status=OPEN or RESOLVED remains the grouping selector; reportStatus intersects it. Empty filters mean all within the group. Scope/filters apply before pagination and totals; filters reset both page counters. The future Report Service must support equivalent filtering on its existing list contract and derive participants/admin from verified identity; this prototype's sample identity flags are never production authority. UI uses the same shared AdminFilterForm/Actions, Select and Input as Order search; normal user and Admin Reports retain their respective scopes. No refresh icon; existing visible five-second polling and error retry remain. HTTP-peer/staging/production Reports still show Coming soon, with no mock fallback.


## Effective CHANGE-153 — Hold eligibility and paused funding (2026-10-19)

Yao Xiang approved placing a requester-owned completion hold on any Order status except COMPLETED. This supersedes delivered-only placement and the old blanket terminal-state rejection for new holds. Preserve status, ownership/role checks, bound report IDs, locked transaction and release history. A hold placed after cancellation/expiry records a hold only; it does not restore lifecycle state or reverse settled funding.

The user explicitly clarified that ordinary cancellation, expiry and courier abort (and their refunds/penalties) must remain paused, in addition to requester/automatic completion. START, PICKUP and DELIVER continue normally; acceptance keeps its existing behavior. Admin cancellation remains the previously approved explicit override. Auto-completion and expiry retain held-row SQL exclusion. Report mock submission fixtures remain delivered-item samples; this change broadens the real Order hold endpoint, not a production Report Service implementation.

No schema, event/topic, frontend, shared configuration or sibling backend change. This is eligibility validation only. See CHANGE-153 and ADR-052.


## Effective HANDOFF alignment - CHANGE-159 / ADR-056 (2026-10-28)

See [reporting-order-integration.md](reporting-order-integration.md) for the current active-requester list/atomic report hold contracts, approved current-snapshot retry clarification (no new migration), explicit admin No penalty override, ready User/Credit admin links and deferred synchronous resolution design. New public hold placement is PUT /api/orders/mine/active/{orderId}/report-holds/{reportId} with requireAssignedCourier; caller identity comes from the token. SQL list is GET /api/orders/mine/active. Holds still pause ordinary funding/penalty outcomes and allow START/PICKUP/DELIVER. Existing admin cancellation overrides held funding.

Admin null/empty cancellation selections now suppress scoring even when provisional appliedPenalty was stored; selected additions compete with the stored maximum. Prior claims that No penalty cannot waive stored scoring are superseded for ADMIN CANCELLATION only. The provisional audit remains; requester/auto completion and Apply Penalty policy are unchanged.

Credit selected-user balance and User admin profile/promotion/deactivation are source-ready and linked with independent balance error handling. User paginated directory remains missing. Reporting source and non-callback resolve/result/conditional-restore contracts are missing; coordinator/live report resolution is explicitly deferred, not mocked as completed. No sibling backend, shared config, topic, migration or GCP edit.


## Effective ready Admin integration — CHANGE-160

CHANGE-160 / ADR-057 (Yao Xiang, 2026-10-28): all non-Report Admin sections use ready provider APIs in base Compose, HTTP-peer Compose, staging and production. Generic /api/orders/admin-mock routes and frontend transport are removed. User search retains the category dropdown with ID only, adapting existing admin profile lookup into a single-result page; blank/clear makes no peer call and name search remains pending. Reports alone retain /api/orders/admin-mock/reports with independent ORDER_REPORT_DEMO_ENABLED / FOC_REPORT_API_MODE settings gated by local environment plus Auth emulator; cloud Reports remain Coming soon. Report-only fixture store/mapper replace generic Admin mock CRUD. No schema, score, Order lifecycle, provider authorization or sibling backend changes. Feedback now contains only pending work; historical records are archived in the same docs folder.

See [pending peer contracts](peer-service-api-feedback.md).

## Effective real User directory and resolution display — CHANGE-161

CHANGE-161 / ADR-058 (Yao Xiang,2026-10-29) supersedes CHANGE-160 ID-only/blank-directory behavior: GET /api/users/admin/search supplies the initial real User page and optional exact Firebase ID/literal case-insensitive username search, Mongo count/filter/sort/paging, size1..100 and active-admin authorization. User Service edits are explicitly limited to this endpoint/DTO/query, tests/test dependency and maintainer handoff; legacy routes/model/role/penalty/deactivation behavior unchanged. Frontend requests20, keeps ID default and enables Name, with no generic mock fallback. Admin resolution is full-width below Repost information; retired waiver fields/empty admin values are hidden in UI only. No Order lifecycle/schema/saga/config/cloud change. Only Report remains a missing Admin HTTP integration; separate subscriber/Supplier guard follow-ups remain.

Contract/handoff: ../../user-service/user-servicehandoff.md. Verification: CHANGE-161.


## Effective Report resolution saga — CHANGE-162 / ADR-059 (2026-10-29)

Approved by Yao Xiang on order-service/admin-ui-linking: implement a guarded Order contract stub while Report Service is absent. Initial callback-free Report resolve is synchronous HTTP with admin Firebase token/reply; Order persists a bound command and possible-effect marker before the call. Confirmed remote result permits one locked transaction releasing only that report hold plus SUCCEEDED/saved result. Failed or uncertain local success chooses separate durable generation2 compensation through the existing Pub/Sub outbox. Authenticated exact-binding result inbox commit, not broker ACK, confirms reversal/fence. Committed local success is never compensated after a lost response. Pending/reconciliation holds stay active and manual release is guarded even after transport disablement.

V18 adds independent Report journal/inbox; no placement-snapshot backfill, Credit journal change or old migration edit. Existing minute scheduler selects due IDs in SQL (limit20), with per-command transactions/catches; no new whole-batch timer. New conditional admin resolve/status APIs and dedicated Google OIDC result receiver default disabled. Configuration/.env.example document explicit topics/URL/identity. No Report backend, GCP provisioning, deployment activation or frontend change. Reports stay local sample/cloud Coming soon. Existing progress/funding/penalty/admin-cancel rules are retained.

Report must implement operation preimage/revision checks, idempotent resolve, generation fences/tombstones, conditional restore and durable result outbox. This supersedes earlier proposed HTTP restore/result-query requirements only for Report resolution. Proposed exact protocol, diagram, migration and activation gates: docs/report-servicehandoff.md (relative to Order root); ADR-059 and changes/CHANGE-162-report-resolution-compensation-saga.md. Tests use explicit peer fixtures, not a verified live Report integration.


## Approved Report response window and early resolution — CHANGE-163 / ADR-060 (2026-10-29)

Yao Xiang confirms the courier response deadline is required. Report persists/exposes responseDeadlineAt and changes to READY_FOR_REVIEW on a timely response or deadline expiry without response. This supersedes earlier no-deadline guidance; no new duration is selected here. Admin may resolve either unresolved status; still-awaiting cases require a UI warning/confirmation that the courier has not responded and still has time. Required reply is stored as resolutionNote with resolvedBy/resolvedAt and is visible only to submitter/admin. Violation category changes remain undecided.

Documented Report provider responsibilities retain ADR-059: synchronous callback-free resolution with admin token, atomic report/operation-preimage/revision journal, stable command deduplication, generation2 compensation/fencing and durable authenticated result. Restore actual prior state/reply, reconcile the original deadline, and preserve newer work. No Order wire change or new confirmation flag is introduced. Report source is absent; this is a documentation milestone, not implemented Report/UI behavior. Local sample Report behavior is unchanged, Order saga defaults disabled and cloud Reports remains Coming soon. Exact peer requirements/tests: docs/report-servicehandoff.md (relative to Order root).


## Automatic repost retry repair — CHANGE-164 (2026-10-29)

Yao Xiang explicitly requests repeated automatic repost attempts until success. Existing NTH4/ADR-055/V16 flow is retained: SQL-only due selection, original NOWAIT lock/unique pending command guard, refund/requester/location checks, one forward Credit effect per immutable attempt, durable compensation on uncertainty, and atomic successor/link/plan-used/result commit.

Safe completed automatic rejections no longer permanently exclude the original. Each later eligible minute pass may register a fresh server-only AUTO_REPOST:<originalId>:retry:<UUID> command/candidate after the previous attempt is COMPLETED/REJECTED, FULLY_COMPENSATED and its Credit step is FAILED or COMPENSATED. First legacy key, all old candidate IDs/results/fences and public/peer payloads stay intact. Pending/reconciling/uncertain work blocks another attempt; success is replayed rather than repeated. DB selection prioritizes older due work over recently failed plans and remains bounded100; latest-attempt SQL is actor/order scoped, newest-first/limit1, not an in-memory history search.

No attempt-count cutoff is imposed on safe later attempts. Retry stops when a successor exists or the configured plan expires/is disabled/used; holds and deactivation/pending guards remain. Unresolved or exhausted compensation publication is not bypassed and retains the existing operator recovery requirement. No new schema, API, topic, credentials, timer, flag, frontend or sibling/backend/cloud change. Existing automatic-repost/compensation activation gates remain unchanged. Tests and rollout evidence: changes/CHANGE-164-automatic-repost-retry-until-success.md (relative to Order root).


## Effective Report integration - CHANGE-166 / ADR-061 (2026-10-29)

Yao Xiang approved the real Report backend, frontend and Order-owned saga integration on feat/reporting-service, then merged main and approved excluding OPEN from reporting. GET /api/orders/mine/active and its locked PUT report-hold endpoint now accept only ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED for the verified requester. OPEN remains active for unrelated User/Supplier involvement guards. Both ORDER/COURIER report submissions require an assigned courier. A hold retry still returns the current snapshot; no snapshot migration.

Report now implements the exact callback-free admin resolve contract, atomic Firestore preimage/revision journal, compensation-before-original fencing, conditional restoration and stable result outbox. Admin Reports uses actual APIs in all frontend modes, required/private replies, an early-resolution warning, stable retry keys and pending-status polling; the obsolete sample/Coming soon frontend gate is superseded. The old Report release-first route rejects409. Report's deadline/filter job selects due IDs in Firestore and handles each transaction independently. Existing progress/funding/penalty rules and Order V18 remain unchanged. Cloud activation is explicit/default-off.

Source and operations: [Report handoff](../../reporting-service/HANDOFF.md), [saga contract](../../reporting-service/docs/order-resolution-saga.md), [change record](../changes/CHANGE-166-reporting-integration-and-reportable-orders.md). Earlier missing-provider statements describe prior evidence. Final verification results are recorded in CHANGE-166; no User/Credit/Supplier code, GCP resource or deployed flag is modified by this task. Report creation after an uncertain hold is a separate remaining reconciliation requirement.


## Credit report context and courier reminders - CHANGE-168 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user requested optional Order context for credit issues, dates and a clearer order picker, an actionable duplicate-report message, and a red unanswered-report reminder. They explicitly approved completed-order context for either the requester or assigned courier, with no completion hold, no courier response request and direct admin review. Compact radio cards reuse the existing UI theme; all original report categories and active ORDER/COURIER restrictions remain.

Contracts: GET /api/orders/mine/completed?page=1&size=20 lists only COMPLETED orders where the verified caller is requester/current courier. GET /api/orders/mine/completed/{orderId} performs the same ownership/status check for Report backend validation; missing, unrelated and non-completed records return 404. No userId is accepted. Any recognized Order role may use these caller-scoped reads. SQL applies status/ownership/count/pagination; no all-order scan. OrderResponse.startedAt is nullable and derived from the stored deadline minus its declared delivery duration; no SQL migration or speculative legacy backfill.

CREDITS may remain unlinked or reference that completed order. GENERAL remains unlinked. Credit linkage is context only: courierId/deadline remain null, status READY_FOR_REVIEW, no hold or funding/penalty action. Credit resolution stays in Report's durable local journal even with an orderId; it never calls Order's hold-release coordinator or polls an Order command. Only submitter/admin can access these credit reports. ORDER/COURIER still require own assigned ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED order and their existing hold/response flow.

Duplicate protection: public placeActive locks the Order and rejects another active report while preserving same-report retry. Report saveNewLinked also serializes creation with Firestore active_report_orders slots, checking both the referenced report and a bounded legacy active-report query before writing report+slot atomically. Slot records can reference resolved history; a new report is permitted after resolution. Existing generic historical/admin multi-hold data is preserved. The response says: This order already has an active report. Please resolve it before submitting another report. Other conflicts are not relabeled as duplicates. This does not introduce a separate cross-service report-creation saga; the known hold-commit/report-save uncertainty remains a separate recovery requirement.

Reminder: GET /api/reports/mine/response-count returns {count}, scoped solely by the JWT subject, using Firestore aggregate predicates on courierId/status/responseDeadlineAt. Expired, responded and resolved reports do not count. One visible/authenticated five-second poller in the app shell supplies both desktop/mobile Report an Issue navigation badges; admin mode does not poll, account changes cannot inherit another user's badge and transient failures retain the same user's last confirmed count. No new event topic, secret or env var is required.

UI: optional completed-order cards for Credits and required active-order cards for Order/Courier; truncated description/ID, status, Created and actual Started dates, explicit unknown/not-started labels, bounded scroll and existing photo validation retained. Empty optional link remains supported, active-hold cards show their report state, and API errors preserve the entered form. No User/Credit/Supplier backend or cloud resources were modified.

Verification (final application source): root reactor 669 Order +12 common tests, zero failures/errors/skips, Maven SUCCESS and coverage gates (Order BRANCH81.03%, LINE94.80%). Report61 tests, zero failures/errors/skips, coverage BRANCH81.63%, LINE95.13%. Initial client test reproduced rejection of a response missing hold fields; fixed with a separate completed-context DTO, not by weakening hold validation. Real local Order/Report HTTP, PostgreSQL/Firestore and two-way Pub/Sub integration passes all seven scenario groups, including the new ownership/credit-context/duplicate/count cases plus existing compensation/replay/lost-response/fencing cases. Test containers/processes removed. Root Surefire emitted a post-success fork shutdown timeout warning; Maven still completed with exit0, zero failed tests. No production timeout or coverage gate changed. Logs: order-service/target/change168-order-verify.log, change168-report-final.log, change168-live.log; reporting-service/target/live-order-resolution-result.json.

Final frontend verification: all274 tests pass across52 files after the credit-case UI refinements; TypeScript, lint and production build pass. Credit case details show Submitter account, no courier-response section, and use actual Order participant IDs for Order names. The Order OpenAPI MVC slice now includes CompletedReportOrderController, with explicit path assertions; all4 focused documentation tests pass and the regenerated artifact includes both completed-context routes and startedAt. Report response-count OpenAPI and Firestore index/context validation pass. Live staging/production and Google IAM delivery remain unverified; this change does not deploy/rebuild the user's running stack. Install the two additional Firestore indexes in reporting-service/firestore.indexes.json before cloud rollout (courierId/status/responseDeadlineAt and orderId/status). No SQL migration is needed; Firestore slots are created lazily with a legacy-record check.


## Effective reporting simplification - CHANGE-169 (2026-10-30)

Owner: Yao Xiang on feat/reporting-service. The user revoked the optional CREDITS/Order association introduced in CHANGE-168 and requested the initial submission UI, while retaining completed/cancelled Order lookup and the red courier reply reminder. This supersedes only credit association and picker layout from CHANGE-168; active reporting/hold restrictions, duplicate feedback and the response-count behavior remain.

CREDITS and GENERAL submissions are unlinked: no Order selector or lookup, orderId null, READY_FOR_REVIEW, no reported courier, response deadline, completion hold or automatic credit adjustment. Sending a nonblank orderId for either category returns400. ORDER/COURIER keep the existing active-only associated-order dropdown. The card/row/date alternatives are removed from this form. A supplied initialOrderId is ignored for unlinked categories. Form contents/photos and the helpful active-report message remain on failure.

Retain GET /api/orders/mine/completed and /api/orders/mine/completed/{orderId}. Add the matching GET /api/orders/mine/cancelled and /api/orders/mine/cancelled/{orderId}. OrderCreditHistoryController replaces the internal CompletedReportOrderController class name without changing the completed URLs. List endpoints return the existing one-based Order page, with status/ownership/count/pagination in SQL; detail returns404 for wrong status, missing or unrelated orders. Requester/current assigned courier only, from verified principal, with any recognized Order role. Read-only history: no Credit ledger access, hold, funds or penalty changes. These APIs are independent of Report submission. Expiry also has refund behavior in the existing system; the requested retained history scope here is COMPLETED/CANCELLED, not a statement that other statuses have no Credit activity.

Remove the now-unused Report getCompletedOrder HTTP adapter/interface method and CompletedOrderContext DTO. Keep reading historical linked credit reports and resolving them locally through the existing Report journal; no database records are deleted or backfilled. The Report result/compensation contracts and topics remain unchanged. No SQL/Firestore migration or new index/env/role is required. Existing completed-query metadata, including nullable startedAt, is retained as response compatibility; the form does not display it.

Preserve GET /api/reports/mine/response-count and the red badge in normal desktop/mobile Report an Issue navigation, including five-second visible/authenticated polling, caller isolation and deadline filtering. No User/Credit/Supplier backend, CI workflow, cloud setup, running container or application database mutation is part of this change. Backend Java, Report form/tests and existing documentation are the affected slice. Tests and final evidence are recorded below after verification.


## Effective CHANGE-170 - 2026-11-01

Yao Xiang on hfix/report-service approved Report resolution response/recovery fixes, meaningful held-action rejection messages, Report-to-Orders exact-search navigation, ORDER/GENERAL-only new submissions with legacy readability, and COURIER_BAD_ATTITUDE=2. Return fresh Report responses without forwarding downstream HTTP framing headers. Preserve business rejection messages only before possible Credit effects; retain compensation afterward. V19 expands existing deferred-penalty constraints without changing saved rows or old migrations. Existing saga, holds, event schemas/topics and production flags remain unchanged. User penalty consumer integration is still missing in the inspected checkout. See changes/CHANGE-170-report-resolution-and-feedback-hotfix.md and reporting-service/HANDOFF.md for implementation and verification evidence.

## Effective CHANGE-171 / ADR-064 — courier Errand reports (2026-11-01)

User-approved: ERRAND lets the currently assigned courier report ACCEPTED, IN_PROGRESS, PICKED_UP or DELIVERED Orders, directly READY_FOR_REVIEW without self-response/deadline/reminder. ORDER stays requester-only; GENERAL unlinked; historical COURIER/CREDITS readable. GET /api/orders/mine/active adds mode=courier (default requester). Existing hold body adds reporterRole=COURIER (default REQUESTER). Verified role/token subject and SQL current ownership/status scope are mandatory; placement remains locked/transactional and hold rows bind the actual requester. New Report requesterId is actual owner; reporterId remains submitter. Legacy linked non-ERRAND records fall back to reporterId. Frontend selects the correct scoped list and labels submitter correctly. Replies remain submitter/admin only. Existing one-active-report, funding pause, continued delivery and resolution/compensation stay unchanged. No new SQL migration, topic, GCP or User/Credit/Supplier backend change. Deploy Order/Report/frontend together; older Report binaries cannot read new ERRAND documents. See changes/CHANGE-171-courier-order-reports.md and docs/decisions/ADR-064-courier-errand-reports.md for approval, design and verification. Implementation and verification in progress; prior170 staged work preserved.

## Active-report feedback — CHANGE-172

For duplicate report submission, both local selection validation and Order/Report conflict handling use: "This order has an active report. Please resolve it before proceeding." The specific reason is the form's alert title, with no generic "Could not submit" heading. Failed ORDER/ERRAND submissions retain content and selection; other trusted ApiError explanations remain visible. The Report adapter accepts legacy duplicate wording too. Cancellation/abort only prioritizes the hold for its authorized owner/current courier before stale-version validation; foreign-caller rejection order and funding/recovery rules remain unchanged. Same error codes/endpoints/schema/topics; no migration or infrastructure setting. See order-service/changes/CHANGE-172-active-report-error-messages.md for regressions and verification.


## Effective CHANGE-174 / ADR-065 ? unified Order reports (2026-11-02)

Yao Xiang approved ORDER for either the requester or current assigned courier; GENERAL stays unlinked. The opposite participant sees Against me and a response reminder and has 24 hours to provide an explanation/evidence. Reply or deadline makes the case READY_FOR_REVIEW. A missed response never automatically cancels or penalizes; admin review decides. Early admin resolution retains its warning. New ERRAND submissions are retired; resolved history remains readable. Unresolved ERRAND cases upgrade transactionally once to ORDER with a fresh 24-hour window, using bounded rotating batches in the existing scheduler and reconciliation on access.

GET /api/orders/mine/active?mode=participant SQL-filters owned/current assignments and reportable states before pagination; hold PUT accepts reporterRole=PARTICIPANT and verifies the actual locked participant's role/token identity. Existing requester/courier defaults remain. Report reporterId is submitter, requesterId/courierId are actual Order participants, and additive respondentId is the opposite participant. Additive responseExplanation exposes the reply; courierResponse and AWAITING_COURIER_RESPONSE remain compatibility wire names, displayed as Response/Awaiting response. No new SQL migration, status, topic, env flag, GCP resource or sibling User/Credit/Supplier implementation. Private admin replies remain submitter/admin only. Funding hold and delivery progression are unchanged.

Existing resolution/compensation preserves actual participant bindings, and captures a normalized legacy preimage so rollback does not reset the response deadline. Participant report/count reads are scoped in Firestore; their per-participant result sets are currently filtered/paged in memory. The existing single-field indexes suffice for the rotating legacy and participant queries. Deploy Order, Report and frontend together; avoid rolling back to the superseded requester-only behavior. Verification in changes/CHANGE-174-unified-order-report-responses.md; frontend under ../frontend/src, USER requester/courier and ADMIN impacted. This amendment supersedes CHANGE-171/173's separate ERRAND choice/direct review, not historical records.


## Effective CHANGE-175 / ADR-066 ? separate categories, two-sided responses (2026-11-02)

User-directed supersession of CHANGE-174's unified new-submission category: ORDER is submitted by the actual requester and the assigned courier replies; ERRAND is submitted by the currently assigned courier and the actual requester replies. GENERAL remains unlinked. Both linked categories use the existing24-hour response window, Against me view, opposite-participant notification and evidence response. Reply or deadline -> READY_FOR_REVIEW; admin decides any cancellation. Existing early-resolution warning, private admin reply, funding hold, delivery progression and guarded resolution/compensation remain.

Frontend ORDER uses the existing requester active selector; ERRAND uses mode=courier. Report chooses REQUESTER/COURIER hold role from category and validates the authoritative participant snapshot. One active report is enforced by orderId across BOTH categories: changing category cannot create another case until resolution. The duplicate error links to incoming cases. Existing generic respondentId/responseExplanation and compatibility response/status fields are retained.

New ERRAND reports keep their original deadline through reconciliation and rollback. Legacy unresolved ERRAND without deadline/response receives a fresh window once while retaining ERRAND; responded/resolved history is not reopened. Saved courier ORDER cases from the preceding unified design retain their existing category/bindings/replies/deadlines and remain accessible. No new Order API/application code, schema/index/topic/env/deployment/shared configuration, GCP or User/Credit/Supplier backend change. See changes/CHANGE-175-separate-report-categories-with-responses.md and ADR-066 for verification. Applies to existing frontend/src USER Requester/Courier and ADMIN reporting views.


## CHANGE-177 ? Action-eligible orders filter (2026-11-02)

User-approved Yao Xiang: Admin Orders gains the existing Supplier-style Switch labeled Action-eligible orders, off by default. Eligibility is the current five cancellation states OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED, including held Orders; assigned active Orders can also receive a stored penalty. It does not bypass command authorization, contention/pending-request or version validation. No new lifecycle state or financial policy.

GET /api/orders (existing admin authorization) accepts optional actionEligibleOnly=false. True intersects the five states with exact Order ID, selected status and creation-date predicates in SQL BEFORE count/paging. Response and omitted/false behavior stay compatible. Frontend exact-ID queries use this SQL path when the switch is enabled. Switch/status changes reset page1 and row selection; enabling clears a conflicting terminal status, selecting a terminal status disables the switch. Clear restores defaults; ID/date filters otherwise stay. Report links start with the switch off. Only Admin Orders is implemented here; Reports Ready for review shortcut remains a proposal.

Affected source: Order AdminOrderController/OrderQueryService/repository port/persistence adapter; frontend/src AdminOrders/admin-api and shared current action eligibility constant; existing backend/frontend tests and required context/disclosure. Same database/index/schema/topic/env/shared config/service boundaries, no sibling backend or workflow/skill change. SQL filtering is an implementation refinement within the approved filter, not a new architecture. See changes/CHANGE-177-action-eligible-order-toggle.md for test-first and final verification evidence.


## CHANGE-179 - Courier suspension role context (2026-11-04)

Order now consumes existing authenticated GET /api/users/role-context with required matching userId, recognized roles and isCourierSuspended for acceptance. Boolean true rejects new acceptance with403; false allows further normal checks; absent/null flag fails new acceptance503. Existing work needs role/identity only. No Order call to /api/users/courier-eligibility remains. User must retain/restore courier roles; Order never invents a missing role. Existing acceptance routes document403; request/response structures stay compatible. Normal JWT requests use one User lookup and refresh on the next request. No new peer endpoint/event/schema/topic; consumer/rollout verification in CHANGE-179.


## CHANGE-180 - Existing User suspension APIs consumed by Admin UI (2026-11-04)

Admin Users profile now calls PUT /api/users/{userId}/suspension and PUT /api/users/{userId}/suspension-removal through the existing authenticated gateway client. Both are bodyless, ADMIN_ONLY and return200 User; IDs are encoded and returned target identity is validated. Suspend sets score10 and a one-month courier suspension; Unsuspend clears suspension/deadline without score reset. No provider contract or implementation changes. Current local User image exposes only Suspend and needs rebuilding from existing source; end-to-end verification is pending. Missing-status legacy account writes remain a separate unapproved provider compatibility issue.


## CHANGE-181 - Supplier catalogue contract use (2026-11-09)

Existing authenticated Supplier GET list: status=active&page=1&size=100&sort=name&order=asc returns Page/Supplier with totalPages; Order creation follows pages and exposes options after all succeed. No type/openNow restriction added. Existing admin-only POST /api/suppliers now receives imageUrl:null for blank/whitespace form value, accepted by CreateSupplierRequest; nonempty URL retained/trimmed. PATCH empty imageUrl still clears an existing image; do not replace that with null because null means unchanged. GET /api/suppliers/types returns {items:string[]} and supplies Admin create/edit datalist; failed optional suggestions leave free-text input available. No backend/API/auth changes. Scalable indexed cursor search is unapproved proposal only; current provider caches findAll and scans in memory.


## CHANGE-182 - Bounded Supplier queries supersede all-page loader (2026-11-09)

Order pickup/delivery selectors query existing authenticated GET /api/suppliers only when opened: status=active&page=1&size=20&sort=name&order=asc. Optional q is trimmed,2+characters,300ms debounce; blank browses without search. Show more requests only the next current-query page; errors retry the same page. Query/close/unmount/disable cancels old work; late results ignored. Selected Supplier ID/label remains independent of current results. Existing Order command/pair validation/auth unchanged. No new endpoint/response: Page totalPages still used. Supplier backend cached findAll/in-memory scan remains a limitation; frontend paging does not imply backend100million-record scalability. CHANGE-181 create imageUrl:null and type-query contracts retained.
