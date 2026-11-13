# CHANGE-041 — Credit UI invalidation implementation

**Date:** 2026-09-30
**Status:** Implemented; frontend verification pending
**Scope:** Approved shared Order Service frontend vertical slice only

## Changes

- Added a browser-level credit-balance invalidation event and helper.
- Made `useCreditBalance` refetch `GET /api/credits/me` when the event fires.
- Triggered invalidation after successful order creation, manual repost,
  cancellation, and completion.
- Added a Vitest regression test for the invalidation event.

Automatic repost remains backend-triggered, so focus/manual refresh continues
to cover lifecycle changes that occur without a browser mutation.

## Boundaries

- Credit Service remains the authoritative balance owner.
- No broker, WebSocket, polling loop, peer-service source, API contract, or
  database schema was added or changed.
- The two pre-existing untracked learning files remain uncommitted.

## Verification

The frontend test command could not run in this environment because `npm` was
not available. The code and test changes were statically inspected; local
Vitest/typecheck verification remains required.
