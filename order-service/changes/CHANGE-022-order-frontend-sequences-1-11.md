# CHANGE-022: Order Service Frontend Sequences 1-11

## Status

Implementation complete for the approved frontend slice; cross-service runtime
verification remains pending.

## Approved scope

- One responsive Next.js web application for desktop and mobile browsers.
- `USER` Requester mode maps to requester behavior.
- `USER` Courier mode maps to courier behavior.
- A client-side mode switcher is allowed; backend services remain authoritative.
- Firebase UID is used as the requester or actor identifier.
- Vitest and React Testing Library are the frontend test stack.
- Automatic repost settings are selected during creation and shown read-only
  when viewing an `OPEN` request; manual repost settings are available only
  after expiry.

## Implemented

- Post Request form with supplier references, credits, expiry, and automatic
  repost configuration.
- Browse Errands and accept action.
- My Errands with start, pickup, and delivery actions.
- My Requests with completion, cancellation, repost configuration, and manual
  repost review.
- Responsive cards and controls using the existing AppShell, Geist, shadcn/Base
  UI, and Lucide visual baseline.
- Order Service requester/courier list queries at `/api/orders/mine`.
- Requester authorization before manual repost; the former post-creation
  automatic configuration interaction is superseded by CHANGE-031.

## Verification

- Frontend typecheck passed.
- Vitest passed: 4 tests, 0 failures, including an RTL OrderCard render test.
- ESLint passed with 12 pre-existing warnings and no errors.
- Next.js production build passed.
- Order Service Maven tests passed after the list-query and repost-authorization
  changes.

## Remaining verification

- Contract tests against live User, Supplier, Credit, and Gateway services.
- Authenticated browser verification with Firebase emulator credentials.
- Local Compose startup (excluding the intentionally deferred Admin Service)
  is now verified with the temporary MongoDB dependency recorded in
  CHANGE-023.
