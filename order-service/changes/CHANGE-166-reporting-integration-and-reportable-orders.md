# CHANGE-166 — Real Reporting integration and assigned-order eligibility

Owner: Yao Xiang. Date: 2026-10-29. Branch: feat/reporting-service.

## Approved scope and decisions

The user requested Report frontend linking, the Report implementation of Order's callback-free resolution contract and compensation consumer/result producer, actual Order/Report integration, and GCP topic names. They explicitly approved replacing Admin Reports mocks with real APIs. On identifying an OPEN report acquiring a later courier, the user chose **no reporting of OPEN orders**, rather than rebinding the report's courier. The user then merged main's existing Order integration and requested resolution of the three Report frontend conflicts while continuing the task.

Reportable states are ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED. Keep OPEN in unrelated user/supplier active-involvement checks. SQL filtering and locked hold selection use the same four-state set; both Report categories request an assigned courier. Existing general hold history and explicit admin cancellation rules are not changed.

## Implementation

- Preserve real Report API wiring when merging reports-page/test/use-reports; no sample fallback in any mode.
- Report's Firestore transaction commits resolution, private admin reply, actor/time, preimage, revision and saved decision. Exact retries replay; changed binding/reply conflicts.
- Compensation transaction deduplicates/fences, conditionally restores only the current operation revision, reconciles the original deadline and persists the stable result outbox. A newer revision is retained with RECONCILIATION_REQUIRED.
- Separate verified Google push identities; unsigned push requires explicit local/demo/Auth/PubSub emulator settings. Strict eight-/eleven-field contracts match Order's existing saga; no new Order migration or event schema change.
- Admin frontend warns before early resolution, keeps a stable command/reply for retries, handles 202 as pending and polls Order. Reply is private to submitter/admin. Evidence downloads use authenticated useApi blob responses.
- Filtered Report list/count/pagination are database operations. Bounded response-deadline reconciliation handles each report independently so expired cases become visible to READY_FOR_REVIEW filters without loading all reports.
- Disable the legacy release-first resolution path. Report never releases Order holds directly; Order owns final hold release and failed/uncertain commit recovery.

## Artifacts and traceability

Approved reporting/hold refinement -> ADR-056/059/060/061 -> OrderCompletionHoldController and OrderPersistenceAdapter -> ReportResolutionStore / resolution HTTP and Pub/Sub handlers -> real Firestore, PostgreSQL and actual HTTP/broker integration tests. Related requirements: existing completion/funding atomicity and reporting refinements, NFR3.1 testing and authenticated authorization. No new Project D1 claim or broadened penalty/category behavior is introduced.

Report's new journals/outbox are Firestore collections; existing report documents read missing revisions/metadata compatibly. Order's V18 is imported unchanged from main. Root .env.example and only Report's Compose block document/pass new settings; existing Cloud deployment flags remain disabled. `reporting-service/firestore.indexes.json` requires cloud installation. No User/Credit/Supplier implementation, workflow/skill behavior, GCP resource or application database is changed by this task beyond the user's existing merge.

## Verification

Before main merge, Report53 tests and coverage gates, frontend264 tests, and actual successful/rollback/duplicate two-way Pub/Sub integration passed. After main merge and OPEN exclusion, final verification is in progress. Record final counts/results below after execution; do not treat earlier runs as proof of the final source.

## Rollout and remaining checks

Create request/result topics for dev and prod, configure authenticated push subscriptions/IAM, install Report composite indexes, and enable both services only after cloud validation. Preserve operation/tombstone/result history across rollbacks. Report creation after a confirmed hold but before report persistence is a distinct pre-existing reconciliation case, outside this resolution saga. Full cloud IAM/OIDC and browser visual review are not claimed by local tests.


## Final verification - CHANGE-166 (2026-10-29)

- Full root reactor verify: 666 Order tests plus12 common tests; zero failures/errors/skips; original coverage gates pass (BRANCH 80.98%, LINE 94.86%). Log: order-service/target/report-saga-order-final.log.
- Final Report verify:54 tests, zero failures/errors/skips; fresh coverage gates pass (BRANCH 81.20%, LINE 94.97%); complete opt-in resolution OpenAPI artifact generated. Log: order-service/target/report-saga-release-verify.log.
- Frontend:267 tests pass with --maxWorkers=2; lint, TypeScript and production build pass. A prior unconstrained parallel run timed out four existing map/date/request tests under host load; none are represented as passes, and no unrelated source/global timeout was changed. The first sandbox build could not fetch existing Google fonts; the network-enabled production build passes. Logs: report-saga-complete-frontend-bounded.log / complete-lint / complete-typecheck / complete-build under order-service/target.
- Actual current-branch Order and Report HTTP applications, separate PostgreSQL/Firestore and actual Pub/Sub push pass all six scenario groups: OPEN rejected without an orphan hold, current-snapshot retry and held delivery/completion guard, successful resolution/replay/private reply, forced final Order rollback with duplicate compensation, safe fresh command after compensation, lost Report reply, and compensation preceding a delayed original. Some related checks share a recorded group; evidence: reporting-service/target/live-order-resolution-result.json and order-service/target/report-saga-release-live.log. No resolution/compensation endpoint was replaced with a stub; User/Supplier/Credit adapters are explicitly local mocks.
- Extended harness initially disabled outbox recovery and timed out on a pending immediate-dispatch attempt; enabling the real recovery job makes lost-response/delayed-original scenarios pass. No production scheduler cadence or outbox behavior was changed.
- User approved Report-only gateway protection. Disposable gateway image build/health, eight internal-route HTTP checks (normal/encoded/matrix) and the remaining public proxy path pass via reporting-service/scripts/test-report-gateway.cjs. Local unsigned push remains gated; cloud uses Google OIDC.
- Base and HTTP-peer Compose config checks pass. Context TOML, Report index JSON and resolution OpenAPI schemas validate. No merge markers/unmerged paths remain; working diff whitespace check passes. Containers/processes created by the live/gateway harnesses were removed; no application volume or GCP resource changed.

Cloud IAM/OIDC/subscriptions/indexes, operator retention/dead-letter settings, browser visual review and explicit feature activation remain rollout work. Both saga flags remain disabled by default. Optional normal-Compose automatic Report-topic/subscription wiring was requested for approval and has not been applied; the isolated live harness is fully configured. Report creation after a confirmed/uncertain hold but failed Report save remains a separate pre-existing recovery requirement. No commit/push/deployment was performed by the assistant.
