# CHANGE-099: Backend expiry minimum API regression

- Date / requester: 2026-10-10 / Yao Xiang, current approved branch.
- Status: regression coverage verified locally; live deployment not retested.
- Scope: Order creation validation tests and documentation only.

## Existing behavior and user request

The user requests expiry >= current time + 30 minutes on the backend so frontend
validation cannot be bypassed. This behavior already exists: OrderCreationService
passes server Instant.now() to Order.open; MINIMUM_POSTING_WINDOW is 30 minutes.
The domain rejects earlier expiresAt before Supplier validation, Credit reservation,
Order/checkpoint/receipt persistence, or success auditing. Requester verification
still runs first. OrderExceptionHandler returns HTTP 400 VALIDATION_ERROR and
an expiresAt detail. A client cannot supply the authoritative creation time.
Exactly 30 minutes from that server instant is accepted; submitting an expiry
exactly 30 minutes from an earlier client instant can fail due to elapsed time.

Preserve existing minimum validation rather than adding a duplicate controller
check. No new architecture, API shape, broker, peer assumption, frontend behavior,
clock abstraction, persistence migration or deployment change. Manual reposts
retain their same existing minimum; saved automatic plans retain ADR-030's
scheduled-time/late-execution semantics. No ownership reassignment or peer edits.

## Regression coverage and traceability

| Requirement / approved invariant | Implementation | Verification |
| --- | --- | --- |
| F1.1-F1.3 creation; existing server-authoritative 30-minute expiry minimum | OrderCreationService -> Order.open -> OrderExceptionHandler | New OrderCreationExpiryApiTest calls POST /api/orders with past/current/60s/1799s expiry; asserts field-specific 400 and no Supplier/Credit/Order/checkpoint/audit interaction or receipt write |
| Preserve valid creation and fund reservation | Same existing creation path | API test confirms 3600s expiry creates OPEN, reserves credits and saves Order/receipt |
| Inclusive exact minimum | Order.MINIMUM_POSTING_WINDOW / domain validation | Existing OrderFieldValidationTest rejects 1799s and accepts exactly 1800s |
| Manual and automatic repost rules / ADR-030 | Existing Order/RepostPlan/OrderRepostService | Existing field and repost service regressions included in focused verification |

The HTTP test uses the real controller, creation service, domain, mapper and error
handler with mocked provider/repository collaborators. It does not exercise real
Firebase authentication, real Credit/Supplier providers or database persistence.
Their existing independent regression suites remain unchanged.

## Verification evidence

- Existing rule inspected before any change; no production implementation changed.
- Initial focused run: 19 tests, 5 failures in the NEW HTTP fixture, 14 existing
  passes. Diagnostic rerun confirmed missing disabled-repost primitive values
  were rejected by Jackson before domain validation. Corrected fixture to include
  the zero values sent by the frontend; did not change DTO/converter defaults or
  application behavior. This was a fixture failure, not an implementation RED.
- Corrected focused run: 19 passed, zero failures/errors/skips; five new API cases.
  Evidence: target/change099-focused.log. Failed/diagnostic runs retained as
  target/change099-fixture-failure.log and change099-fixture-diagnostic.log.
- No artificial failing production test: the requested rule was already present.
- Fresh copied-source Maven full verify passed: 258 tests, zero failures/errors/skips.
  Existing JaCoCo gates pass: 96.00% lines (1441/1501), 83.72% branches (468/559).
  All 161 current POM/source/test/resource files match the tested copy. Evidence:
  target/change099-verify.log, target/change099-evidence.json and
  target/change099-source-check/target/. Git whitespace check passes.
- Branch/profile and three PDF hashes match. Required scoped context loader read
  records; some large historical tool outputs were truncated. Full historical
  context-completion gate is not claimed or waived.

## Remaining integration gates

No live authenticated local/staging API request, application image rebuild,
commit/push, deployment, real cloud publishing or application data reset.
Existing FEEDBACK-009/peer/browser/cloud and concurrency audit gaps remain outside
this validation task. Sprint stays [~]; passing mock tests is not peer integration.
