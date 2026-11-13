# CHANGE-093: Per-order lifecycle failure isolation

- Date / approver: 2026-10-09 / Yao Xiang, explicit request to skip failed scheduled tasks and continue successful ones on the current branch.
- Scope: Order expiry and auto-completion scheduler only; narrow extension of the current workstream. Preserve pending CHANGE-092 changes. No frontend, peer service, Pub/Sub schema, cron, migration, trusted credentials or paused repost/retry change.
- Classification: implementation/design refinement of existing lifecycle scheduling (ADR-020/026), required by the user's per-task failure-isolation invariant. No new service interaction or product transition.
- Traceability: F4.1.5 / F5 / F13 completion, F4.1.8 / F10 expiry, NFR2 transaction consistency, NFR3 tests.

## Discovered gap and effective design

Existing scheduler catches whole-pass exceptions, so completion still runs if expiry scanning fails. But expireDue/autoCompleteDue each wrap all selected orders in a single transaction and have no per-order catch. One exception can stop later orders; catching inside that shared transaction can leave it rollback-only and erase successes.

Approved implementation: LifecycleProcessingService becomes a nontransactional coordinator. Database queries select only eligible business IDs (no batch locks/entities or in-memory full-table filtering); auto-completion uses the latest DELIVERED checkpoint cutoff in SQL/JPQL. Each expiry is handled through a separate Spring-managed OrderExpiryProcessingService transaction (REQUIRES_NEW), with fresh NOWAIT row lock and state/courier/deadline recheck. Existing autoComplete uses REQUIRES_NEW and a lifecycle-specific NOWAIT repository operation. The coordinator catches RuntimeException around each proxied invocation, including commit failures, logs order ID and phase, increments only successful transitions, and continues. Whole-scan failures remain caught by the scheduler so the other phase and next cron pass can run.

State/checkpoint/outbox/receipt remain atomic per order. AFTER_COMMIT dispatch remains; publication failure does not roll back committed lifecycle state. Failed orders remain eligible for a later regular lifecycle pass; this is not a new background-repost retry mechanism. Normal requester/courier locks/transactions and accepted cancellation are unchanged.

Alternative: per-order catch inside existing batch transaction is insufficient because rollback-only/locks stay shared. TransactionTemplate per item could work but separate proxied workers are clearer and consistent with existing Spring application services. Reuse completion service, add one expiry worker, and do not change cron cadence.

Repository additions: ID-only due selection and lifecycle NOWAIT get. JPA query/locking details remain in infrastructure behind the domain repository. No database schema change. Coordinator has no foreign calls; existing Credit/User consumer blocker FEEDBACK-009 is unchanged.

## Tests first and verification plan

Fail first on failed-first expiry and completion loops. Test failures in different positions, all failed/empty selections, changed/missing/non-due rows under fresh lock, successful counts, per-item rollback/commit with actual Spring proxies, failed scan independence and next-pass continuity. Add PostgreSQL regression for rollback of one item's Order/checkpoint/outbox while a later item commits, and NOWAIT contention. Docker availability is reported honestly; no live application/cloud changes.

## Evidence

- Tests first: original failed-first expiry and completion regressions both failed as expected (2 tests / 2 failures), demonstrating that later orders were blocked. See target/change093-red.log.
- Focused final run: 44 tests, 0 failures/errors/skips; first/middle/last failures, all-failed/empty batches, eligibility rechecks, success counts, phase independence and Spring proxy processing/commit failures pass. See target/change093-focused.log.
- Fresh source-only Maven verify using wrapper-selected Maven 3.9.16 / local Java 21 offline compiler overrides: 232 tests, 211 passed, 21 Docker-dependent skips, 0 failures/errors; BUILD SUCCESS. No POM or coverage-gate changes. See target/change093-verify.log and target/change093-source-check/target/site/jacoco/.
- JaCoCo: lines 1357/1484 (91.44%); branches 454/553 (82.10%); original >=80% gates pass.
- New PostgreSQL rollback, NOWAIT contention and latest-delivery query tests compile but all four are skipped because the Docker Linux engine pipe is unavailable. Spring proxy tests use a mock transaction manager and do not prove live database rollback/locking. Real PostgreSQL verification remains pending; no feature/sprint completion gate claimed.
- Source review: cron, event contracts, accepted cancellation, ordinary command locking and paused repost logic remain unchanged by CHANGE-093. No peer/frontend/cloud/configuration/schema edits; existing FEEDBACK-009 integration blocker remains.
- Changes are uncommitted alongside pre-existing CHANGE-092 source/doc edits in overlapping paths. They have not been staged or committed together; preserve the pending work and review separate concerns before staging. No push/deployment.

| Requirement | Implementation / responsibility | Verification |
| --- | --- | --- |
| F4.1.8 / F10 | DB-selected expiry IDs; OrderExpiryProcessingService locks/rechecks and atomically expires/checkpoints/enqueues refund | LifecycleFailureIsolationTest, OrderExpiryProcessingServiceTest, LifecycleTransactionIsolationTest pass; PostgreSQL evidence pending |
| F4.1.5 / F5 / F13 | Latest DELIVERED checkpoint cutoff; existing autoComplete completion/outbox flow runs in its own transaction | Failure-position tests and existing completion event regressions pass; PostgreSQL evidence pending |
| NFR2 / NFR3 | Catch outside per-order transaction commit, preserve other successful orders; no batch row locks | 44 focused pass; full verify/coverage pass; 21 database skips recorded |

Sequence/class refinement: lifecycle selection -> each existing Order-owned expiry/completion transition -> independent commit or rollback -> catch/log and continue. State/checkpoint/outbox/receipt and AFTER_COMMIT responsibilities retained. Shared frontend inspected and untouched: internal reliability-only fix, no UI/API/auth changes.


## PostgreSQL follow-up — 2026-10-10

CHANGE-096 re-ran all four lifecycle PostgreSQL tests successfully with Docker available: independent expiry/completion rollback, NOWAIT skip/continue and latest delivery cutoff/deduplication. The prior skip statement is historical. Current fresh full verify: 252 passed, zero failures/errors/skips. No lifecycle production source was changed by that follow-up; peer/cloud gates remain.
