# CHANGE-037 — Order Service HTTP-peer smoke profile

**Date:** 2026-09-30
**Status:** Implemented; local runtime verification pending
**Scope:** Order Service runtime configuration only; no peer-service source or learning files changed

## Approved decision

Vincent approved Option 2: keep the deterministic local mock stack and add a
separate Compose override for real HTTP peer smoke testing. This is a runtime
test profile, not a replacement for the default development configuration.

## Changes

- Added root `compose.http-peers.yaml` as an explicit Compose override.
- The override selects `ORDER_PEERS_MODE=http` only for `order-service`.
- It supplies container-network URLs for User, Supplier, and Credit Service.
- It waits for the three peer health checks before starting Order Service.
- The existing `compose.yaml` remains unchanged with `ORDER_PEERS_MODE=mock`.

## Scope and limitations

The override exercises the real `HttpPeerAdapters` for User identity/role
verification, Supplier validation, and Credit reservation. It is intended for
Sequences 1–3 smoke testing. The Credit Service still does not provide the
approved settlement/release operations, so completion, cancellation, expiry,
and automatic-repost outcome flows cannot be claimed live through this profile.
The run also requires a valid Firebase-emulator bearer token and a provisioned
Credit account for the test user.

This profile does not mix real reservation with mock outcome calls. The Order
Service either uses all local mocks (default) or all three HTTP peer adapters
(override), avoiding inconsistent reservation state.

## Usage

```bash
docker compose -f compose.yaml -f compose.http-peers.yaml up -d --build --force-recreate
docker compose -f compose.yaml -f compose.http-peers.yaml ps
```

Return to the default mock stack with:

```bash
docker compose down
docker compose up -d --build --force-recreate
```

## Verification

Compose file syntax and the live Docker/browser smoke test are environment-
dependent. This change does not claim that Sequences 1–3 are verified until
the developer runs the override with the local Docker engine and an
authenticated browser session.

## Boundaries and traceability

- No sibling microservice directory was modified.
- The two pre-existing untracked files under `order-service/learning/` were
  deliberately left untouched.
- This change does not alter a peer API, database schema, event decision, or
  production deployment configuration.
- `FEEDBACK-001` remains open for Credit settlement/release.
