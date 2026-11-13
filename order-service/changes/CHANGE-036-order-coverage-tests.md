# CHANGE-036 — Order Service coverage and verification tests

**Date:** 2026-09-30
**Status:** Implemented; JaCoCo gate passes
**Scope:** Order Service only; no peer-service source or learning files changed

## Context

CHANGE-035 introduced the required JaCoCo minimum of 80% for both line and
branch coverage. The first verification run exposed insufficient coverage, so
the missing domain, application, controller, adapter, and error paths were
covered with focused tests.

## Changes

- Added domain behavior coverage for creation validation, lifecycle guards,
  expiry/repost eligibility, value objects, and API view mapping.
- Added application-service coverage for creation, acceptance, transitions,
  completion/cancellation, lifecycle expiry/repost, idempotency, and a local
  peer-credit integration path.
- Added direct controller coverage for all sequence action endpoints and
  lifecycle/repost authorization branches.
- Added API DTO/error-handler coverage.
- Added HTTP peer-adapter contract tests for User, Supplier, and Credit calls,
  including authorization forwarding and identity rejection.
- Expanded the local `MockPeerAdapters` tests for reserve/settle/release
  balances, idempotency, conflicts, invalid inputs, and insufficient credit.
- Added a package-private `HttpPeerAdapters` constructor that accepts prepared
  `RestClient` instances so the adapter contract tests can bind deterministic
  `MockRestServiceServer` instances. Production URL-based construction is
  unchanged.

## Verification

Executed in a disposable Java 21 container:

```text
./mvnw -B -ntp clean verify
Tests run: 42, Failures: 0, Errors: 0, Skipped: 0
JaCoCo lines:    300/336 = 89.29%
JaCoCo branches: 174/209 = 83.25%
Result: BUILD SUCCESS; all 80% line/branch checks passed.
```

The test suite includes unit, controller, API contract, adapter contract, and
application integration-style coverage. Docker-backed PostgreSQL, peer-service
runtime, authenticated browser, and Cloud Run verification remain separate
environment-dependent gates.

## Boundaries and traceability

- No sibling microservice directory was modified.
- The two untracked files under `order-service/learning/` were deliberately
  left untouched.
- Sprint 1 sequences remain `[~]` until the outstanding peer, runtime, browser,
  and deployment gates pass; the JaCoCo gate is now satisfied.
