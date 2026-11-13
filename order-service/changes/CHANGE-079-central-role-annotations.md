# CHANGE-079: Central role annotations and User Service verification

- Date: 2026-10-08
- Developer: Yao Xiang, Developer 1
- Status: Implemented; local non-Docker tests and coverage pass; live/Docker verification pending
- Approval: user's explicit contextual role-annotation implementation instruction on 2026-10-08
- Authority: ADR-024; preserves ADR-010 ownership/role rules and ADR-012/CHANGE-062 production/local split.

## Problem and resulting behavior

Only the admin controller previously declared method roles. Production Spring authorities defaulted to mock roles while HTTP application checks queried User Service again. Role lookup also accepted a response for a different user. Human commands now declare RequireRequesterRole, RequireCourierRole or RequireAdminRole; shared reads use RequireOrderRole for any of those three recognized roles.

The production Firebase resource-server filter calls User Service once per authenticated request, verifies its response userId against JWT subject and retains the full role set. Annotations check those confirmed authorities. VerifiedOrderCaller centralizes typed JWT identity/role checks in both peer adapters before command receipt replay. HTTP courier eligibility remains a fresh separate call. Local anonymous/mock actor behavior, internal lifecycle/scheduler paths, locked ownership/state checks, API/event DTOs and schema remain. UserRoleContextResponse is a traditional top-level Lombok DTO, shared by role lookup and the HTTP adapter.

Production defaults to HTTP roles through Order-specific ORDER_USER_SERVICE_MODE, independently of shared USER_SERVICE_MODE. Administrators need stored User Service admin roles; the mock email allowlist no longer grants access in the default production profile. No sibling service source/configuration changed. The root .env.example received only the three-line Order-specific override note/setting. No deployment was performed.

## Errors and concurrency

Invalid/missing production JWT: 401. Missing role, mismatched actor identity or courier ineligibility: 403. Malformed/mismatched role-context or unavailable User Service: fail-closed 503. The bearer filter's configured AuthenticationEntryPointFailureHandler disables service-exception rethrow so these errors reach the JSON entry point. No database reads occur inside annotations; mutation ownership/state are still evaluated under the existing pessimistic row lock. No role ordering or cross-request role cache is introduced.

## Traceability and verification

| Authority / flow | Responsibility | Evidence |
| --- | --- | --- |
| ADR-010, courier sequences 3-6 and accepted cancellation 7 | Required courier role/identity; assigned-order checks retained | OrderControllerRoleSecurityTest, VerifiedOrderCallerTest, existing assignment/domain/transition tests |
| F4.1.5 / F4.1.7, F5.1/F5.1.1, F13/F13.1.1; ADR-010 | Requester completion, OPEN cancellation and associated lifecycle facts | Requester negative/positive MVC cases and unchanged transition/event regression tests |
| ADR-012 / CHANGE-062 | Admin query and local anonymous split | AdminOrderControllerSecurityTest, AdminOrderControllerLocalSecurityTest |
| User-approved central authorization invariant / ADR-024 | Once-per-request roles, full-role membership, token-subject matching | HTTP role provider contract tests, bearer-filter MVC tests and adapter reuse test |
| NFR3.1.1 / NFR3.1.3 | Coverage and positive/negative verification | Fresh line coverage 91.21% (1183/1297); branch 82.19% (360/438); configured 80% gates pass |

- Test-first: initial focused run had 7 tests and 3 expected failures: wrong requester/courier role reached delegates and mismatched role-context identity was accepted.
- Refined focused suite: 37 tests pass with no failures/errors/skips.
- Full regression: 140 tests, zero failures/errors, six skipped PostgreSQL Testcontainers checks due to Docker named-pipe access denied; 134 tests passed. OpenAPI documentation test passed.
- Local Maven uses cached wrapper-selected Maven 3.9.16, Java 21 source/target overrides and target/m2-repository as recorded in CHANGE-075; tracked POM/CI settings unchanged.
- The verify run's report used fresh isolated data, but its check execution initially read old target/jacoco.exec and failed with class mismatch. Copied the fresh full-suite execution data to the check's expected path and ran the configured jacoco:check@check execution successfully. The first standalone check invocation lacked the configured rules; using its configured execution ID resolved that invocation error. No threshold/test exclusion changes.
- Git diff --check passes. Source/contract inspection confirms matching User role/eligibility APIs; live authenticated User Service verification was not performed. Original reference PDFs remain unavailable.

## Persistent artifacts and remaining work

ADR-024 / ARCH-EVO-026, context and TOML metadata, Sprint requirements/contracts/acceptance, architecture/service contract/traceability, class/sequence authorization diagrams and admin diagram references, README/handoff/indexes, active work and AI disclosure updated. No frontend, data model, event schema, migration, Pub/Sub, cron, peer API definition or development workflow changes.

Implementation is uncommitted for review; no push or deployment requested. Hosted CI must run the six Docker tests; live deployed role lookup and admin provisioning remain unverified. Existing Credit endpoint/consumer integration gaps are unchanged.

Documentation metadata was manually reviewed. An optional TOML parser check could not run because python was unavailable on PATH; no successful parser validation is claimed.
