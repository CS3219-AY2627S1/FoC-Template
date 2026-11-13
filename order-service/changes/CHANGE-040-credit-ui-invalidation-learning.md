# CHANGE-040 — Credit UI invalidation learning guidance

**Date:** 2026-09-30
**Status:** Documented; frontend implementation pending
**Scope:** Order Service/frontend learning only

## Decision guidance

The HTTP-peer Order creation call is synchronous: it waits for Credit Service
reservation before returning success. The missing immediate UI update is a
frontend cache-invalidation gap, not a missing backend event broker.

The recommended design is a shared credit context or lightweight browser event
that refetches `GET /api/credits/me` after successful order creation, repost,
cancellation, completion, or future settlement/release. A durable broker,
WebSocket, SSE channel, or continuous polling is unnecessary for this local
read-model refresh.

## Boundary

No application source, peer-service source, API contract, database schema, or
infrastructure was changed. The requested learning file was updated. Learning
files remain uncommitted by project convention.
