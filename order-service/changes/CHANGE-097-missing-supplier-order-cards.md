# CHANGE-097: Missing supplier references must not hide Order cards

- Date / developer: 2026-10-10 / Yao Xiang on order-service/sprint-1/yx-sprint-2-and-3.
- Trigger: after rebuild, login succeeds and personal Order list returns200 but cards do not appear.
- Classification: implementation detail repairing the existing human-readable Location unavailable fallback; no new architecture, service interaction, contract or authentication decision. Current shared Order frontend slice; preserve CHANGE-092–096.
- Traceability: F2/F8/F9 personal Order views and NFR2/NFR3. USER Requester and USER Courier modes use the same hook; Available Errands also benefits. No role/ownership policy change.

## Evidence and cause

Read-only local PostgreSQL checks show seven current Orders overall; the requester ID supplied by the user owns five (two OPEN, two COMPLETED, one DELIVERED). Its seven distinct supplier references include five missing documents and two existing documents in demo-foc/supplier-local. No account IDs or order descriptions are recorded here. Credit deduction alone was not used as proof of a saved Order.

SupplierController.lookup implements the existing response { items, missingIds }; missing references are a successful, terminal lookup result. useSupplierNames previously indexed only items and required every referenced ID in the names map before ready=true. Missing references therefore kept ready=false indefinitely; My Requests/My Errands/Available Errands hid cards behind skeletons, including cards whose locations were still valid. The card already supports the label Location unavailable.

The hook now adds that existing label for each missingIds entry while preserving labels for actual suppliers. A successful lookup with all references missing also finishes. No changes to Supplier Service, supplier data, order data, credits, API bodies/endpoints, polling, auth, layouts, statuses, topics, scheduler or deployment configuration.

## Verification

- Tests first: three new hook checks, two expected failures (partial/all missing) and one pass (all resolved), target/change097-red.log.
- Final full frontend suite:63 tests across16 files passed, zero failures/skips, target/change097-tests.log.
- ESLint:0errors,12 existing unrelated login/profile warnings, target/change097-lint.log.
- TypeScript tsc --noEmit:passed, target/change097-typecheck.log. No claim of rerunning Next typegen locally.
- Production Docker frontend build passed, target/change097-docker-build.log. Recreated only frontend using existing Compose project/configuration and --no-deps; all database volumes/backend containers retained. Build emitted an existing unrelated orphan-container warning; no orphan cleanup performed.
- Rebuilt frontend healthy; gateway GET /my-requests and /my-errands200,18 referenced static assets per page all200, compiled missingIds/fallback handling verified served on both. target/change097-runtime-evidence.json. These are HTTP/artifact checks, not authenticated browser rendering or responsive visual verification; no CSS/layout changes.
- Earlier unauthenticated /mine diagnostic503 was caused by calling an HTTP-peer verification path without a token; it is not the user's successful authenticated200 response. An optional Firebase account-list diagnostic returned405 and was abandoned. Initial temporary supplier diagnostic JSON aggregation parsing failed and was corrected to jsonb_agg; final document checks succeeded.
- Backend unchanged; Maven/cloud tests not rerun. No staging, commit, push or cloud deployment. Changes remain pending with existing overlapping work.

## Affected artifacts

Updated application path: frontend/src/hooks/use-supplier-names.ts. Added test: frontend/src/hooks/use-supplier-names.test.tsx. Documentation: this record, docs/change-log.md, docs/requirements-traceability.md, docs/current-sprint.md, docs/ai-project-context.md/TOML, docs/active-work/yao-xiang.md, frontend/README.md and ai/usage-log.md. Ignored target diagnostic/test/build artifacts only outside those paths. Existing requirements, API contracts, ADRs, diagrams/data models, workflows/skills and deployment/persistence configuration remain effective and unchanged.

## Remaining limits

Saved supplier references are still missing; this fix displays Order cards without inventing or restoring location data. User should hard-refresh the rebuilt frontend and confirm personal cards. The exact warning URL and authenticated response body were not supplied; the preload warning was not used as evidence of download failure. Live user/browser verification and existing peer integration work remain pending; Sprint remains [~].

## Follow-up: why references can be missing without Supplier code edits

On 2026-10-10, read-only startup logs show Supplier seeded 21 newly created records, zero unchanged records, at 02:49:59Z. FirestoreSupplierRepository.create requests an automatically generated document ID. The CSV has no fixed ID column; seeding normally reuses a persisted natural-key match. A fresh catalogue can therefore have identical names with different IDs while PostgreSQL Orders retain older IDs. Separate firebase-data and order-postgres-data volumes do not ensure coordinated recovery. Emulator reports importing a snapshot, but those logs alone do not prove restoration of the supplier-local database. The specific source of unavailable old records is not established; reset/incomplete restore/namespace differences are hypotheses, not confirmed actions. Mock Supplier validation also does not check actual document existence. No Supplier source, catalogue, configuration, Docker volumes or application code changed during this explanation; no tests/build/restart. The frontend fix handles terminal missingIds but does not restore catalogue identity.
