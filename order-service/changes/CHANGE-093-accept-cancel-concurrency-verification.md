# CHANGE-093: Courier acceptance versus requester cancellation

- Date/approver: 2026-10-09, Vincent's explicit fifth concurrency-test request.
- Branch: sprint-2-3-credit-service-concurrency.
- Classification: verification of existing approved behavior, no design change.
- Requirements: F3/F13 acceptance exclusivity, F4.1.7 requester OPEN cancellation,
  NFR3 real persistence/regression testing. Retain ADR-017/018/019 and CHANGE-092.

## Approved test scope and acceptance criteria

Extend OrderConcurrencyPostgresIntegrationTest using the existing isolated
PostgreSQL 15/Flyway/actual Spring service harness. An unexpired OPEN Order is
eligible for both actions initially. Run both winner orderings in independent
transactions and prove actual PostgreSQL row-lock blocking before releasing
the winner. Do not merely perform two sequential calls or rely on sleeps.

1. Acceptance wins: ACCEPTED with the winning courier; cancellation conflicts;
   exactly one Credit assignment, no refund intent/publication.
2. Cancellation wins: CANCELLED, null courier; acceptance conflicts before any
   Credit assignment; exactly one refund intent and after-commit dispatch request.
3. Both: exactly one version increment, checkpoint and winning command receipt;
   no losing receipt or duplicate outcome.

Peers and external dispatcher remain mocks. No live financial/pubsub verification,
production behavior, schema, frontend, event contract or peer-service change.
Cross-service remote-success/Order-failure recovery remains deferred.

## Test-first and verification

Tests are added before any production change. This is characterization of
existing behavior: no artificial failing assertion or production-lock removal
will be used to manufacture a red/green feature cycle. Record genuine test
results below; the assertions also require actual contention, not only final state.

1. Focused new method: Java 21 offline Maven test; 2 cases, zero failures,
   errors or skips; BUILD SUCCESS (49.982s overall). First execution passed
   existing production locking unchanged; no fabricated failing test claimed.
2. Full concurrency class plus OrderAssignmentServiceTest and
   OrderApplicationServicesTest: 23 cases, zero failures/errors/skips;
   BUILD SUCCESS (46.541s). Includes all five PostgreSQL races/10 cases,
   plus 13 service regressions. An initial selector also named a nonexistent
   OrderDomainTest; that name ran no tests. Actual domain classes ran below.
3. OrderAggregateTest, OrderDomainBehaviorTest, OrderAbortLifecycleTest,
   OrderAbortTransitionTest and OrderTransitionEventPublishingTest: 36 cases,
   zero failures/errors/skips; BUILD SUCCESS (22.735s).
4. Both new winner orderings require observed waiting/blocking PID, not merely
   a final conflict. Existing completion NOWAIT case safely reports 55P03.
5. git diff --check passes (existing CRLF notice only). D1/selected Overall
   SHA-256 match recorded fingerprints. Test commit: 827844b; no push.

This is 10 race cases plus 49 related regressions, with the new pair also run
separately. No fresh full-suite verify/JaCoCo, frontend, broker or real financial
integration result is claimed. No application databases or cloud resources touched.

Workflow checks remain NOT passed: check_source_drift exits 2 because the existing
source table lacks the generic script's expected headers; manual fingerprints
match. verify_gate exits 1 with five format/history findings (three historical
active-work items without requirement IDs and incompatible traceability headers/
missing ID). No unrelated workflow/history refactor performed. Parent/context
batch reads were partly truncated; a full historical audit is not claimed.

Status: approved test slice locally verified. Full Sprint remains `[~]` with
existing workflow/integration gates and deferred cross-service recovery open.
