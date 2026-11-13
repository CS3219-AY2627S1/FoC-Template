# CHANGE-092: Real PostgreSQL concurrency verification

- Date/approver: 2026-10-09, Vincent's explicit current-branch test request.
- Branch: sprint-2-3-credit-service-concurrency.
- Classification: verification of approved behavior, no new design.
- Requirements: F3/F13, F4.1.5/F5.1, F4.1.7, F4.1.8/F10; NFR3.
- Responsibilities: OrderAssignmentService, OrderTransitionService,
  LifecycleProcessingService, Order aggregate, PostgreSQL row locks.
- Existing ADR-018/020/025/026 retained, including deadline recheck after Credit.

## Test design

Actual Spring services, separate connections/threads, isolated PostgreSQL 15
with Flyway; gate first transition after its real lock and require database
evidence that the competing transaction waits on that lock. Test both winner
orderings for two acceptances, cancellation/expiry, acceptance/expiry and
requester/scheduled completion. Assert state/version, actor, checkpoint, receipt
and event-intent multiplicity. Bounded waits and finally cleanup; required new
tests fail rather than silently skip if Docker is unavailable.

Mock User/Credit and after-commit dispatcher. This verifies Order database
concurrency only, not peer authentication/ledger, publication or cross-service
recovery. No production code, schema or infrastructure changes planned.

## Verification

- Tests written before any production edit; existing locking behavior tested
  unchanged (no production implementation needed). Initial execution: 8 tests,
  1 failure due to Java/PostgreSQL timestamp precision in the fixture. Read-back
  correction preserves the exact stored-deadline boundary; rerun: 8 tests,
  0 failures/errors/skips, BUILD SUCCESS, Java 21.
- Seven cases demonstrate a waiting PostgreSQL transaction; requester-first
  completion verifies the existing NOWAIT rejection (SQLSTATE 55P03) and a safe
  subsequent scheduler pass. Same committed state/version and at-most-one intent
  checked in each case. This is not a new retry/deadline policy.
- Full Java 21 offline verification: mvnw.cmd -o -B -ntp
  -Djacoco.append=false verify. BUILD SUCCESS: 215 tests, 0 failures/errors/skips,
  including a second green execution of all eight races. Fresh JaCoCo counters:
  lines 1392 covered / 63 missed = 95.67%; branches 465 / 84 = 84.70%.
  Both 80% gates pass. Full execution took 14m52s; race Spring context/test group
  812.718s, versus focused 29.61s. No timing/SLA claim from test runtime.
- git diff --check passes (existing CRLF-to-LF notice only). No production,
  frontend, migrations, peer source or deployment configuration edits. Learning
  remains excluded. This test unit is verified; live integration/Sprint remain [~].
- Atomic test commit: 1906afb. Staged test patch reviewed; no push.
- Workflow script results (not passed): generic check_source_drift exit 2
  because the existing manifest lacks its required Concern/Authoritative source/
  Last known hash columns; verify_gate exit 1 with 3 format/history issues:
  traceability column names, a missing ID, and a historical active-work line
  lacking requirement ID. Manual D1/Overall hashes match approved fingerprints.
  No unrelated history/format refactor performed; full workflow/Sprint gate open.

## Additional races to consider (not implemented in this unit)

1. Manual versus automatic repost, and simultaneous manual reposts: one linked
   successor and stable/idempotent reservation intent.
2. Courier abort versus start: only one ACCEPTED transition, no stale abort
   history/reset/penalty if start wins.
3. Simultaneous same-command replay: deterministic actor-bound receipt, no
   uniqueness exception or repeated remote effect.
4. Two lifecycle replicas expiring/completing the same row: one outcome.
5. Immediate dispatch versus recovery scan: one claimed lease/stable event;
   peer delivery/recovery belongs to the user-deferred next branch.

Do not treat these recommendations or mocked financial calls as verified
production integration. Earlier UI abort-label request remains separate.
