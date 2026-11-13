# CHANGE-096: Scheduler DB selection and independent failure handling

- Date / approver: 2026-10-10 / Yao Xiang, explicit latest scheduler isolation request.
- Scope: Order Service active lifecycle/outbox jobs only; preserve CHANGE-092–095 and paused repost/retries. No frontend/peer/schema/configuration/topic/cadence change.
- Authority: ADR-013/026 and CHANGE-093; F4.1.5/F4.1.8/F5/F10/F13, NFR2/NFR3. Implementation refinement of the approved per-item invariant.

## Inspection and effective design

LifecycleProcessingService already queries eligible IDs in the database and invokes separate REQUIRES_NEW expiry/completion workers with fresh NOWAIT locks and eligibility rechecks. The nontransactional coordinator catches outside the proxy, including commit errors, and proceeds; scheduler phases are independent. Retain that implementation.

Outbox currently filters due rows in SQL, but claims a batch in one transaction. If publication/marking fails and recording its retry also throws, the exception escapes forEach and skips later events. Replace the active recovery path with a bounded due-ID database query, then individual claim/recheck using SKIP LOCKED, publication outside transactions, and independent REQUIRES_NEW mark/retry writes. Catch around each complete dispatch invocation, including claim/commit/retry-record failures. If retry persistence fails, the existing committed lease expires and a later recovery scan can reclaim the event. Enqueue must remain REQUIRED so order/checkpoint/receipt/event intent roll back together. Legacy claimDue API remains for compatibility, unused by the scheduler.

An acknowledged Pub/Sub publish cannot be rolled back. Failed acknowledgment persistence can cause replay with the stable event ID; at-least-once delivery and consumer deduplication remain required. No new transaction spans a scheduler or Pub/Sub network call. No foreign contract changes; FEEDBACK-009 remains blocking real consumers.

## Tests first

Reproduce failed claim and failed retry persistence preventing later events. Verify DB-only bounded due-ID selection, independent claim/mark/retry transaction boundaries, processing and commit errors, and existing lifecycle rollback/locking scenarios with isolated PostgreSQL Testcontainers. Results pending; no completion claim.

## Verification evidence

Tests-first regression: 1 expected failure (retry database unavailable), target/change096-red.log. Focused 43 tests passed, including eight PostgreSQL lifecycle/outbox isolation tests; fresh source-only wrapper-selected Maven 3.9.16 / Java21 offline verify: 252 tests passed, 0 failures/errors/skips, including 28 PostgreSQL tests. JaCoCo 95.99% lines / 83.72% branches; unchanged >=80% gates passed. Logs: target/change096-focused.log and target/change096-verify.log; reports target/change096-source-check/target/. Docker28.4.0; isolated PostgreSQL15 Testcontainers; new isolation suites mock all cloud publishers. No application database, peer service, real topic or cloud setting changed.

Tests inject exceptions after real retry/published-marker state mutations and verify DB rollback before later success; independent dispatch persists despite an unrelated outer transaction rollback. All prior lifecycle/other backend regressions run without skips. Initial red test was updated to the new due-ID/individual-claim contract. Frontend inspected but unchanged; its tests/build not rerun. Schema unchanged; no migration required. Existing real peer/consumer/auth/browser/cloud gates remain and Sprint stays [~].

## Exact uncommitted scope

Production:

- src/main/java/sg/edu/nus/foc/order/application/OrderOutboxDispatcher.java
- src/main/java/sg/edu/nus/foc/order/domain/repository/OrderEventOutboxRepository.java
- src/main/java/sg/edu/nus/foc/order/infrastructure/OrderEventOutboxPersistenceAdapter.java
- src/main/java/sg/edu/nus/foc/order/infrastructure/JpaOrderEventOutboxRepository.java

Tests:

- src/test/java/sg/edu/nus/foc/order/application/OrderOutboxDispatcherTest.java
- src/test/java/sg/edu/nus/foc/order/infrastructure/OrderEventOutboxPersistenceAdapterTest.java
- src/test/java/sg/edu/nus/foc/order/infrastructure/OrderOutboxIsolationJpaIntegrationTest.java

Persistent records:

- order-service/docs/current-sprint.md
- order-service/docs/ai-project-context.md
- order-service/docs/architecture-order-service.md
- order-service/docs/decisions/ADR-013-transactional-outbox.md
- order-service/docs/decisions/ADR-026-shared-lifecycle-and-quarter-hour-outbox.md
- order-service/sprints/sprint-2-3/README.md
- order-service/README.md
- order-service/docs/service-contracts.md
- order-service/docs/architecture-evolution.md
- order-service/docs/change-log.md
- order-service/sprints/sprint-1/class-diagrams/updated-overall/publisher-class-diagram.md
- order-service/docs/diagrams/order-lifecycle-reconciliation.md
- order-service/docs/requirements-traceability.md
- order-service/docs/active-work/yao-xiang.md
- order-service/docs/local/developer-profile.md
- order-service/docs/work-allocation.md
- order-service/docs/ai-project-context.toml
- order-service/changes/CHANGE-093-lifecycle-failure-isolation.md
- order-service/changes/CHANGE-094-order-ui-status-filters.md
- order-service/learning/scheduler-failure-isolation.md

The learning directory is existing ignored local documentation. New tracked change record: changes/CHANGE-096-scheduler-database-isolation.md. Authorized root disclosure: ../ai/usage-log.md. No staging/commit because existing compact-event/UI/lifecycle changes overlap source/docs/tests; no reset, push or deployment.

Final source equivalence: all 159 current POM/source/test/resource files exactly match the fresh verified copy. Patch check identified three extra trailing blank lines in appended records; removed them before the final check. No source changed after verification.

## Follow-up concurrency audit — 2026-10-10 (review only)

User asks whether row locks prevent all concurrent API overwrites. No fix or specification change is approved in this audit. Branch/profile match Yao Xiang; D1/Overall/Updated SHA-256 fingerprints match; workflow/active sprint/ADRs/contracts/peer feedback rehydrated. Read-only inspection of Credit confirms reservation idempotency is keyed by orderId. Preserve all existing pending implementation and paused background repost work.

### Protected existing Order writes

OrderAssignmentService.accept; OrderTransitionService.start/pickup/deliver/complete/cancel/cancelAccepted; OrderRepostService.manual/automatic use transactions and getForUpdate -> JpaOrderRepository.findByIdForUpdate (PESSIMISTIC_WRITE). Domain validates expectedVersion/state/ownership under lock; Order @Version provides optimistic protection at flush. Lifecycle expiry/completion use REQUIRES_NEW and lifecycle NOWAIT locked rechecks. RepostFailureRecorder also locks, checks EXPIRED/no-repost and writes in REQUIRES_NEW. Unique original_order_id and courier-attempt order/version constraints are extra safeguards. Configure repost rejects changes; query/list/read APIs need no write lock and may display older state, rejected by expectedVersion on subsequent mutation.

Actual two-thread PostgreSQL acceptance probe: both courier calls use the same Order/version. One succeeds, one throws OrderProblem CONFLICT; exactly one Credit assignment call and ACCEPTED checkpoint, winning courier preserved, version increments once. This is real Spring/JPA application-service verification, not an HTTP/authentication or actual Credit integration test.

### Reproduced gaps

1. Concurrent identical CREATE: both calls miss findExisting, generate different Order UUIDs and call Credit.reserve before persisting the unique (operation, command_id) receipt. Probe confirms two reservation calls for distinct IDs, one local Order/receipt commit and one DataIntegrityViolationException rollback. Local uniqueness prevents two committed orders but cannot undo a real remote reservation. Credit JpaCreditRepository.reserve is idempotent by Order ID, so different IDs do not collapse the calls. Required recommendation: atomically claim/replay the command before external side effects, with requester/order/payload binding and a stable candidate ID/recovery protocol. Merely locking an existing order or adding @Version cannot lock a CREATE that has no row yet.

2. Concurrent outbox published/retry updates: claim uses SKIP LOCKED, but markPublished and scheduleRetry load plain findById, and OrderEventOutbox has no @Version/claim-owner check. After an expired lease is reclaimed, stale workers can still act on the same event. Probe holds the retry transaction's old IN_PROGRESS entity, commits markPublished in another transaction, then commits retry: persisted state returns to PENDING and publishedAt is overwritten to null. The temporary synchronization hook delegates plain findById to actual EntityManager.find, enabling both transactions to load snapshots before writes. REQUIRES_NEW isolates rollback but does not serialize these stale snapshots. Recommendation: conditional marker/retry updates requiring the current claim generation (existing attemptCount can be evaluated as a token), expected IN_PROGRESS state and appropriate lease validity; row locks or optimistic versioning alone do not identify an old lease owner. Retain stable-event deduplication; fencing cannot retract an already published message.

### Source-only limitations and recommended follow-up

- Ordinary findByIdForUpdate has no NOWAIT hint; competing API writers wait. Only the lifecycle variant sets lock.timeout=0. Therefore current APIs do not implement universal immediate lock rejection. If desired, select a bounded wait/NOWAIT policy explicitly and test it; adding locks to every read is unnecessary and increases contention.
- OrderExceptionHandler maps domain CONFLICT to409, but has no explicit handlers for Spring lock/optimistic-lock or receipt uniqueness exceptions. Recommend a consistent conflict response and safe retry semantics; duplicate-create probe verifies the exception type, not an actual HTTP500 response.
- Synchronous Credit reserve/assignment/reset can succeed remotely before Order transaction fails (or acceptance's post-Credit deadline validation fails). Order row locks cannot roll back another database. FEEDBACK-006 already documents missing compensation/reconciliation; no peer fix or recovery API is invented/implemented.
- Receipt lookups happen before order locking and are not rechecked after waiting; a concurrent replay may hit a stale-version conflict instead of replaying the completed receipt. Validate replay requester/target/payload binding as part of a coordinated idempotency fix. Normal mutations of the same existing row still reject stale state.

### Verification evidence

Temporary ignored harness: target/concurrency-audit-source/ (fresh POM/src copy) plus target/concurrency-audit-run.cjs. Final Maven test:16 checks,0 failures/errors/skips (three actual race probes, four lifecycle PostgreSQL tests, four outbox isolation PostgreSQL tests, five domain aggregate tests), target/concurrency-audit-final.log. The create/outbox probes deliberately assert reproduced CURRENT unsafe behavior; passing probes prove findings, not that those gaps are fixed. Initial run:15 passed/1 synchronization timeout because a Spring Data interface spy hook did not load the entity; corrected only the temporary hook to use real JPA loading, then all16 passed. No production source, committed tests, POM, schema, API, frontend, peer/config/cloud or application database was changed. All cloud/peer ports mocked in the new audit context. Full verify/coverage not rerun this review (previous252-test result remains dated CHANGE-096 evidence). Proposals are unapproved; no source fix, staging/commit/push/deploy or Sprint completion claim.

| Project D1 / approved invariant | Reviewed implementation | Verification | Result |
| --- | --- | --- | --- |
| F1.1–F1.3 / creation; approved command-idempotency contract; NFR2 | OrderCreationService.create and receipt uniqueness | Two-thread same-command CREATE probe with mocked Credit | GAP: two distinct reservation calls before one local rollback |
| F3 / acceptance; ADR-010/018; NFR2 | Assignment lock, expectedVersion and ownership checks | Two-courier same-version PostgreSQL probe | PROTECTED: one acceptance, loser CONFLICT, no overwrite |
| ADR-013/026; NFR2/NFR3 | Outbox marker/retry transaction isolation | Overlapping JPA entity loads and ordered concurrent commits | GAP: stale retry overwrites PUBLISHED marker |
| F4.1.5/F4.1.8; CHANGE-093/096 | Per-order lifecycle locks/transactions | Existing PostgreSQL lifecycle/outbox isolation regressions | Passed; not a proof of every possible race |


## Publication timing verification follow-up — 2026-10-10

Verified existing AFTER_COMMIT flow: business methods write Order/checkpoint/receipt/outbox and send only an internal Spring signal; audit code follows that signal. Actual typed publisher is invoked after successful Order commit; dispatcher then marks the outbox PUBLISHED in a separate transaction. Eight focused checks passed, 0 failures/errors/skips: three temporary PostgreSQL timing probes, four existing PostgreSQL lifecycle-isolation checks and one listener test. Probes verify error after signal rolls back without publisher invocation, publisher sees committed state in an independent transaction, and publish failure preserves CANCELLED plus durable retry intent. All peer/cloud publishers mocked; no real Pub/Sub verification. Temporary setup initially had three context errors from a multi-interface mock, corrected by mocking all peer ports; next run had one boundary-fixture failure, corrected by using expiry sixty seconds in the past rather than a PostgreSQL timestamp-rounding boundary. Final log: target/publication-timing-verified.log; ignored copied-source harness: target/publication-timing-source/. Current159 POM/source/test/resource files still equal the previously verified source; git diff --check passes. No application/committed-test/schema/config/peer/frontend change, no full verify/coverage rerun or staging/commit/push/deploy. Publication is irreversible; a failed post-publish marker can cause duplicate delivery. Previously reproduced outbox stale-worker overwrite and CREATE idempotency gaps remain unfixed.
