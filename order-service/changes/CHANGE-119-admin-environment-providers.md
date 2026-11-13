# CHANGE-119: Local Admin mocks and partial live Admin UI

- Date/developer: 2026-10-13, Yao Xiang, order-service/admin-dashboard.
- Authority: explicit user approval to retain local mocks and show Coming soon
  sections/value placeholders for unfinished staging capabilities. Existing
  approved Admin NTH prototype and NFR2.1/NFR3.1.3 verification scope apply.
- Workflow/context reloaded; profile/branch match, authoritative PDF hashes
  unchanged, clean starting checkout. Supersedes only the mock-only transport
  restriction of CHANGE-111/ADR-039 outside local; layouts/maps remain intact.
- Runtime ConfigProvider determines transport: local with Auth emulator uses
  existing Order-owned mock routes; every other environment uses real providers.
  No new env variable, backend mock gate change, or mock fallback on live errors.
- Matching interfaces: User role-context (bearer, returned UID/admin checked),
  User summary (existing limited identity/standing projection), Order paged list
  and exact detail, Supplier paged q/status=all list, detail, create and DELETE
  soft deactivation. Existing useApi supplies tokens through the gateway.
- Supplier name search also matches building/location. Exact ID searches adapt
  one detail to a page; only 404 becomes an empty search, never auth/server errors.
- User unpaged/unprotected directory and full profile are unsuitable; do not call
  them or fetch-all/filter locally. Existing summary supports selected-user links
  and UID lookup; missing profile fields remain null and display Coming soon.
- Missing User suspension/promotion/safe deactivation and cross-user Credit APIs
  remain uncalled, with disabled actions, Credit balance placeholders and a
  Credit transactions / Coming soon card. Local sample behavior is unchanged.
- Order labels resolve independently from primary Order loading using existing
  summary/detail endpoints; missing names never hide orders or replace real IDs.
- Failure/security: existing AdminGate and provider authorization stay enforced;
  no fake admin roles outside local, no caller-credit impersonation, no silent
  zero balances, no hard-delete user action. Unsupported adapter calls reject
  without network requests. No peer backend, persistence, broker or IAM changes.
- Test first: live route/method/error contracts, runtime mode selection and
  disabled/placeholder UI; retain existing local prototype regressions. Full
  frontend test/typecheck/lint/build verification planned. Live GCP/browser
  verification remains separate and must not be reported as completed.

## Completed verification

- Observed six live-contract failures before adapter changes and seven runtime/UI
  failures before capability selection/placeholder changes. Existing local
  prototype tests continued to pass. Added seventeen regressions overall.
- Final npm test: 192 tests / 38 files pass, no skips. Mode matrix includes local
  without emulator and staging with a stray emulator URL; both stay live. Live
  non-admin denial, wrong summary identity, unavailable-feature no-call checks,
  real route/method/error mapping and pending-label visibility pass.
- npm run typecheck passes. npm run lint passes with 0 errors and only 3 unchanged
  login-form warnings. npm run build passes for the final production source;
  all Admin routes compile as dynamic routes. git diff --check passes.
- Initial full-suite failure exposed the existing authorization test fixture's
  missing ConfigProvider mock after the hook gained runtime mode selection;
  fixture updated, real staging role denial added and final full suite passes.
  Initial typecheck found null fields in the new SupplierInput fixture; corrected
  to the existing string contract without changing the real API.
- No Order Java or sibling backend change; Maven/backend tests not rerun for
  unchanged code. No Docker service recreation, deployment, Git history change,
  credentials/IAM changes or volume deletion. No new dependencies/env variables.
- Authenticated staging/browser/responsive visual verification remains pending;
  deterministic tests use stubbed transport and do not prove GCP integration.
  ADMIN-API-001..006 remain owning-team work; only matching current APIs are linked.
- Requirements/architecture/integration records, current diagrams, frontend
  source/tests/docs/AI disclosure changed. Wire contracts/backend models,
  workflows/skills and deployment/persistence configuration unchanged.
