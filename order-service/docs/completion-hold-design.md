## Effective deferred-penalty amendment — CHANGE-146 / ADR-050 (2026-10-19)

Approved Yao Xiang: remove penalty adjustment/replacement and the admin mark-completed API/UI. No synchronous User replacement call, setting, replacement topic, waiver or retroactive score modification exists in the current flow. User Service consumes only the existing final addition/deduction events. Requester and the auto-completion scheduler remain the completion actors.

Admin Apply penalty stores the highest report-case policy on the current assigned active Order, including held Orders. It cannot decrease/clear a stored penalty and emits no event or Credit/User call. New POST /api/orders/admin/{orderId}/apply-penalty accepts {commandId, courierId, expectedVersion, policy, reason}; verified admin identity comes from the principal. NOWAIT locked transaction, pending-command guard and bound command receipt protect stale/concurrent/repeated calls. OrderResponse exposes appliedPenalty, derived appliedPenaltyAmount and actor/reason/time audit. Only report cases from getCourierPenaltyCases() are selectable. Terminal/unassigned/stale/wrong-courier requests409; invalid400; unauthorized401/403; missing404.

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

# Order completion-hold design

CHANGE-137 / ADR-046, approved Yao Xiang2026-10-17: AdminOrderController adds
POST /api/orders/admin/{orderId}/complete. Assigned ACCEPTED/IN_PROGRESS/PICKED_UP/
DELIVERED may become COMPLETED, including held Orders. Stored participant IDs must
match. Publish existing Credit completion event plus at most one highest selected
penalty addition; null/empty means WAIVED, no automatic overdue penalty or reward.
Locked atomic decision/checkpoint/receipt/outbox and bound ADMIN_COMPLETE replay;
hold history and actual timing preserved, no fabricated delivery. Ordinary hold
guards remain. Reuses V10 columns/topics; no migration, UI, peer or cloud change.
HTTP200 confirms local intents, not Credit settlement or User score application.


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


Effective ADR-044 / CHANGE-134: authorized admin cancellation can resolve an
active held Order into CANCELLED with atomic refund/optional highest addition.
Hold history/flag retained; ordinary funding guards and generic-release deferral
remain. See ADR-044; this is not a requester/courier/scheduler bypass.


CHANGE-127 / ADR-040. Owner: Yao Xiang, order-service/penalty-integration,
2026-10-14. Approved placement and funding guards implemented; release deferred.

## Requirement and approved boundary

D1 NTH2 (PDF38) and NTH3 (PDF41) require report-related completion holds: prevent
requester and 48-hour automatic completion and final funding during investigation.
General enquiries need no Order hold. Placement does not change Order status,
settle credits or apply penalties.

User selects forwarded requester Firebase authorization: the verified requester
can hold their own active Order. This is not proof of Report Service identity.
Courier penalty-report eligibility belongs to future Report policy. Release is
explicitly deferred; no release endpoint, Report UI or settlement implemented.

## Implemented contract

PUT /api/orders/internal/{orderId}/completion-holds/{reportId}

JSON body: {"requesterId":"forwarded-Firebase-UID"}.

Production requires requester Firebase Bearer authorization. Existing JWT,
Requester role and UID binding reused; local mock/emulator behavior unchanged.
Report IDs are nonblank, <=128 characters, without surrounding whitespace.

Response DTO: {"orderId":"order-id","reportId":"report-id","isCompletionHold":true,"version":1}.
Traditional DTOs/MapStruct; ordinary Order responses expose isCompletionHold too.

Active states: OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP, DELIVERED. Terminal states
reject placement. 200 success/replay; 400 invalid input; 401 unauthenticated;
403 wrong role/identity/owner; 404 missing Order; 409 terminal state, unresolved
command or report binding conflict; 503 authorization dependency unavailable.
No DELETE/release operation.

## Atomic persistence and concurrency

V9 adds orders.completion_hold default false and order_completion_holds
(report_id primary key, order_id foreign key, requester_id, placed_at). V1..V8
unchanged. The service locks the Order and verifies ownership/state, then inserts
the report binding and updates the flag in one transaction. Same-ID replay is
a no-op; multiple reports can hold one Order. A report cannot move across Orders
or requesters.

Infrastructure uses insert-only SQL rather than JPA merge: separate Order locks
cannot protect a global report ID. Unique insertion rejects a concurrent
conflicting binding and rolls back the losing Order flag. Placement increments
Order version, but creates no checkpoint, receipt, outbox or Credit call.

## Guards, scheduler and frontend

Requester completion verifies ownership then hold before version: a stale
pre-hold browser version still receives 409 COMPLETION_ON_HOLD:

"This order has an ongoing report. You can complete it after the report is resolved."

The DELIVERED requester action displays this and disables Confirm completion;
a stale cached flag still shows the backend report message through the toast.

Expiry and auto-completion due queries exclude holds in SQL, with a locked
recheck per independent Order transaction. Held work is skipped and other jobs
proceed. Aggregate guards also block completion, OPEN cancellation/expiry and
accepted abort funding outcomes before Credit reset, refund/transfer outbox or
status change. Courier progress and successful command replay remain unchanged.
A hold is not an OrderStatus.

Existing publication stays after commit. Hold and completion use the same Order
lock; terminal completion cannot be held retrospectively or undo its event.

## Integration and remaining scope

Report Service is absent. FEEDBACK-013 requires its caller to persist/retry the
same report identity, forward requester authorization and wait for placement
confirmation. Order does not verify report existence in Report storage.
Report creation and hold placement are not a distributed atomic transaction.

Holds persist until an approved release/resolution flow. That design must
preserve report replay safety, retain other reports' holds and coordinate
settlement with already-due completion. Drain old Order revisions before enabling
Report traffic. Class/sequence diagrams: ADR-040. Verification: CHANGE-127.
Full NTH2/NTH3 and Sprint remain partial.


CHANGE-153 (2026-10-19), Yao Xiang: allow a NEW requester-owned report completion hold on any Order status except COMPLETED, including cancelled/expired/aborted historical states. Placing a hold preserves status and cannot undo previously committed funds. START/PICKUP/DELIVER (and existing acceptance behavior) continue; requester/automatic completion, normal cancellation, expiry and courier abort remain paused while held. Admin cancellation remains the prior explicit override. Preserve locking, report-ID binding/idempotency, release/multiple-hold history, auth, SQL exclusions and event rules. No schema, frontend, peer backend or shared config change. Report Service integration is still pending. TDD and verification next.


## Effective CHANGE-153 — Hold eligibility and paused funding (2026-10-19)

Yao Xiang approved placing a requester-owned completion hold on any Order status except COMPLETED. This supersedes delivered-only placement and the old blanket terminal-state rejection for new holds. Preserve status, ownership/role checks, bound report IDs, locked transaction and release history. A hold placed after cancellation/expiry records a hold only; it does not restore lifecycle state or reverse settled funding.

The user explicitly clarified that ordinary cancellation, expiry and courier abort (and their refunds/penalties) must remain paused, in addition to requester/automatic completion. START, PICKUP and DELIVER continue normally; acceptance keeps its existing behavior. Admin cancellation remains the previously approved explicit override. Auto-completion and expiry retain held-row SQL exclusion. Report mock submission fixtures remain delivered-item samples; this change broadens the real Order hold endpoint, not a production Report Service implementation.

No schema, event/topic, frontend, shared configuration or sibling backend change. This is eligibility validation only. See CHANGE-153 and ADR-052.


## Effective HANDOFF alignment - CHANGE-159 / ADR-056 (2026-10-28)

See [reporting-order-integration.md](reporting-order-integration.md) for the current active-requester list/atomic report hold contracts, approved current-snapshot retry clarification (no new migration), explicit admin No penalty override, ready User/Credit admin links and deferred synchronous resolution design. New public hold placement is PUT /api/orders/mine/active/{orderId}/report-holds/{reportId} with requireAssignedCourier; caller identity comes from the token. SQL list is GET /api/orders/mine/active. Holds still pause ordinary funding/penalty outcomes and allow START/PICKUP/DELIVER. Existing admin cancellation overrides held funding.

Admin null/empty cancellation selections now suppress scoring even when provisional appliedPenalty was stored; selected additions compete with the stored maximum. Prior claims that No penalty cannot waive stored scoring are superseded for ADMIN CANCELLATION only. The provisional audit remains; requester/auto completion and Apply Penalty policy are unchanged.

Credit selected-user balance and User admin profile/promotion/deactivation are source-ready and linked with independent balance error handling. User paginated directory remains missing. Reporting source and non-callback resolve/result/conditional-restore contracts are missing; coordinator/live report resolution is explicitly deferred, not mocked as completed. No sibling backend, shared config, topic, migration or GCP edit.


## Effective guarded Report resolution — CHANGE-162 / ADR-059

Initial Report resolution is synchronous and hold release commits only after a bound Report success. New V18 Report journal/inbox plus existing outbox persist failed/uncertain compensation and its authenticated result. Direct release rejects while enabled; persisted unresolved journals independently guard manual release even when disabled. Other active holds remain; progress continues and ordinary funding outcomes stay paused. Broker ACK is not restoration. Report provider is absent/default-disabled; see [Report handoff](report-servicehandoff.md) for the exact proposed protocol, recovery diagram and activation gates. This supersedes the earlier defer-only/HTTP-restore proposal, without changing hold placement current-snapshot retries.


## Approved Report response window and early resolution — CHANGE-163 / ADR-060 (2026-10-29)

Yao Xiang confirms the courier response deadline is required. Report persists/exposes responseDeadlineAt and changes to READY_FOR_REVIEW on a timely response or deadline expiry without response. This supersedes earlier no-deadline guidance; no new duration is selected here. Admin may resolve either unresolved status; still-awaiting cases require a UI warning/confirmation that the courier has not responded and still has time. Required reply is stored as resolutionNote with resolvedBy/resolvedAt and is visible only to submitter/admin. Violation category changes remain undecided.

Documented Report provider responsibilities retain ADR-059: synchronous callback-free resolution with admin token, atomic report/operation-preimage/revision journal, stable command deduplication, generation2 compensation/fencing and durable authenticated result. Restore actual prior state/reply, reconcile the original deadline, and preserve newer work. No Order wire change or new confirmation flag is introduced. Report source is absent; this is a documentation milestone, not implemented Report/UI behavior. Local sample Report behavior is unchanged, Order saga defaults disabled and cloud Reports remains Coming soon. Exact peer requirements/tests: docs/report-servicehandoff.md (relative to Order root).
