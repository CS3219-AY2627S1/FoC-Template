# CHANGE-046 — Add Order Service OpenAPI documentation test

**Date:** 2026-09-30
**Status:** Implemented; Java 21 Maven verification passed
**Scope:** Order Service API test coverage

## Finding

CI's required structural check found that Order Service had the
`springdoc-openapi-starter-webmvc-ui` dependency but no
`OpenApiDocumentationTest` under `src/test`. The workflow therefore stopped
before Maven verification.

## Implementation

Added:

`order-service/src/test/java/sg/edu/nus/foc/order/api/OpenApiDocumentationTest.java`

The test uses a Spring MVC slice with mocked application collaborators. It
requests `/api/orders/v3/api-docs`, writes `target/openapi.json`, and checks
that every documented operation:

- is under `/api/orders`;
- has an OpenAPI summary; and
- declares a 2xx response.

The slice avoids requiring PostgreSQL, peer services, Docker, or Cloud
credentials during the documentation check.

## Boundary

No endpoint, API contract, gateway, peer-service source, or deployment
configuration was changed.

## Verification

The CI structural condition finds `class OpenApiDocumentationTest`, and
`git diff --check` passes. After the Springdoc test-slice corrections recorded
in CHANGE-049, Java 21 `mvn verify` ran successfully in Docker with 43 tests,
zero failures/errors/skips, and all JaCoCo coverage checks met.

The test's security auto-configuration imports use the Spring Boot 4.1 package
names, matching the project's Boot version. This correction is recorded in
commit `4a40c5b`.
