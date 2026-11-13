# CHANGE-122: Select Admin providers using the Compose profile

- Date/developer: 2026-10-13, Yao Xiang, order-service/admin-dashboard.
- User explicitly requests base Compose mock Admin endpoints, HTTP-peer override
  real endpoints and staging-equivalent partial UI. Shared Compose/.env.example
  changes are authorized by this request. Workflow/profile/branch match and PDF
  fingerprints unchanged; preserve all previous119..121 work.
- Current base Order backend already selects HTTP peers under ADR-036. This
  change controls Admin UI only, preserving those existing backend peers,
  Pub/Sub/Firebase emulators, local databases and authoritative authentication.
- Add request-time public FOC_ADMIN_API_MODE=mock|live. Base Compose pins mock;
  compose.http-peers.yaml pins live and disables Order-owned Admin sample routes.
  Mock UI is permitted only in local with an Auth emulator. Other environments
  and invalid modes always select live; no cloud mock fallback or new secrets.
- Reuse existing partial live adapter: real Order/Supplier/role/summary endpoints,
  genuine admin role required, unfinished User/Credit capabilities Coming soon.
  Live is against local peer containers through the local gateway, not staging
  databases/URLs. Do not set FOC_ENVIRONMENT=staging for local emulators.
- Frontend/runtime tests first: compose-equivalent mode matrix, invalid/unsafe
  flags, real role check in local-live and local sample preservation. Validate
  base/merged Compose without starting/recreating services; frontend full suite,
  typecheck/lint/build. No peer backend/API/schema/IAM changes.

## Completed verification

- Eleven new tests observed RED before production changes (nine runtime cases,
  local-live hook selection and local-live authoritative admin denial).
- Final full frontend suite:203 tests /39 files pass, no skips. TypeScript and
  production build pass. Lint passes with0 errors and only3 unchanged login
  warnings. Initial fixture missing Next's required NODE_ENV fixed to test;
  subsequent typecheck/build and full test rerun pass.
- Base and merged HTTP Compose config --quiet checks pass using .env.example.
  Resolved JSON asserts mock/live UI flags, disabled HTTP demo controller, local
  environment and unchanged HTTP backend peers. Sandbox initially could not read
  Docker CLI config; authorized read-only validation outside sandbox passes.
- git diff --check passes. No sibling backend implementation, endpoint wire
  contract, persistence, broker/topic, credentials or IAM change. No services
  recreated/deployed or Git history changed. Maven not rerun for unchanged Java.
- Runtime/Compose config, public UI enum, frontend hook/tests, selector diagram,
  architecture/context/requirements/README/handoff and AI records updated.
  Workflow/skill instructions and backend domain models remain unchanged.
- Actual authenticated local-live/staging browser verification remains pending;
  an account with actual User Service admin role is needed in live mode. Missing
  User/Credit APIs retain119 placeholders rather than unverified/mock integration.
