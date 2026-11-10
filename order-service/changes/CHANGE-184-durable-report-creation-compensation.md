<!-- AI Assistance Disclosure: OpenAI Codex, 2026-11-10. Durable report-creation compensation change documentation -->

# CHANGE-184 — Durable report creation with rollback compensation

- Status: IMPLEMENTED / staging activation pending
- Approved by: user
- Effective date: 2026-11-10
- Decision: ADR-068
- Requirements: NTH3, NFR3.1.1, NFR3.1.3

## Approved behavior

Report creation uses a browser-generated UUID `submissionId` backed by a durable
Firestore submission journal. Reporting allocates the stable `reportId`, saves
the normalized draft, attachment manifest, and pending active-order reservation
before uploading evidence or placing an Order hold. Reuse with the same canonical
fingerprint resumes or returns the existing result; reuse with different input is
a conflict.

Evidence keys are deterministic from submission, index, and SHA-256. Linked
creation succeeds only when Order has placed the exact hold and Reporting's final
transaction creates the visible report, activates the reservation, and marks the
submission completed. There is no creation roll-forward. A failed/uncertain hold
call, failed final transaction, crashed `HOLD_PENDING` lease, or delayed caller is
fenced and driven through separate creation compensation.

Order serializes placement and compensation through a report-ID lifecycle row.
Compensation may create a cancellation tombstone before placement; later
placement for that report ID is rejected. This prevents a `NOT_FOUND` result from
racing with a late hold commit. Safe compensation results allow Reporting to
remove unused evidence/reservation and mark `COMPENSATED`; mismatches retain the
fence and enter `RECONCILIATION_REQUIRED`.

`RECEIVED` and `EVIDENCE_STORED` submissions with no successful activity for one
hour are rejected and cleaned locally. They never contacted Order. Owner
cancellation, background creation roll-forward, and a hold-query endpoint are
out of scope.

The existing report-resolution saga remains a separate all-or-nothing business
transaction: Reporting resolution and Order hold release either both succeed or
resolution compensation restores the pre-resolution state.

## Contracts

- `CreateReportRequest.submissionId`: required UUID.
- `GET /api/reports/submissions/{submissionId}`: caller-bound journal status.
- `POST /api/reports/submissions/{submissionId}/resume`: retry with fresh caller
  authentication and the same multipart fingerprint.
- Order hold request adds required `submissionId`.
- Events:
  - `ReportCreationCompensationRequested` generation 2.
  - `ReportCreationCompensationResult` generation 2.
- Request ID: name UUID of `ReportCreationCompensationRequested:<submissionId>`.
- Result outcomes: `RELEASED`, `ALREADY_RELEASED`, `NOT_FOUND`,
  `BINDING_MISMATCH`, `RECONCILIATION_REQUIRED`.

## Persistence and migration

- Reporting Firestore collections: `report_submissions` and a creation result
  outbox/inbox as implemented by the journal store. Existing report documents
  remain unchanged until the activation transaction.
- Order migration V20 adds report-creation lifecycles and compensation request
  deduplication. Existing holds and V1–V19 remain immutable.
- The existing generic Order event outbox transports the new request event.

## Rollout

Order migration, lifecycle fencing, consumer, and result publishing deploy before
Reporting creation is enabled. Provision separate versioned request/result topics,
subscriptions, push authentication, Firestore indexes, and the scheduler identity.
Keep production disabled until staging failure/race tests pass. Rollback disables
new creation but preserves lifecycle, journal, tombstone, and outbox history.

## Verification target

Test journal-first ordering, stable replay/fingerprint conflict, deterministic
evidence, one-hour expiry, completion/fence races, uncertain holds, tombstone-before-
placement, placement-before-compensation, duplicate events/results, binding
mismatch, frontend session behavior, OpenAPI/AsyncAPI, migration clean/upgrade,
gateway protection, and existing resolution rollback regressions.

## Implementation learning

An idempotent hold API alone cannot close the timeout race: `NOT_FOUND` can race
with a late placement unless both operations serialize on durable Order-owned
state. The report-ID tombstone is therefore the correctness boundary. The same
principle applies in Reporting: expiry and lease recovery must re-read state and
timestamps inside the transaction, otherwise a stale scheduler query can defeat
a concurrent resume. Endpoint-specific OIDC chains are also required; sharing an
audience while accepting either the Pub/Sub or scheduler account would let each
identity invoke the other's endpoint.

## Implementation and traceability

- Reporting owns the caller-bound Firestore journal, fingerprint, evidence
  manifest, active-order reservation, hold lease, fencing, compensation outbox,
  result inbox, one-hour expiry, and retryable evidence cleanup.
- Order owns the V20 report-ID lifecycle/tombstone, exact-binding hold placement,
  compensation deduplication, conditional release, and durable result outbox.
- The browser owns only the stable UUID and immutable retry input; it cannot make
  a submission durable without Reporting's journal.
- `ReportCreationCoordinator` sequences journal -> evidence -> hold -> activation.
  `ReportSubmissionStore` provides the transaction/revision boundary.
  `ReportCreationLifecycle` serializes Order placement and compensation using the
  same Order-first lock order. The existing resolution coordinator is unchanged.
- NTH3 is covered by stable replay, caller binding, deterministic objects and
  lifecycle tombstones. NFR3.1.3 has positive/negative unit and integration
  scenarios. NFR3.1.1 remains enforced by the existing Maven `verify` gates; the
  complete Docker-backed gate could not run on this workstation.

## Verification evidence

- Reporting non-container suite: 59 tests passed after excluding four explicitly
  Docker-backed integration classes. Focused creation, storage, security and
  OpenAPI tests passed, including fully qualified Pub/Sub configuration startup.
- Frontend: 358 tests across 57 files passed; ESLint and Next route generation /
  TypeScript passed.
- Order/common test compilation and the exact-OIDC creation-push validator unit
  test passed. The remaining Order Mockito runtime tests and PostgreSQL
  migrations could not execute because Mockito cannot self-attach on this host
  and Docker is unavailable; source/migration tests compile.
- Pub/Sub provisioning static suite: 11 tests passed. Compose expansion, JSON,
  YAML, shell syntax and Python compilation checks passed.
- The direct Next production build remained in native compilation without output
  for more than three minutes and was terminated; no browser, cloud, or staging
  failure/race verification was performed.

Production and staging flags remain false. Enabling requires Order-first deploy,
Firestore index deployment, Pub/Sub/schema/IAM/scheduler provisioning, and the
approved staging race/failure matrix.

