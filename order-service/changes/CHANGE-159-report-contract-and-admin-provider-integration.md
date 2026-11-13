# CHANGE-159 - Report contract and admin provider integration

Owner: Yao Xiang; confirmed branch order-service/admin-ui-linking; 2026-10-28.

# Reporting / Order contract alignment

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


| D1 trace | Change | Evidence |
| --- | --- | --- |
| NTH2 / supplied REPORTING-ORDER-001 | Authenticated active list and atomic scoped holds | MVC/OpenAPI and PostgreSQL contract tests |
| NTH1/NTH2 / user amendment | Explicit No penalty cancellation overrides stored scoring | Service/domain/mock/DB event/outcome regressions |
| NTH1 | Ready Credit balance and User admin operations linked | Current provider source plus client/UI tests |
| NFR consistency | Keep hold until confirmed resolution; no blind rollback after commit | Proposed saga peer contract, intentionally not enabled |


CHANGE-159 final verification (2026-10-28): full root reactor verify PASS,654 Order +12 common tests, zero testcase failures/errors/skips, coverage gates pass. The first full run found one old OpenAPI schema assertion and one expired test fixture; both corrected and targeted38 tests passed, followed by final full verification. Added final auth/caller scoping and persisted zero-outcome checks. Surefire logs a30-second lingering fork shutdown/termination after tests (build exits0); no production shutdown issue is inferred. Frontend locked npm ci,253 tests, lint(0 errors/warnings), typecheck and production build pass; both fresh Docker images foc-order-service:change159-check/foc-frontend:change159-check build. New OpenAPI paths, exact six hold-response fields, boolean-only placement body and documentation links validated; git diff --check passes. No migration, live cloud invocation/deployment, real Report integration or authenticated deployed browser validation. Docker Desktop was started for isolated test databases; no application volumes removed. No commit or staging.
