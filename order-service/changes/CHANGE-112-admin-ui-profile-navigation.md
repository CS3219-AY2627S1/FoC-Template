# CHANGE-112: Admin profile and record navigation refinement

- Date/developer: 2026-10-11, Yao Xiang on order-service/admin-dashboard.
- Authority: user explicitly requests these Admin UI refinements, retaining
  CHANGE-111 / ADR-039 mock-only integration and scope. D1 admin user/supplier
  administration and Order read projections retain their existing traceability.
- Workflow: parent/Order/frontend instructions, spec-driven development skill,
  all mandatory context/ADR/sprint records rehydrated; developer/branch agree.
  Source PDF hashes unchanged; existing uncommitted CHANGE-111 work preserved.
- Approved design: equal-height, bottom-aligned search/filter controls; only
  mode switching in the header; existing SupplierBadges reused. Order fields
  occupy separate columns; description remains in View details. Names link to
  /admin/users/{userId} and /admin/suppliers/{supplierId}; dedicated detail loads
  do not depend on a current list page. Unknown records show retry/back controls.
- Users render a full in-tab profile using normal Profile Card patterns and
  shared transaction-history presentation. Copy UID, suspension, promotion and
  confirmed deactivation remain. Profile/history load failures are independent;
  stale responses cannot replace a newly selected record.
- API design: local GET /api/orders/admin-mock/users/{id}/transactions with
  one-based page/size and existing Credit TransactionPageResponse wire fields.
  Order-owned sample DTO/service/controller only. Current Credit endpoint is
  GET /api/credits/me/transactions, verified caller-only; admin other-user
  history is MISSING and documented as ADMIN-API-006, not integrated.
- No actual peer mutation, persistence migration, auth or cloud/config change.
  Safe detail layout refinement under ADR-039; mocks remain local opt-in only.
- TDD evidence: new frontend assertions failed for profile popup, record links,
  supplier status and header menu; backend history test failed before endpoint
  implementation. Both went green after the approved changes.
- Verification:154 frontend tests/32 files pass, including deep links, selected
  IDs, history pagination/failure isolation and ignored late profile responses.
  Normal Profile history tests remain green. TypeScript passes; lint0errors and
  three pre-existing login warnings. Eleven focused API/OpenAPI tests and full
  Maven verify380 tests pass with no failures/errors/skips; coverage gates pass.
  Docker builds include Next production build and both new dynamic routes.
- Runtime: only frontend and Order containers recreated; no dependency restarts,
  volumes removed, real data mutations or peer backend writes. Both containers
  healthy; gateway selected-user/location routes200, unauthenticated history401,
  and runtime OpenAPI includes the new mock operation. git diff --check passes.
  No Git staging/commit/push.
- Remaining: browser inventory unavailable, so authenticated/responsive visual
  confirmation is pending. Real administrative integrations stay outside this
  sample milestone, including new ADMIN-API-006.

Affected artifacts: requirements/product amendment records changed; API
contracts/integration handoff changed (mocks only); architecture decisions and
diagrams/sample data projections changed; source/tests/documentation/indexes/AI
disclosure changed. Development workflows/skills and deployment/persistence/
infrastructure configuration unchanged during this refinement.
