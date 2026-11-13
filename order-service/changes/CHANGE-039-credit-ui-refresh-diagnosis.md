# CHANGE-039 — Credit reservation UI refresh diagnosis

**Date:** 2026-09-30
**Status:** Diagnosed; frontend fix not yet implemented
**Scope:** Order Service/frontend learning and traceability only

## Finding

The sidebar credit summary and order creation use separate read paths. In the
default local Compose mode, Order Service's `MockPeerAdapters` tracks
reservations in memory while the sidebar reads the Credit Service's Firestore
account, so the displayed balance cannot reflect the mock reservation. In the
HTTP-peer mode, the real Credit Service is updated, but the frontend's
`useCreditBalance` hook refreshes only on mount, browser focus, or manual
Refresh. Successful order creation does not invalidate that cached balance.

## Current safe behavior

Use `compose.http-peers.yaml` for real reservation-to-balance testing and click
Refresh (or refocus the browser) after creating an order. The default mock mode
remains suitable for Order state-machine tests, not Credit UI synchronization.

## Boundary

No application source, peer-service source, API contract, or database schema was
changed in this diagnostic turn. The existing learning file was updated because
the developer explicitly requested this explanation. The two learning files
remain uncommitted by project convention.
