# CHANGE-131: Complete D1 courier penalty mapping

Owner: Yao Xiang, order-service/penalty-integration, 2026-10-15.
Approved scope: user requests every D1 nice-to-have penalty case in the existing
shared enum. No Report/User implementation, authentication or deployment change.
Context/profile/branch agree; all three source PDF fingerprints unchanged.

## Exact source and mapping

Project-D1.pdf NTH2, PDF37-39, and NTH3 PDF40-41 were read completely. PDF39's
penalty table was rendered and visually checked. Existing approved ADR-041/043
values are retained; no additional score needs invention:

| Shared case | Amount | Meaning |
| --- | --- | --- |
| ACCEPTED_TASK_CANCELLATION | 2 | Addition, cancellation without accepted reason |
| OVERDUE_DELIVERY | 1 | Addition, missed required deadline |
| SUCCESSFUL_DELIVERY | 1 | Deduction, successful errand without confirmed complaint |
| WRONG_LOCATION_DELIVERY | 4 | Addition, confirmed wrong delivery location |
| ITEM_MISHANDLING_OR_DAMAGE | 4 | Addition, confirmed mishandling or damage |
| DELIBERATE_ITEM_RETENTION_OR_THEFT | 10 | Addition and D1 permanent suspension requirement |

All enum amounts remain positive. The three new cases describe misconduct
confirmed by an administrator, not merely an unverified report. No new publisher
call, reason selection, DTO field, event schema/topic, endpoint or automatic
report resolution is introduced. Existing Order flows still emit their original
three reasons. Their contract test must enumerate those actual flows rather
than assume every future shared reason is an implemented Order publication.

D1 NTH2 also requires one highest effective penalty per errand; a score of10
causes a month suspension, theft causes permanent suspension, and successful
completion without confirmed complaint deducts once. These are future scoring/
report-resolution responsibilities, not enforced by a constant-to-amount mapping.
Current User suspension remains TODO; it does not gain enforcement here.
Existing ADR-025/041 abort/completion behavior is not silently rewritten.
FEEDBACK-014 must hand off these limits before report integration. No new
negative amount or arbitrary penalty case is added.

## Verification plan

Extend the common CSV contract with three D1 rows and run RED before adding enum
constants. Then common and existing Order event contract/publishing/retry tests;
unchanged seven-field JSON, reason/recipient/ID semantics. Existing Order tests
must continue to cover only actual automatic flows. Full reactor verify retains
80% gates; AsyncAPI YAML/refs stay unchanged. No frontend/schema/cloud action.

## Completed verification and limits

- RED: common test run7 cases,3 errors for the three absent D1 enum names.
  Initial PDF launcher was unavailable in the sandbox; authorized local Python
  reader/rendering succeeded. PDF39 table checked visually, source hashes match.
- GREEN: full root wrapper -pl order-service -am verify passes common7 and
  Order420 =427 tests, zero failures/errors/skips. Both original80% gates pass:
  common7/7 lines (no branch counter); Order2120/2231 lines,892/1114 branches.
  Known Surefire fork shutdown timeout logs after all420 tests; final reactor
  BUILD SUCCESS. No threshold/exclusion or production Order-flow change.
- Existing event contract test explicitly enumerates the3 automatic reasons
  instead of treating every shared reference-data case as a live publication.
  Existing publishing/retry/idempotency tests remain green. New3 cases tested
  as policy lookup only, not reported as integrated consumers or Report flow.
- AsyncAPI schema/reference/topic validation and git diff --check pass. No
  AsyncAPI/HTTP DTO/topic configuration changes. No frontend work/tests repeated.
- No peer backend/auth/schema/build-infrastructure/cloud changes in this task,
  application image rebuild/recreation, score mutation, commit or deployment.
  Earlier CHANGE-127/128/129/130 changes remain preserved and unstaged.
- Local evidence: ignored target/change131-red.log, change131-verify.log and
  change131-pdfs/d1-page39.png. D1 source PDF remains unchanged.
- No extra penalty amounts were needed. D1 highest-effective-per-errand,
  one-month threshold suspension and permanent theft suspension remain future
  User/Report enforcement; report confirmation and consumer schema integration
  are not supplied by this shared enum. Hosted CI/human review remain pending.
