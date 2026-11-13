# CHANGE-107: Retire the unused expiry HTTP trigger

- Date / approver: 2026-10-11 / Vincent, explicit removal request.
- Classification: approved API-contract retirement; lifecycle behavior unchanged.
- Status: source implemented and focused automated verification passed;
  deployed runtime/overall Sprint completion not claimed.
- Decision: ARCH-EVO-043, narrow supersession of ADR-036's optional local expiry
  trigger only. Preserve historical records and every repost-related route.

## Approved design and scope

Remove only OrderController's expiry HTTP handler and its OpenAPI operation.
OrderLifecycleScheduler still calls LifecycleProcessingService.expireDue directly
each minute, after eligible command recovery and before 48-hour completion.
Per-order locking, pending guards, transactions and atomic refund outbox persist.
Retain order-by-ID, legacy repost configuration, manual draft, manual repost,
durable manual repost, internal automatic repost, token check and configuration.
No browser uses the retired route; no tracked runtime script invokes it.

Alternative considered: retain the optional immediate local operator trigger.
Removing it reduces unused API surface but loses that manual HTTP shortcut.
No new event, peer API, financial policy, credential or database design involved.

## Pre-implementation gate

Current sprint: Sprint 2-3, current-sprint.md.
Feature: unused expiry HTTP API retirement; scheduled expiry retained.
Project D1 references: F4.1.8 / F10 expiry, NFR3 testing, NFR4 access boundary.
Relevant amendments: ADR-013/019/025/026/034/036; explicit current removal approval.
Relevant FRs: due unaccepted OPEN becomes EXPIRED; refund intent retained.
Relevant NFRs: NFR3 regression/coverage, NFR4 reduced external mutation surface.
Relevant sequence diagram: updated-overall sequence-6-cancel-open-order.md.
Relevant class diagram: Sprint 2-3 lifecycle/scheduler class model.
Relevant service contracts: current internal expiry trigger superseded only.
Actual peer-service APIs inspected: no new foreign API; existing refunds unchanged.
API mismatches or gaps: none introduced; earlier automatic/peer gaps unchanged.
Affected backend components: OrderController and controller/OpenAPI regressions.
Affected frontend components: none; no callers found.
Frontend directory and structure inspected: shared frontend App Router, hooks,
  Order cards/actions/repost controls, package/Next config, auth/API/tests/diff.
Affected application role and USER mode: none changed.
Desktop and mobile-web behavior: unchanged.
External services involved: no new integration; existing Credit refund unchanged.
Data owned by Order Service: lifecycle/order/outbox unchanged.
Data owned by other services: unchanged; sibling source remains read-only.
In-scope behavior: retire HTTP mapping/OpenAPI; retain direct scheduled expiry.
Out-of-scope behavior: all repost routes, UI, peers, schema, infrastructure.
Assumptions: none about peer support or deployment.
Open questions: none for the approved scope.
Detailed design approval status: approved by Vincent before tests/code.
Interaction decisions awaiting approval: none.
Tests to write first: removed path absent from generated OpenAPI and HTTP routing;
  assert all repost routes remain; rerun scheduler/refund regressions.
Files expected to change: controller, API tests, current docs/context/contracts,
  traceability/change/evolution/active work and required AI disclosure.

## Verification and handoff

Source/test commit: 4bbc4fe. Documentation/disclosure is a separate concern.

RED: OpenApiDocumentationTest ran 4 tests, with 2 expected failures before
implementation (route still documented/handled). First post-change run identified
an assertion using {originalId} instead of the actual {id} Swagger placeholder;
corrected that test without changing the retained route.
GREEN: 40 tests, 0 failures/errors/skips, across OpenApiDocumentationTest,
OrderControllerCoverageTest, OrderLifecycleSchedulerTest,
OrderExpiryProcessingServiceTest, LifecycleFailureIsolationTest,
LifecycleTransactionIsolationTest and OrderApplicationServicesTest. Maven reports
BUILD SUCCESS; the PowerShell stderr-filter pipeline returned exit1 despite that
success, so the actual Surefire XML/results were independently inspected.
Generated target/openapi.json has no expiry path and retains all five repost
paths. D1 and Overall PDF SHA256 match the recorded authority hashes; no drift.
git diff --check passed. No schema migration, frontend/peer/config change needed.
No full suite/coverage rerun or Docker/cloud rollout was performed for this narrow
adapter removal. Existing Sprint/rollout/human and workflow-format blockers remain.
Rebuild/redeploy Order to update an already running Swagger UI. Local learning
notes remain in the existing ignored learning directory.
Rollback: restore the handler and matching tests/docs in a reviewed change;
do not change scheduler or financial event contracts.
