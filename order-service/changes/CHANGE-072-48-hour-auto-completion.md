# CHANGE-072: Automatically complete delivered orders after 48 hours

- Date: 2026-10-07
- Status: User-approved; implementation and documentation complete; focused verification blocked by local Java compiler failure
- Approval: The user requested a Spring scheduler to complete delivered orders once 48 hours have elapsed, then directed us to continue with the proposed database-query, row-lock, existing-completion-flow design.
- Scope: Order Service Sequence 5; no frontend or peer-service source changes.
- Related decision: ADR-020. Supersedes the Sprint 1 scope exclusion for 48-hour auto-completion only.

## Effective behavior

Requester-confirmed completion remains available any time after delivery. A configurable Spring scheduler periodically queries only Orders still in `DELIVERED` whose `DELIVERED` checkpoint is at or before `now - 48 hours`. The database selection uses a pessimistic no-wait row lock. The transition locks/reloads and rechecks status and checkpoint age before changing the Order to `COMPLETED`.

Automatic completion uses the stable command ID `AUTO_COMPLETE:<orderId>` and actor `lifecycle`. It records the completion checkpoint, command receipt, Order transition, and the existing `OrderCompletionTaskEvent` outbox intent in the same transaction. It shares the existing accepted/delivered checkpoint overdue calculation and event payload; no new event or peer contract is introduced. Repeated scheduler passes cannot complete an already-completed order again. No database schema migration is required.

The local and application default cron is once per minute and can be configured with `ORDER_AUTO_COMPLETION_CRON` / `order.lifecycle.auto-completion-cron`. Cloud Run scale-to-zero/request-based CPU can suspend the in-process scheduler while the service is idle, as with existing lifecycle cron jobs.

## Artifacts

- `OrderAutoCompletionScheduler`, `LifecycleProcessingService`, `OrderTransitionService`, Order domain operation, database-side repository query/lock, and configuration.
- TDD coverage for the exact 48-hour boundary, no early completion, event reuse, lifecycle actor/idempotency, database cutoff forwarding, and scheduled execution/failure handling.
- Sequence 5, publisher/class responsibility diagram, scope/requirements/acceptance criteria, traceability, contracts, ADR/change/evolution, current context and handoff records.

## Verification

Focused Maven tests were added before implementation. The test command compiled 86 production sources but Java 21 failed before test execution with `Fatal Error: Cannot close compiler resources`, matching the previously recorded local compiler failure. `git diff --check` passed. Re-run focused tests and full `mvn verify` in CI or a working Java 21 environment; verify the Spring Data JPQL query against the configured PostgreSQL version there.
