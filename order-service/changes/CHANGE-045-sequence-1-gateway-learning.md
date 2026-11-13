# CHANGE-045 — Sequence 1 gateway and request-flow learning note

**Date:** 2026-09-30
**Status:** Added; runtime walkthrough remains developer-verified
**Scope:** Order Service learning documentation only

## Purpose

Explain the actual local end-to-end Sequence 1 path from the browser, through
CORS and nginx gateway routing, into Order Service security/controller/application/
domain/peer/persistence layers, and back to the browser. Also explain how
Compose environment variables become Spring runtime properties and select mock
or HTTP peer adapters.

## Added

- `order-service/learning/seq1-order-creation-and-gateway-flow.md`
  - gateway routing and Docker DNS explanation;
  - browser preflight/authenticated request flow;
  - Order Controller → application service → domain aggregate → peer ports →
    PostgreSQL → response flow;
  - Dockerfile defaults, nginx image startup `envsubst`, rendered nginx
    configuration, `set $upstream`, and `proxy_pass` forwarding;
  - local Compose versus Cloud Run `ORDER_SERVICE_URL` substitution;
  - `ORDER_PEERS_MODE` mock/HTTP selection;
  - Compose interpolation versus container environment versus Spring
    placeholders;
  - debugging checklist for browser, gateway, peer, and persistence failures.

## Boundary

No application source, peer-service source, gateway configuration, Compose
configuration, API contract, or deployment behavior was changed. The learning
file remains untracked under the existing `order-service/learning/` convention.

## Verification

The explanation was checked against the current gateway nginx template and
proxy snippet, Compose files, frontend API/auth code, Order Controller,
OrderCreationService, Order domain aggregate, peer adapters, Spring security,
and `application.yaml`. No live Docker, browser, or peer-service runtime test
was claimed.
