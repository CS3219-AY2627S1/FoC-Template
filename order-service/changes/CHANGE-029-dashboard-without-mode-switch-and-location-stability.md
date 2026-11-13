# CHANGE-029 — Unified dashboard actions and stable supplier locations

- **Date:** 2026-09-30
- **Status:** Implemented in source; verification pending
- **Scope:** Order Service backend identity boundary and shared frontend Order views
- **Approved by:** Vincent, 2026-09-30

## User request

The shared dashboard should expose requester and courier functions without a
Requester/Courier mode switch. A requester must not be able to accept their own
open order, while other open orders remain acceptable. Order cards must show
human-readable supplier locations without first rendering opaque supplier IDs.

## Credit endpoint finding

The existing peer Credit Service already implements `GET /api/credits/me`.
Its `404 ACCOUNT_NOT_FOUND` response means the authenticated user has no
provisioned credit account; it is not a missing endpoint. The frontend signup
registration-fact call and the running local image/container must be checked
when this response occurs. No Credit Service source was modified.

## Approved design

- Remove the client-side mode-switch control and mode persistence provider.
- Keep requester and courier routes/actions visible in the shared dashboard;
  backend authorization remains authoritative.
- Filter the current user's own orders out of the Browse Errands presentation.
- Retain the existing Order aggregate rule that rejects self-acceptance.
- Make Order-side User Service adapters return the provider-confirmed identity;
  use that identity for creation, acceptance, transitions, list queries, and
  repost authorization instead of trusting request-body IDs.
- Keep Supplier Service as the source of truth. Batch-resolve supplier IDs,
  hold Order cards until the lookup is settled, and display `Location
  unavailable` rather than exposing an opaque ID when a provider lookup fails.

## Boundaries and alternatives

- No User, Supplier, or Credit Service source was changed.
- No Order API endpoint or database schema was changed.
- Embedding supplier names in Order responses was rejected because Supplier
  Service owns catalogue details and the approved contract stores references.
- Keeping the mode switcher but defaulting to both functions was rejected because
  the user explicitly requested one unified dashboard.

## Affected artifacts

- Frontend AppShell, routes, supplier-label hook, Order card, and tests.
- Order UserServicePort and HTTP/mock adapters plus application callers.
- Traceability, active-work, architecture-evolution, change log, and AI usage log.

## Verification state

`git diff --check` and static inspection are required. Node/npm, Java 21/Maven,
Docker runtime, authenticated browser checks, and live peer-contract checks are
environment-dependent and remain pending until available.
