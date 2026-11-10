# CHANGE-187 - Explicit admin links/copy controls and Report review

Approved Yao Xiang, 2026-11-10, hfix/penalty-event-ordering: implement the previously
proposed ID/navigation convention and check whether the earlier Report issues remain.
Existing CHANGE-185/186 work is preserved. Context/D1 hashes and active developer
remain unchanged; root/frontend rules apply, Reporting has no nested AGENTS.md.

Admin frontend: shared CopyId renders non-clickable ID text plus a separate labelled
copy icon. Optional href renders an underlined navigation link with an internal arrow;
copy never triggers navigation/row selection. Preserve complete clipboard values,
existing aria labels, truncation and readable full IDs. Shared AdminRecordLink marks
actual profile navigation visibly. User profile opener stays a button with the same
underline/arrow cue. Supplier names link to existing supplier details.

Report Order summary becomes a section with an explicit Order ID link to the filtered
Orders table and an independent copy icon, preserving data/order-first layout. No new
API, route, dependency, font/colour scheme, auth or backend business change.

Review scope (read-only backend): resolved active-report reservation reuse; concurrent
retry upload rejection during another hold placement; direct participant-created hold
without trusted Reporting submission proof. Verify code paths and relevant isolated
tests, distinguish fixed behaviour from stale physical reservation state, and report
remaining bugs with evidence. No live data, GCP, Report backend fix or deployment.

Verification: RED copy text/icon separation and linked-ID behaviour; link/copy Report
case integration; existing Admin Users/Orders/Suppliers tests; full frontend tests,
lint/typecheck; isolated Firestore review probes. Browser verification if available.

## Implementation and verification

AdminRecordLink and CopyId in frontend/src/components/admin/admin-ui.tsx separate
navigation and copying. Copy text is no longer a button; the icon copies the full
ID and stops row-selection propagation. Native keyboard/link/button semantics,
accessible labels, truncation, theme and readable titles remain. Copy feedback is
bound to the copied ID, so another record does not inherit its checkmark.
ReportOrderSummary is a section with an explicit filtered-Orders link; profile names
and Supplier titles use underlined navigation with an internal arrow. User-table
names retain their existing inline-profile button behaviour with the same visual cue.

Three new assertions failed before implementation. Final: 363 frontend tests across
58 files pass; full lint and Next route generation/TypeScript pass. Initial unrestricted
frontend workers lost their IPC channel under resource pressure; rerun with two workers
passes. 29 focused identifier/report/admin-action tests pass. Browser/mobile visual
and deployed checks were not run; no Docker application rebuild/restart was performed.

Backend review: 23 isolated Firestore/coordinator/resolution checks pass, including
two temporary deterministic probes. The probe's source is retained in ignored
target/report-review-probe.java and reports in target/report-review-tests.log; its
temporary Reporting source/compiled class were removed after hash/ownership checks.
No Reporting/Order production source, running reports, holds, scores or GCP changed.

## Reporting findings on the current branch

1. **Fixed: a resolved report's old reservation blocking a new submission.**
   ReportSubmissionStore.reserve (355+) reads the previous report and permits
   replacement when its status is RESOLVED. The raw slot can still say ACTIVE;
   this is not the eligibility decision. Existing resolvedActiveReservationAllowsANewReportForTheSameOrder
   and a probe using actual ReportResolutionStore.resolve both pass. No reservation
   inactivation/backfill is required to fix this already-correct behaviour.

2. **Still present: stale upload failure can reject another retry's in-flight hold.**
   ReportCreationCoordinator.submit's upload catch calls rejectPreHold.
   ReportSubmissionStore.rejectPreHold (344+) accepts HOLD_PENDING without an
   upload-attempt/phase fence. Reproduced: begin -> evidenceStored -> acquireHoldLease
   -> stale rejectPreHold => REJECTED; no compensation outbox and no expired-hold
   recovery candidate after the lease deadline. If the other request returns, its
   failed activation can schedule compensation; if it crashes after Order committed,
   the terminal REJECTED journal is not recovered as an uncertain hold. Proposed
   owner fix: distinguish upload rejection from definitive Order rejection; use
   expected pre-hold phase/revision or attempt ownership, preserving an existing
   HOLD_PENDING lease and evidence. Add concurrent-upload plus crash/recovery coverage.

3. **Still present by code inspection: a hold can be placed without Reporting.**
   OrderCompletionHoldController.place (69+) authenticates the participant token;
   OrderCompletionHoldService.placeActive (64+) verifies role/order ownership and
   registers caller-supplied report/submission IDs. It does not verify Reporting
   identity, a signed proof or a real submission journal. A valid participant can
   therefore call the public endpoint directly and create a hold with no Report to
   resolve. No exploit was executed against application data. Proposed joint fix:
   require trusted Reporting identity/proof bound to order/report/submission/reporter,
   while retaining the current delegated user and ownership checks.

Backend fixes were not requested or implemented; pending requirements are recorded
in docs/peer-service-api-feedback.md. These findings concern this working branch,
not an independent verification of the deployed GCP revision.

| D1 reference | Requirement | Implementation/review | Test | Result |
| --- | --- | --- | --- | --- |
| NTH1 | Clear Admin case navigation and identity controls | Shared AdminRecordLink/CopyId and report section | 363 frontend tests; lint/typecheck | Passed locally |
| NFR3 | Report submission/resolution reliability | Existing reservation and submission state machines reviewed | Actual resolution/reuse and stale rejection/crash interleavings on Firestore | Reservation fixed; retry bug reproduced |
