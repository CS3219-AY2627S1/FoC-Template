# CHANGE-100: Durable Credit commands — approved stub milestone

Date/approver: 2026-10-10 / Vincent. Branch: sprint-2-3-credit-service-concurrency.
Status: locally tested Order/frontend contract-stub implementation; Sprint `[~]`;
live HTTP recovery `[!]`. No production integration completion claim.

Authority: ADR-033, F1/F2, F3/F4.1.1, F11.2/ADR-025, F13, NFR3 and NFR4.
User approved the detailed command/lease plan, frontend slice, user-assisted
authorization, deadline-preserving compensation, contract-stub-only execution
and scoped context loading. No Credit source changes are authorized.

Expected versus actual: current PUT reservation accepts requesterId/amount;
PUT assignment accepts courierId; POST hold-for-reopen has no body. These shapes
match ADR-018. Historical key/result replay, operation lookup, late-write fencing
and conditional reversal do not exist: INCOMPLETE_OR_INCOMPATIBLE (003/006).
Provider agreement and actual contract/integration tests are required before
live activation. The stub is a milestone, never verification of Credit.

Design and migration: ADR-033; V5 adds only Order-owned command data. Existing
V1–V4, financial ownership, event schemas/topics, cron policies and repost behavior
are preserved. Upgrade/clean tests must run in isolated PostgreSQL containers.
Rollback means disable recovery, retain unresolved records for reconciliation;
do not delete records or reservations to make an error disappear.

Acceptance/test matrix: immutable-key conflicts and account isolation; durable
intent before I/O; same-key claim races and stale generation rejection;
different-key order guards; timeout after remote commit; local rollback/crash;
401 after uncertainty; deadline compensation; three transition finalizers;
pending/reload/auth-only Continue UI; unchanged legacy HTTP path.

## Executed verification

- RED: missing durable lease/store/coordinator classes; PostgreSQL recovery
  tests then exposed a saved response version before JPA flush. Fixed by flushing
  inside finalization, before atomically saving the replay DTO.
- RED: old-generation compensation test failed, then passed with generation
  fencing. Conflicting stub input was shown to advance a valid command's fence;
  binding now checks before advancing any generation. New OpenAPI path assertion failed before adding the new controller
  to the documentation slice. Owned past-outcome read failed on courier
  eligibility, then passed after validated JWT owner/role reuse for reads.
- RED: UI disabled-mode resume and account-switch readiness tests failed;
  explicit gates/account-scoped state fixed them. Pending-discovery component
  tests failed before implementation. Readiness failure was invisible until
  the final safe error-state fix. A caller-mutated body changed saved retry input;
  the hook now snapshots input before storage/submission. No tests were disabled
  or weakened to pass.
- Final Java 21 `mvnw.cmd -B -ntp -q -Ddebug=false
  -Dlogging.level.root=WARN -Dorder.commands.cron=- verify`: **298 tests,
  0 failures, 0 errors, 0 skipped**. JaCoCo **95.76% lines (1695/1770),
  81.82% branches (621/759)**; 80% line/branch gate passed unchanged.
- Real isolated PostgreSQL 15/Flyway clean and upgrade tests; 13 new command
  recovery cases and all ten legacy race cases. Timers disabled only for test
  isolation; coordinator recovery is called explicitly and default minute cron
  is separately asserted. No user database was reset or deleted.
- Final frontend: **73 tests passed (18 files)**; lint **0 errors / 12 existing
  unrelated login/profile warnings**; `npm run typecheck` (Next route generation
  + tsc) and `npm run build` both passed. Existing external home package-lock
  warning is not changed. No native authenticated browser result is claimed.
- Deterministic workflow helper FAILED on existing historical active-work
  text containing literal `[x]` and nonstandard traceability table formats.
  Source helper FAILED because the existing PDF reference table does not use
  its required manifest columns. These are not reported as passed. Manual SHA256
  checks matched approved D1/Overall/Sprint-1 hashes; no source PDF drift.
- Existing committed `ai/usage-log.md` merge markers remain untouched; append
  the new disclosure after history. This separate workflow-history blocker is
  not interpreted as an application test failure or silently repaired.

## Handoff / remaining gates

Requested detailed handoff: `concurrency/concurrency-order-credit.md`.
FEEDBACK-010 records provider stopping point, exact business requests, proposed
headers/result/compensation and Credit transaction requirements. V5 is the
latest shared migration; V1–V4 remain unchanged. The owner-read refinement is
an implementation detail within approved user-assisted recovery: mutations still
require current eligibility, but viewing one's past result is not a new task.

Credit source, sibling services, compose/gateway/infrastructure/event contracts
are unchanged. No push, deployment or live activation is authorized/performed.
Credit durable ledger/key history, actual HTTP adapter/contract, consumer/cloud
runtime, authenticated desktop/mobile browser and provider restart verification
remain open. IndexedDB remount behavior is tested through its mocked storage
boundary; native browser storage/transaction behavior still needs browser QA.
Lease renewal/production timeouts and scale-to-zero operational scheduling need
review before production activation. Local profile changes remain personal,
and learning documentation remains excluded from commits.

## Local atomic commits

- `2e2b263`: approved design, persistent context, Credit handoff and AI disclosure.
- `3dd1bf8`: backend command recovery, V5 migration and verified backend tests.
- `5dea2ee`: frontend pending-command recovery and verified frontend tests.

No push performed. Only personal `docs/local/developer-profile.md` identity
reconciliation remains uncommitted; no peer or infrastructure files are staged.
Learning remains Git-excluded. The final verification handoff is a separate
documentation-only commit.
