# CHANGE-153 — Report holds on non-completed Orders

CHANGE-153 (2026-10-19), Yao Xiang: allow a NEW requester-owned report completion hold on any Order status except COMPLETED, including cancelled/expired/aborted historical states. Placing a hold preserves status and cannot undo previously committed funds. START/PICKUP/DELIVER (and existing acceptance behavior) continue; requester/automatic completion, normal cancellation, expiry and courier abort remain paused while held. Admin cancellation remains the prior explicit override. Preserve locking, report-ID binding/idempotency, release/multiple-hold history, auth, SQL exclusions and event rules. No schema, frontend, peer backend or shared config change. Report Service integration is still pending. TDD and verification next.


| Project D1 reference | Approved rule | Implementation | Verification |
| --- | --- | --- | --- |
| NTH2 / CHANGE-153 | New requester-owned hold on every status except COMPLETED | Order.validateCompletionHoldPlacement; OrderCompletionHoldService.place | Eight allowed status parameter cases plus completed/no-write and ownership tests |
| NTH2 / explicit clarification | Delivery continues while ordinary funding is paused | Existing progress methods and funding guards retained | Held acceptance/start/pickup/delivery domain regression; existing completion/expiry/cancel/abort tests |
| NTH2 / consistency | Hold record/flag commit together, report binding remains stable | Existing transactional service/repository, no migration | PostgreSQL hold rollback, multiple-report, race and new OPEN placement integration tests |

API remains PUT /api/orders/internal/{orderId}/completion-holds/{reportId} with requesterId body and forwarded Firebase authorization; only eligibility/description broadens. Existing release API/admin override and pending-command guard are unchanged. V1-V14 remain immutable; no migration is required. No peer implementation, frontend, event schema or topic change.


CHANGE-153 verification: full reactor Maven verify passed (531 Order Service tests plus 12 foc-common tests, zero failures/errors/skips; JaCoCo coverage checks passed). New eligibility cases reproduced seven old-rule failures before the implementation. Updated the obsolete delivered-only PostgreSQL regression to reject COMPLETED instead; new OPEN placement and held delivery progression are covered alongside existing funding, rollback and concurrency guards. Docker image foc-order-service:change153-check built successfully; git diff --check passed. No application containers/data changed, frontend edits, schema changes, cloud calls, staging or commits. Live Report Service integration remains pending.
