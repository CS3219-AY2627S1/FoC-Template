# CHANGE-049 — Restore Springdoc route in OpenAPI test slice

**Date:** 2026-09-30
**Status:** Implemented; Java 21 Maven verification passed
**Scope:** Order Service OpenAPI documentation test

## Finding

After the Maven wrapper permission fix, CI reached the Order Service tests but
`OpenApiDocumentationTest` first failed because `GET
/api/orders/v3/api-docs` returned 404. Adding only the core
`SpringDocConfiguration` exposed a second problem: the slice still imported
UI-only `SwaggerConfig`, whose `swaggerWebMvcConfigurer` required a missing
`SwaggerUiConfigProperties` bean.

## Implementation

Scoped the MVC test to the Springdoc API auto-configuration required to
generate OpenAPI JSON:

- `SpringDocConfigProperties`
- `SpringDocConfiguration`
- `SpringDocWebMvcConfiguration`

Removed `SwaggerConfig` and the Swagger UI path property from this test. The
runtime application still includes the Swagger UI starter and its configured
documentation UI; the structural test only needs the JSON endpoint.

## Boundary

Only the Order Service test configuration changed. No runtime endpoint,
OpenAPI contract, peer-service source, frontend, or deployment configuration
was modified.

## Verification

The supplied GitHub log confirmed Maven compilation and 42 other tests passed,
with only the UI configuration bean preventing this test context from loading.
The corrected source was then built and verified in an Eclipse Temurin Java 21
Docker image:

```text
Tests run: 43, Failures: 0, Errors: 0, Skipped: 0
All coverage checks have been met.
BUILD SUCCESS
```

`OpenApiDocumentationTest` successfully requested the configured JSON route,
and `git diff --check` passed. Source commit: `5f9335f`.
