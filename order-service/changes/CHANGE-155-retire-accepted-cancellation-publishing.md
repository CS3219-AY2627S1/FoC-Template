# CHANGE-155 - Retire accepted-cancellation publishing

CHANGE-155 (2026-10-19), Yao Xiang: retire accepted-cancellation producer/replay/snapshot types and topic keys/provisioning/CI requirements under explicit cleanup approval. Preserve financial transitions, four current event channels, published history and immutable migrations. Staging user query showed eight PUBLISHED rows only; other deployment databases require backlog checks before rollout. No database/cloud/sibling backend edits; no frontend impact. TDD: bootstrap expectations failed2 cases and retired-event dispatch failed1 case before implementation. Verification in progress; no staging/commit.

## Effective retirement of accepted-cancellation publishing - CHANGE-155 / ADR-053 (2026-10-19)

User approved removing AcceptedOrderCancellationTaskEvent publishing AND legacy replay after inspecting staging: eight legacy rows were PUBLISHED, with no pending/failed rows shown. Preserve published history; this task does not modify any database or GCP resource. Production was not inspected: before rollout, verify no PENDING, IN_PROGRESS or FAILED legacy rows in each target database. Resolve any such rows explicitly before deployment; do not convert them into new score events or mark them PUBLISHED without broker confirmation.

Removed the legacy DTO, publisher/interface, factory/mapper methods, now-unused snapshot DTOs and dispatcher branch. The four current channels remain OpenOrderRefundTaskEvent, OrderCompletionTaskEvent, PenaltyScoreAdditionEvent and PenaltyScoreDeductionEvent. Courier abort still uses synchronous Credit hold/reopen and the existing final addition (plus refund when expired); no lifecycle, hold, penalty policy, idempotency or financial rules change. Historical database rows and immutable migrations remain intact. Other older refund/expiration normalization remains supported.

The retired topic setting is removed from Order config, deployment templates, local Compose/bootstrap, environment examples/staging/production settings, topic provisioning and CI topic checks. These scripts no longer require or create the old topic; they do not delete existing cloud topics or subscriptions. User Service consumes only the new scoring channels. Existing admin-provider authorization requests remain open. AsyncAPI1.3.0 describes four outgoing operations; earlier statements requiring accepted-cancellation replay/configuration are superseded by this amendment.

An unexpected non-published legacy row after deployment is unsupported and follows the existing bounded failure/recovery path, never automatic financial conversion. This is why the pre-deployment backlog check is required. Live User penalty processing, production backlog and cloud deletion are not verified here.


| Traceability | Implementation | Verification |
| --- | --- | --- |
| D1 NTH2 / ADR-041 / user cleanup amendment ADR-053 | Courier scoring only through existing addition/deduction; obsolete event removed | Abort transition event-count regressions and penalty dispatcher tests |
| D1 F11 / consistency | Refund/completion and outbox transactions unchanged; historical rows preserved | Full backend suite, PostgreSQL/PubSub tests and coverage |
| Environment isolation / approved technical cleanup | Four topic settings in Compose/deploy/provisioning/CI | Bootstrap tests, Compose config, shell syntax and stubbed provisioning |

No new API, event payload, table or migration. Legacy snapshot mapping was exclusive to the deleted event; refund/completion compatibility reads saved JSON directly. Unknown-event failure remains isolated per outbox row. Production deployment and GCP topic deletion are outside this implementation.


CHANGE-155 verification: final full reactor verify passed: 531 Order tests +12 common tests, zero failures/errors/skips; coverage checks passed with fresh execution data and no class-mismatch warning. First full run also passed but accumulated old mapper coverage, so only jacoco.exec was backed up/cleared before the final run (no Maven clean). Local bootstrap3 tests pass; base/http-peers/http-peers+local-live Compose config checks pass; shell syntax and stubbed staging/production provisioning pass (four topics each; no live gcloud calls). AsyncAPI checker passes four channels/operations, four DTO field sets, six examples, negative schemas and source/config/cadence parity; initial stale validator/missing example attributes were corrected. AsyncAPI parses and all local refs resolve. Docker foc-order-service:change155-check built; packaged JAR contains no retired event/publisher/snapshot classes; git diff --check passes. Production backlog and deployed User scoring remain unverified. No DB/GCP modifications, app-container recreation, commit or staging.
