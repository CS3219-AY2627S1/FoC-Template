# CHANGE-162 — guarded Report resolution saga

Date2026-10-29; owner Yao Xiang on order-service/admin-ui-linking. User explicitly approved the guarded contract-stub saga, durable journal/inbox migration, extra command/event/admin IDs and fencing generation, authenticated result and configurable topics. Live integration disabled; Report Service absent. No sibling backend or GCP resource changes. Existing CHANGE-159–161 work is preserved.

## Problem and approved design

D1 report investigation holds must not release funding before the resolution decision is durable. A Report HTTP update and an Order commit are separate transactions. A rollback callback alone cannot survive process failure, and a broker publication ACK cannot prove a peer restored its state. Four record IDs identify a case, but not a unique operation, duplicate delivery or stale worker.

Order commits a bound PENDING command/lease before synchronous callback-free Report resolve using admin Firebase auth and reply. A separate possible_effect commit precedes HTTP. A matching APPLIED response permits one short locked transaction: release this report hold, preserve other holds and save SUCCEEDED/immutable response atomically. No DB lock spans HTTP and no bearer token is persisted. Exact successful retry reuses result.

Failed/uncertain local success rereads the journal and commits generation2 compensation plus existing outbox intent separately. Confirmed local success is terminal, including lost responses. Existing after-commit publication/retry/FAILED/redrive machinery is reused. Only a bound authenticated committed Report result updates the inbox/journal to COMPENSATED; conflicts remain held for reconciliation. Recovery shares the existing minute scheduler, selects at most20 due IDs in SQL and commits each independently. No whole-batch transaction/new timer. Manual release is guarded by persisted unresolved journals even after feature disablement.

## Source and contracts

- `application/reportresolution/`: message records, HTTP/publisher ports, orchestration, transactional journal and unconditional release guard. Report owns conditional preimage restoration, revision conflict checks, deduplication, stale-generation tombstones and result outbox.
- `adapter/`: actual synchronous RestClient and Pub/Sub publisher behind the feature flag. Broker messages contain no admin reply/token.
- Admin POST `/api/orders/admin/{orderId}/reports/{reportId}/resolve`, GET `/api/orders/admin/report-resolutions/{commandId}`; dedicated authenticated receiver `/api/orders/internal/report-resolution-compensations`. Existing direct-release HTTP route409 while enabled.
- New additive V18 Report journal/inbox; old migrations unchanged. Existing Credit command schema/policy and lifecycle event schemas unchanged.
- Configuration only in Order application.yaml and shared .env.example. Defaults disabled; suggested request/result topics `report-resolution-compensation-{local|dev|prod}-v1` and `report-resolution-compensation-result-{local|dev|prod}-v1`. No provisioning/deploy activation.
- Exact proposed payloads/errors/activation/sequence: [Report handoff](../docs/report-servicehandoff.md); [ADR-059](../docs/decisions/ADR-059-report-resolution-compensation-saga.md); AsyncAPI1.5.0.

Existing progress/funding/penalty/explicit admin-cancel behavior remains. No frontend changes in162; local sample Reports/cloud Coming soon remain. Ready User/Credit links from159–161 stay intact. D1 traceability: report investigation funding hold (NTH), atomic local state, NFR3 testability/idempotency/recovery and NFR4 integrity.

## Verification record

Regression-first migration tests failed before V18, then passed clean schema/17→18 upgrade. Initial focused tests: PostgreSQL/HTTP/outbox saga9, migration2, unit contract4 and security2 pass. Full first run661 Order tests found two obsolete schema/foreign-key assertions and a clock-sensitive publication fixture; corrected expectations18/seven FKs and explicit past due time. No business rule changed for these fixture corrections. Final verification results are appended after completion; no actual Report provider or cloud OIDC/IAM integration is claimed.

## Rollout limits

Feature must remain off until Report implements and verifies the proposed protocol and GCP resources/security/monitoring exist. Preserve all pending journals/holds/outbox on rollback and reconcile; do not use an older binary lacking release guards with pending work. A contradictory/newer Report revision is not automatically overwritten. FAILED publications require explicit operator redrive with the saved identity; reconciliation requires investigation. Report consumer/durable restore implementation is intentionally not fabricated in this repository.


CHANGE-162 final verification (2026-10-29): native full Order/common Maven verify exit0,661 Order +12 common =673 tests, zero failures/errors/skips, unchanged coverage gates pass (Order94.65% LINE/80.67% BRANCH). After final OpenAPI parameter annotations, targeted10 contract/security/OpenAPI tests pass; strengthened PostgreSQL saga9 tests pass, including explicit PUBLISHED-before-rearm and stable compensation identity. Fresh foc-order-service:change162-check image builds exit0. Isolated fresh-image smoke health200/schema18 and default-disabled resolve/status/result routes absent from OpenAPI; temporary test containers/network removed. Both Compose configurations validate. AsyncAPI1.5.0 validates8 channels/operations,8 DTO sets/11 examples and negative/source/default/topic parity; context TOML valid; git diff --check and conflict scan clean. Initial full-run failures were two schema/FK expectations and host/DB due-time test skew, corrected. Host Python unavailable, so Python checks used read-only disposable containers; initial inline TOML invocation had Windows quoting failure, corrected with a script. No frontend/sibling production change in162, app-data/GCP mutation, deployment, staging or commit. Real Report restore/fence/result delivery and cloud OIDC/IAM remain unverified; integration defaults disabled.
