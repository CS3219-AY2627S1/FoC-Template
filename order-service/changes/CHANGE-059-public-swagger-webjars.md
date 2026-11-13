# CHANGE-059: Allow public Swagger UI webjar assets

- Date: 2026-10-02
- Developer: Yao Xiang, Developer 1
- Status: IMPLEMENTED; `mvn verify` PASSED (88 tests; JaCoCo line and branch gates passed)
- Trigger: The Swagger workaround URL returned the Order Service JSON 401 envelope for `/webjars/swagger-ui/index.html`.

## Root cause and change

`SecurityConfiguration` already allowed the OpenAPI document and Order-scoped Swagger paths, but Swagger UI's index and JavaScript/CSS resources are served from `/webjars/**`. That static-resource path was missing from the public allowlist, so Spring Security rejected the request before the resource handler served the file.

Added `/webjars/**` to the public paths and a MockMvc regression test asserting that `/webjars/swagger-ui/index.html` is available without authentication. Admin order endpoints remain authenticated and role-protected.

## Verification

- The new test first failed with HTTP 401 before the security change.
- All five tests in `AdminOrderControllerSecurityTest` passed after the change, including anonymous rejection of `/api/orders` and successful unauthenticated Swagger asset access.
- Full `mvn verify`: 88 tests, zero failures/errors/skips; JaCoCo line and branch gates passed.
- `git diff --check` passed. Docker image rebuild and live Swagger UI browser verification were not run.

## Affected scope

Only Order Service security configuration, its security test, and Order Service task records changed. API contracts, business behavior, persistence, frontend, and peer-service source are unchanged.

## Current profile behavior

The statement above describes the behavior at CHANGE-059. CHANGE-062 later restored the local/production split: all non-public API requests are authenticated in `prod`; the local profile permits anonymous calls, including order APIs. Swagger remains public in both profiles.
