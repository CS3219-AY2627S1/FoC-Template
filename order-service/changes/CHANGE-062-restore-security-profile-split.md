# CHANGE-062: Restore local/production security profile split

- Date: 2026-10-03
- Developer: Yao Xiang, Developer 1
- Status: IMPLEMENTED; `mvn verify` passed (89 tests; line and branch coverage gates passed)
- Approval: Explicit user request to permit local API calls without authentication and require authentication in production, with admin-role checks only on production admin endpoints.
- Related decision/evolution: ADR-012; ARCH-EVO-014

## Behavior

Restore the established Spring profile split. With any profile other than `prod`, all Order endpoints permit anonymous access and method-level role checks are disabled. With `prod`, all non-public endpoints require a Firebase bearer token, and `@PreAuthorize("hasRole('ADMIN')")` is enforced on the admin order listing. Health and Swagger resources remain public in production.

## Implementation

- `SecurityConfiguration` provides a `!prod` `permitAll()` chain and a `prod` Firebase resource-server chain.
- JWT decoder, role provider, role converter, and JSON security handlers are registered only in `prod`.
- `ProductionMethodSecurityConfiguration` enables Spring method security only under `prod`, preserving local use of the admin listing without an identity token.
- No endpoint contract, query behavior, frontend, peer service, persistence, or Compose configuration changed.

## Verification

- Focused Maven command: `mvn -B -ntp -Dmaven.repo.local=target/m2-repository -Dtest=AdminOrderControllerLocalSecurityTest,AdminOrderControllerSecurityTest,OrderSecurityConfigurationTest test`.
- Result: 10 tests passed; zero failures, errors, or skips. Covered anonymous local admin-list access, production anonymous rejection, production non-admin rejection, production admin access/filter/pagination, public Swagger asset, role-provider configuration, and security error handlers.
- Full `mvn -B -ntp -Dmaven.repo.local=target/m2-repository verify` passed 89 tests with zero failures, errors, or skips; JaCoCo line and branch coverage gates passed.
- `git diff --check` passed. Docker profile startup was not exercised.
- Initial Maven runs could not use the default repository or resolve dependencies within the sandbox. The focused run succeeded with network access and an isolated repository under ignored `target/`.

## Affected scope

Order Service security configuration, a production-only method-security configuration, security tests, README, ADR-012, architecture evolution, CHANGE-057/059 follow-up notes, change log, active-work record, and AI usage log. No diagrams or data-model changes are needed.
