# Reporting / Order contract alignment

## Effective Report saga — CHANGE-162 / ADR-059 (2026-10-29)

The user approved a guarded Order-side contract stub: synchronous callback-free Report resolve with admin reply, durable Order journal, short atomic hold-release transaction, and asynchronous Pub/Sub compensation/result on failed or uncertain local success. V18 stores the independent Report journal/inbox; no placement-snapshot columns are added. Exact contracts/sequence are in [Report handoff](report-servicehandoff.md). Broker ACK never proves reversal; authenticated committed result is required. Hold stays active during recovery and after compensation; jobs are independent. Manual release remains guarded when transport is disabled. Committed success is never compensated after a lost response.

This supersedes the earlier defer-only/HTTP restore/result-query proposal below only for Report resolution. Defaults remain disabled, with no real Report provider, cloud resource change or live UI activation. Report must implement journal/preimage/revision checks, generation2 fences, deduplication and result outbox before activation. Existing list/hold current-snapshot retry semantics, delivery progression and financial/penalty rules remain.

CHANGE-159, 2026-10-28. Owner: Yao Xiang on order-service/admin-ui-linking.
Authority: supplied HANDOFF.md (Reporting branch feat/reporting-service, prepared2026-10-27) and explicit user clarifications. Reporting Service source is absent in this checkout. The handoff describes a peer contract, not proof of a deployed implementation.

## Implemented Order contracts

| Operation | Contract |
| --- | --- |
| GET /api/orders/mine/active?page=1&size=100 | Validated caller's requester UID only. SQL owner + OPEN/ACCEPTED/IN_PROGRESS/PICKED_UP/DELIVERED filter before pagination/count. Stable createdAt descending / ID descending. One-based page; size1..100 |
| PUT /api/orders/mine/active/{orderId}/report-holds/{reportId} | Body {"requireAssignedCourier":true/false}; requester comes only from the authenticated principal. Scoped pessimistic NOWAIT SQL lock, pending-command guard, conditional courier check and report hold write in one transaction |

List returns the standard Order page and display fields. Hold returns id, requesterId, nullable courierId, status, reportId and isCompletionHold. Missing/unowned/inactive Orders have the same404 response; required courier or conflicting report binding409; authentication401, role403, validation400 and role dependency503. Report IDs are unique and bound to Order/requester. Released IDs cannot reactivate holds (409). No GET-then-PUT validation race is introduced. Existing post-commit outbox behavior is unchanged.

**Approved retry clarification:** same report ID reuses the existing hold and returns the CURRENT authoritative Order snapshot, not a frozen placement snapshot. Status can progress between successful placement and an HTTP retry. The original report ID, Order and requester binding cannot change. requireAssignedCourier is checked against current assignment on each call. The Report owner must verify this deliberate difference from the handoff's literal same-snapshot wording; no V18 or other schema migration is introduced.

The old PUT /api/orders/internal/{orderId}/completion-holds/{reportId} HTTP contract is replaced by the handoff route/body. Existing internal compatibility helpers and saved hold history remain; they are not the new public contract. Existing release PUT /api/orders/admin/{orderId}/completion-holds/{reportId}/release remains admin-protected and report-specific, with no funding event itself. It does not currently call Reporting or prove the report was resolved.

## Holds and penalties

Holds allow courier START/PICKUP/DELIVER. As explicitly reconfirmed, ordinary completion, cancellation, expiry and courier-abort outcomes remain paused when held, including refunds/penalties. Existing admin cancellation is the explicit override. A hold does not pause the delivery clock, change status or rewrite earlier financial outcomes. Release reconciles all report-specific holds; another active report keeps the flag true.

Admin Apply Penalty only saves the highest provisional policy/audit. Final scoring occurs at completion/cancellation, once per courier attempt, through the existing addition/deduction outbox. Admin cancellation with null/empty appliedPenalties now means **no score event even if a provisional policy was stored**. With a selection, use max(stored, selected); never add automatic overdue or a delivery reward on cancellation. Retain stored policy as investigation history, record final admin decision/outcome0 for No penalty, and refund separately. This does not reverse a previously finalized penalty from another attempt.

## Ready admin peers linked

- Credit GET /api/credits/users/{userId}/balance is admin-protected and returns userId/usableBalance/reservedBalance/totalBalance/asOf. The selected profile card loads it independently; Credit errors do not hide User details or transaction history. Identity mismatches are errors, not another user's balance.
- User GET /api/users/{userId} is now admin-protected. Profile data is normalized from authoritative AccountStatus: ACTIVE, DEACTIVATION_PENDING, DEACTIVATED. Missing/unknown status is not fabricated as active; unavailable phone/address stay placeholders.
- User PUT /api/users/{userId}/user-promotion is admin-protected and returns the updated profile. DELETE /api/users/{userId} is admin-protected, uses the existing deactivation recovery/barrier workflow and returns text; the adapter reloads the preserved profile after success. Provider errors remain visible, with no mock fallback.
- User's paginated admin directory is still missing (unpaged GET /api/users is unsuitable); keep that capability unavailable. Manual suspension is not linked. Source matching and adapter tests are not deployed end-to-end verification.

## Synchronous report resolution: proposal, deliberately NOT enabled

The user approved deferring this integration until the peer supplies safe contracts. HANDOFF.md's PATCH /api/reports/{id}/status calls Order release before saving RESOLVED. Having Order call that same endpoint would recurse back into Order, and a Report save failure after release would leave a resolved-funding gap. Do not implement a callback loop or invent missing endpoints.

Recommended initial synchronous sequence, with durable recovery for partial failures:

1. Order verifies admin, report/Order binding and current hold, then commits a stable-ID resolution intent. Hold stays active. No Firebase token is persisted.
2. Call a Reporting **resolve-without-Order-callback** operation with idempotency key, expected report revision and admin reply. Report atomically changes READY_FOR_REVIEW to RESOLVED and returns the matching operation/result/revision and a restorable preimage reference.
3. In a short Order transaction, serialize success versus compensation on the resolution journal, release that report hold, recompute remaining holds and mark the command successful atomically. Commit is the success boundary. Do not hold a database lock across network I/O.
4. If Report succeeded but the Order commit failed, durably choose compensation and call a conditional idempotent Report restore operation for that same command/revision. Restore must not overwrite another admin's newer resolution, and must fence late resolve work after compensation is chosen. Keep the hold active until a safe outcome is known.
5. Timeout/crash means unknown result: query/retry the peer operation using the same key. A catch block alone is not durable recovery. Persist retry/compensation intent before dispatch; require fresh authorization for recovery rather than storing an expiring bearer token. Bound original/compensating workers as the existing Order/Credit saga does.
6. If Order release already committed, never restore Report merely because the HTTP response was lost or serialization failed: funding may now have started. Exact command retry returns the committed result.

Required Reporting operations (paths/bodies still for owner agreement): resolve without callback; read result by stable operation ID; conditional restore with preimage/revision/fencing. Success replies must bind reportId, orderId, actor/operation and final status/revision. Forward verified admin auth. Conflict/authorization/temporary failure semantics and retention/reconciliation must be agreed and contract-tested. No new Order coordinator endpoint, resolution table/migration or live UI action is claimed implemented.

A rollback BEFORE the local hold-release transaction commits leaves the hold intact: other transactions do not observe its uncommitted update. The irreversible risk starts AFTER commit. Also confirm Reporting durably saves creation intent/report ID before placing a remote hold, so a crash while saving the report cannot orphan a permanent hold. A stable ID only in process memory is insufficient.

Existing recovery reference: [compensation-workflow-handoff.md](../concurrency/compensation-workflow-handoff.md). Its journal/fencing/outbox pattern is useful, but Credit compensation routes, payloads and permissions must not be reused as if Reporting implemented them.

## Validation / limitations

Contract/security and real PostgreSQL tests cover the new list/hold paths, SQL page filtering, caller scoping, all active/terminal states, courier checks, binding/retry and hold persistence. Existing progress/funding/transaction tests remain applicable. Admin No penalty regressions and provider-adapter/UI checks cover the authorized changes. Actual results are recorded in CHANGE-159 after verification; this section alone does not assert a pass. Live Report resolution, restoration, Reporting attachment/deadline behavior, GCP deployment and authenticated cross-service browser integration remain unverified.


## Effective ready Admin integration — CHANGE-160

CHANGE-160 / ADR-057 (Yao Xiang, 2026-10-28): all non-Report Admin sections use ready provider APIs in base Compose, HTTP-peer Compose, staging and production. Generic /api/orders/admin-mock routes and frontend transport are removed. User search retains the category dropdown with ID only, adapting existing admin profile lookup into a single-result page; blank/clear makes no peer call and name search remains pending. Reports alone retain /api/orders/admin-mock/reports with independent ORDER_REPORT_DEMO_ENABLED / FOC_REPORT_API_MODE settings gated by local environment plus Auth emulator; cloud Reports remain Coming soon. Report-only fixture store/mapper replace generic Admin mock CRUD. No schema, score, Order lifecycle, provider authorization or sibling backend changes. Feedback now contains only pending work; historical records are archived in the same docs folder.

See [pending peer contracts](peer-service-api-feedback.md).

## Effective real User directory and resolution display — CHANGE-161

CHANGE-161 / ADR-058 (Yao Xiang,2026-10-29) supersedes CHANGE-160 ID-only/blank-directory behavior: GET /api/users/admin/search supplies the initial real User page and optional exact Firebase ID/literal case-insensitive username search, Mongo count/filter/sort/paging, size1..100 and active-admin authorization. User Service edits are explicitly limited to this endpoint/DTO/query, tests/test dependency and maintainer handoff; legacy routes/model/role/penalty/deactivation behavior unchanged. Frontend requests20, keeps ID default and enables Name, with no generic mock fallback. Admin resolution is full-width below Repost information; retired waiver fields/empty admin values are hidden in UI only. No Order lifecycle/schema/saga/config/cloud change. Only Report remains a missing Admin HTTP integration; separate subscriber/Supplier guard follow-ups remain.

Contract/handoff: ../../user-service/user-servicehandoff.md. Verification: CHANGE-161.


## Approved Report response window and early resolution — CHANGE-163 / ADR-060 (2026-10-29)

Yao Xiang confirms the courier response deadline is required. Report persists/exposes responseDeadlineAt and changes to READY_FOR_REVIEW on a timely response or deadline expiry without response. This supersedes earlier no-deadline guidance; no new duration is selected here. Admin may resolve either unresolved status; still-awaiting cases require a UI warning/confirmation that the courier has not responded and still has time. Required reply is stored as resolutionNote with resolvedBy/resolvedAt and is visible only to submitter/admin. Violation category changes remain undecided.

Documented Report provider responsibilities retain ADR-059: synchronous callback-free resolution with admin token, atomic report/operation-preimage/revision journal, stable command deduplication, generation2 compensation/fencing and durable authenticated result. Restore actual prior state/reply, reconcile the original deadline, and preserve newer work. No Order wire change or new confirmation flag is introduced. Report source is absent; this is a documentation milestone, not implemented Report/UI behavior. Local sample Report behavior is unchanged, Order saga defaults disabled and cloud Reports remains Coming soon. Exact peer requirements/tests: docs/report-servicehandoff.md (relative to Order root).


## Effective Report integration - CHANGE-166 / ADR-061 (2026-10-29)

Yao Xiang approved the real Report backend, frontend and Order-owned saga integration on feat/reporting-service, then merged main and approved excluding OPEN from reporting. GET /api/orders/mine/active and its locked PUT report-hold endpoint now accept only ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED for the verified requester. OPEN remains active for unrelated User/Supplier involvement guards. Both ORDER/COURIER report submissions require an assigned courier. A hold retry still returns the current snapshot; no snapshot migration.

Report now implements the exact callback-free admin resolve contract, atomic Firestore preimage/revision journal, compensation-before-original fencing, conditional restoration and stable result outbox. Admin Reports uses actual APIs in all frontend modes, required/private replies, an early-resolution warning, stable retry keys and pending-status polling; the obsolete sample/Coming soon frontend gate is superseded. The old Report release-first route rejects409. Report's deadline/filter job selects due IDs in Firestore and handles each transaction independently. Existing progress/funding/penalty rules and Order V18 remain unchanged. Cloud activation is explicit/default-off.

Source and operations: [Report handoff](../../reporting-service/HANDOFF.md), [saga contract](../../reporting-service/docs/order-resolution-saga.md), [change record](../changes/CHANGE-166-reporting-integration-and-reportable-orders.md). Earlier missing-provider statements describe prior evidence. Final verification results are recorded in CHANGE-166; no User/Credit/Supplier code, GCP resource or deployed flag is modified by this task. Report creation after an uncertain hold is a separate remaining reconciliation requirement.
