# CHANGE-085: Authenticated polling and semantic repost failure messages

- Owner/date/branch: Vincent / 2026-10-09 / `sprint-2-3`.
- User requests application implementation of ADR-027 and a service-classified
  rewrite of peer feedback. Follow-up explicitly PAUSES ALL background retry
  implementation until peer authorization is agreed. Credentials remain docs only.
- Scope: Order-only HTTP error interpretation; existing shared Order pages,
  credit hook, new polling helper/tests, manual repost UI; no peer source changes.
- Status: IMPLEMENTED / LOCALLY VERIFIED; background retry scope PAUSED.
  NTH4 failure UX, F2/F8/F9 status/history refresh, existing
  credit invalidation and NFR2/3/4 conventions. No feature completion upgrade.

## Implementation refinement

Use a shared browser hook at 15 seconds with authentication readiness supplied
by existing useAuth/useApi, hidden-tab pause, focus/visibility refresh, no overlap
and AbortController cleanup. Order pages retain cards on background refresh and
ignore aborted responses. Credit retains mutation-triggered refresh and rejects
stale owner responses. No shell/auth redesign, new package or real-time broker.
The interval is a conservative configurable hook default within the documented
10-15-second recommendation, not a new product timing guarantee.

Preserve Credit's explicit semantic INSUFFICIENT_CREDITS error through Order's
existing error envelope. Never infer it from any 409 or error text. RepostControls
shows a short in-card message for the current manual attempt and leaves the
EXPIRED order intact; permanent auth/details/conflict errors do not auto-retry.
No durable auto-repost failure/task schema is implemented while that background
work is paused; a full page reload does not preserve a client-side failure message.

User explicitly authorizes replacing peer feedback rather than append-only
history. The earlier approved text remains in Git (CHANGE-084 commit c993591).
Current handoff groups missing Credit APIs/consumers, User consumers, Supplier
auth extension, and a separate deferred credentials section. No provider-owned
contract is falsely labelled implemented/agreed.

## Test plan and boundaries

Write failing timer/auth/hidden/overlap/cleanup tests and semantic Credit conflict
tests first; component tests for insufficient/permanent short message, no success
mutation on failure. Run frontend tests/lint/typecheck/build and backend verify
with existing coverage gates/isolated databases. Document unavailable live peers,
browser/cloud separately. Original PDFs/PNG, migrations and deployment unchanged.

## Observed verification and atomic source commits

- TDD red: missing polling-hook import and two new RTL error assertions failed;
  two semantic adapter cases failed with raw HTTP exceptions instead of
  OrderProblem. Minimal implementation then made focused tests pass.
- Final current-source Java 21 suite: **170 tests, 0 failures/errors/skips**,
  including isolated PostgreSQL upgrade/history/pagination/outbox tests.
  Fresh JaCoCo (append=false): **1273/1362 lines = 93.47%**, **386/464 branches =
  83.19%**. Unchanged 80% thresholds pass.
- Regular mvnw verify passed. Windows clean verify failed deleting pre-existing
  target/maven-archiver metadata. Clean partly removed generated outputs; final
  verify explicitly selected ALL current src/test/java *Test.java classes and
  disabled JaCoCo append, avoiding stale retired compiled classes/reports. This
  is not deletion/skipping of a current test or a lowered gate. Old XML report
  totals were not used as final counts.
- Frontend **45 tests / 15 files**, lint (0 errors, 12 existing login/profile
  warnings), typecheck and production build pass. Corrected the page-test server
  mock to return the successfully linked repost on immediate refetch; final test
  run has no act warning. Build warns of an external home package-lock, unchanged.
- D1 and selected overall SHA256 match recorded fingerprints using actual
  ../../ paths from repository root. Historical ../../../ path labels and absent
  Updated PDF remain known manifest limitations; no originals/hashes rewritten.
- Generic check_source_drift.py rejects the existing reference-table columns.
  verify_gate.py reports five existing record-shape/history blockers (missing
  standardized traceability columns/IDs and historical active-work completion
  lines). These are FAILURES, not successful completion gates; manual record/
  source review and TOML/JSON/patch checks supplement, not silently replace them.
- Live peer consumers/ledger outcomes, authenticated responsive browser checks,
  Cloud Run scheduling/IAM and hosted CI not performed. No container/app database
  reset, peer source or cloud write. Sprint remains [~].
- Commits: 4609abc backend errors; b60f74d authenticated polling; 826dea9 manual
  failure UI. Learning is ignored and never staged.

## Persistent chain and rollback

ARCH-EVO-030 and ADR-027 follow-up distinguish this implemented UI slice from
paused retries. Context MD/TOML, current sprint, Sprint 2-3 class/sequence notes,
contracts, diagram gap labels, traceability, change log, active work and AI
disclosure are synchronized. Peer feedback replacement is user-authorized;
earlier text remains in Git. No schema/event/API DTO change, new package, mode
switcher or credential protocol. Revert these source concerns independently to
restore foreground-only loading/raw error handling; no database rollback needed.
