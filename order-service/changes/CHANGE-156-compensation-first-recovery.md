# CHANGE-156: Compensation-first Order recovery (fixture milestone)

- Date/developer: 2026-10-26 / Vincent.
- Branch: feature/vincent-credit-compensation, from main 704143715241a4d6ae15cf2ecb9f5ae34382e744.
- Status: APPROVED contract-fixture milestone; actual Credit integration BLOCKED.
- Approval: Vincent requests compensation rather than forward retry, selects safe
  restoration of the previous assignment for ABORT, and explicitly approves Order
  implementation against contract fixtures with live compensation disabled until
  Credit is verified. No sibling backend edits/cloud provisioning authorized.

## Required design gate

Current sprint: current Sprint 2-3 lifecycle/recovery work, not whole-Sprint completion.
Feature: compensation-first recovery for RESERVE, ASSIGN_COURIER, CLEAR_COURIER.
Project D1 references: F1 creation, F3 acceptance, F11 courier abort, F13 concurrency;
NTH4 manual repost; reliability/security/testing NFRs retained.
Relevant amendments: ADR-025/033/035/036/037/038; ADR-050/052/053 current hold,
penalty and event behavior retained. ADR-054 adds an opt-in fixture protocol.
Relevant FRs: reserve before OPEN; eligible non-owner acceptance; ACCEPTED-only
abort; stable candidate and one linked repost; no conflicting transition while unresolved.
Relevant NFRs: durable intent, no duplicate financial effects, bounded peer calls,
backend ownership/authentication, retained failure evidence, meaningful tests.
Relevant sequence diagram: ADR-054 and concurrency/compensation-workflow-handoff.md.
Relevant class diagram: OrderCommandService -> OrderCompensationWorkflow ->
OrderCompensationJournal -> PostgreSQL/outbox; existing gateway for initial effect;
CreditCompensationPublisher boundary for broker publication; result inbox journal.
Relevant service contracts: credit-command-v1 remains current live contract;
proposed credit-compensation-v1 is fixture-only until FEEDBACK-017 verified.
Actual peer-service APIs inspected: actual Credit controller/command service/store/
V6/tests/security/push consumers; User role/eligibility GET; Supplier POST validate.
API mismatches or gaps: no Credit compensation consumer/result publisher/outbox;
no missing-command tombstone creation; CLEAR_COURIER deliberately cannot reverse.
Affected backend components: commands/store/scheduler/outbox dispatch; new journal,
workflow, message records and migration V15; automatic legacy repost fail-closed.
Affected frontend components: existing pending/status/discovery UI; no new layout.
Frontend directory and structure inspected: ../frontend Next16 App Router; existing
hooks/use-order-command, discovery/notice, API/auth/permissions and current tests.
Affected application role and USER mode: USER Requester/Courier, existing backend
authorities/identity checks; no ADMIN grant or new user bypass.
Desktop and mobile-web behavior: pending/disabled while compensating; existing
status polling completes REJECTED only after confirmed reversal/fencing.
External services involved: Credit; Google Pub/Sub; read-only User/Supplier validation.
Data owned by Order Service: commands, final local writes, compensation intent,
outbox and received result inbox. Credit owns all financial reversals/pre-images.
Data owned by other services: balances/reservations/assignment revisions; identity,
eligibility and supplier availability remain provider-owned.
In-scope behavior: initial synchronous call, atomic local finalization, compensate
unknown/failed-finalization, fenced scheduler and duplicate result handling.
Out-of-scope behavior: real peer consumer, Google OIDC push receiver/provisioning,
automatic repost delegation, penalty/report changes, editing applied migrations.
Assumptions: fixture messages model the explicit documented peer contract, never
prove provider correctness. No broker or token assumptions enable HTTP mode.
Open questions: peer implementation/verification and live transport/auth rollout.
Detailed design approval status: approved fixture scope and safe ABORT reversal;
concrete minimal contract and safety rules recorded in ADR-054/handoff.
Interaction decisions awaiting approval: none for fixture milestone; live activation
requires actual peer verification and separately reviewed authenticated transport.
Tests to write first: success/local rollback/timeout/definite rejection/no replay;
live gate; PostgreSQL late commit vs compensation, tombstone/outbox/inbox duplicates.
Files expected to change: recovery classes, outbox dispatch, V15, focused tests,
existing context/traceability/change records, handoff and AI disclosure.

## Verification

At task start, D1 and selected Overall PDF SHA-256 match recorded fingerprints.
Detailed RED/GREEN and runtime limitations will be recorded after execution.
No claim of actual-provider, staging, cloud or entire feature completion.

Executed evidence: RED compile for absent workflow/journal; corrected one fixture
method-arity error; final focused run60 tests passed, zero failures/errors/skips
(target/change156-final-unit.log). Includes new workflow6/journal9/outbox2 and
existing gate/controller/security/service/domain/OpenAPI regressions.
Additional RED/GREEN: duplicate semantic result with a new delivery event ID
initially repeated finalization (target/change156-duplicate-red.log). An already
FULLY_COMPENSATED command now records inbox evidence without repeating local
failure auditing; final regression passes.
PostgreSQL suite attempted but initialization failed: no valid Docker environment
(target/change156-postgres.log). Ten real-PostgreSQL/fixture-Credit scenarios are
written and compile, not verified. New frontend compensation regression cannot run
without Node/npm; temporary portable-runtime attempts were stopped without a
global installation. Full verify/coverage and real-provider/live gates remain [~].
No peer/common/Compose/CI diff; no user/staging/cloud data changed. Initially left
uncommitted pending required runtime verification and provider review. Vincent
explicitly requests committing this partial fixture milestone on 2026-10-26:
`00b85a6` implementation/V15/backend tests, `04ff3e0` frontend regression and
`038e846` shared environment example. Documentation and disclosure follow as
separate units. The feature remains [~]; no push or live activation is implied.

Design refinement: V2 outbox has an Order FK, so a failed CREATE cannot use its
candidate ID there. V15 retains the existing FK for lifecycle events and adds a
command FK/reference check for compensation events; no phantom Order or relaxed
financial identity check. Entity mapping permits the command-owned null Order
reference. This implements the approved durable-precreation intent requirement.

Verification follow-up2026-10-26: CHANGE-157 corrects the integration fixture's
unsupported messaging mode and isolates only broker transport. All11 PostgreSQL
cases and2 configuration regressions pass. Full common12 + Order562 verify and
original coverage gates pass with fresh data (94.73% LINE/81.02% BRANCH).
See CHANGE-157 for RED/GREEN and shutdown-warning details. Actual new Credit
compensation integration remains FEEDBACK-017; no live activation is implied.
