# CHANGE-140 — Twenty rows per admin table page

Yao Xiang, order-service/penalty-integration,2026-10-17. User requests larger
Orders/Users tables (15 or20 rows), retaining scrolling and pagination. Choose20
for both table list requests in local mock and real Order mode. Fewer matching
records still render only available rows; no empty placeholder rows or min-height.

Implementation detail of the approved admin UI: one shared frontend table page
size, consistent20-row metadata for exact Order searches, existing server totals
and pagination. Supplier card lists remain10 and Credit history remains20; live
User directory remains Coming soon until its provider is ready. Existing mock
User list requests20. No backend/source/schema/API shape/auth/financial change:
existing Order and gated sample APIs accept size20 (max100).

Read current owner/branch/context/PDFs, frontend instructions/current adapter and
Next client guide. Update existing adapter pagination assertions first; run RED,
then focused frontend tests/typecheck/lint. No need to rerun unchanged backend or
build/start peer services. Preserve current stack and unrelated staged changes.

Verification2026-10-17: existing adapter assertions ran RED (3 failed/13 passed), then focused admin adapters/pages/actions58/58 passed after implementation. TypeScript exits0; lint exits0 with3 existing login-form unused-variable warnings. No new test files, backend rerun, container build/browser smoke or cloud check needed/performed for this request-size-only change. Git whitespace check passes; previous work and running stack preserved. Frontend rebuild required for rollout.
