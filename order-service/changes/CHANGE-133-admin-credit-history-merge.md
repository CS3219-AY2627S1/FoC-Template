# CHANGE-133 — Merge preservation and selected-user Credit history

- Date: 2026-10-15
- Owner: Yao Xiang, `order-service/penalty-integration`
- Authorization: resolve the current merge and link the completed Credit APIs;
  user explicitly selected the existing profile history only, without a global tab.
- Scope: nine merge resolutions, shared frontend Admin adapter/profile tests and
  Order-owned integration records. Credit implementation is inspected and tested,
  not modified. No deployment, credentials, schema or topic changes.

## Approved implementation

Preserve incoming Admin dashboard and Credit work alongside completion holds,
penalty policy and involvement changes. The OpenAPI MVC slice must include both
sets of controllers and collaborators. Keep the current Yao Xiang branch profile;
retain incoming profile details as history. Remove historical orphan conflict
markers already present in both versions of the AI usage log, preserving entries.

Live Admin profiles use `GET /api/credits/users/{userId}/transactions?page=1&size=20`
through the existing gateway/useApi transport with the signed-in administrator's
Firebase token. Credit enforces `hasRole('ADMIN')`. Keep the one-based page envelope
and existing transaction presentation. Failed/missing-account requests show an
error and retry within the history card; they must not appear as an empty success.
Changing selected user resets pagination and ignores stale responses.

Base Compose retains mock history. HTTP-peer/staging/production use the completed
real history endpoint, with no mock fallback. The system-wide Credit history API
is outside this UI change. Selected-user balance remains Coming soon because no
matching administrative balance endpoint exists. Other unfinished Admin APIs
remain unchanged.

## Traceability and verification

Existing D1 administrator account oversight and ADR-039 environment-selected
providers apply; no new product rule, state transition or event contract.
Credit controller/service/repository contract and security inspected. Four red
assertions preceded implementation: live capability, real route, empty/error
propagation and actionable profile-history failure. Final focused run:45 passed.
An existing history-error assertion was updated to expect the provider message.

- Root `mvnw.cmd -B -ntp -pl order-service -am verify`: common11 + Order427 =438
  tests, zero failures/errors/skips; existing coverage gates pass. The merged
  OpenAPI test covers AdminMock, completion holds, involvement and recovery APIs.
- Credit `mvnw.cmd -B -ntp clean verify`:102 tests, zero failures/errors/skips;
  existing coverage gates pass. Initial non-clean run failed53 context loads due
  to obsolete compiled FirestoreConfig referencing a dependency no longer in the
  source/POM. Cleaning generated output resolved it without Credit source edits.
- Frontend full Vitest:212 tests across39 files pass. Lint:0 errors,3 existing
  unused-variable warnings in login-form.tsx. Production build and typecheck pass.
- Initial full frontend run hit one old error-message assertion; updated it and
  repeated the full suite successfully. No application behavior changed afterward.
- Conflict-marker scan, whitespace checks, TOML key uniqueness and provider-source
  preservation checks recorded in active work. Python/TOML parser unavailable;
  no full TOML-parser validation is claimed.
  Task edits pass whitespace checks; the staged incoming Credit handoff has one
  existing blank-line-at-EOF warning, left unchanged with the provider's source.

Tests use isolated test PostgreSQL/emulator containers and mocked frontend HTTP.
They establish provider behavior plus contract-compatible adapter/UI behavior;
they do not constitute an authenticated browser-to-deployment end-to-end test.
No application containers/data volumes were recreated. No merge commit/push or
deployment performed. Live browser confirmation, missing balance API and human
review remain pending.
