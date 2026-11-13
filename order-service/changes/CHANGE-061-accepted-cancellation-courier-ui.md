# CHANGE-061 - Accepted errand cancellation UI for couriers

## Status

Implemented on 2026-10-03. Frontend Vitest, lint, typecheck, and production build passed. Authenticated browser verification remains pending.

## Approval and scope

The user requested a frontend action for a courier to cancel their own errand while it remains `ACCEPTED`, confirmed the existing API is available, and directed that the UI follow the existing design. This completes the UI link for the already-approved Sequence 7 behavior in CHANGE-055 / ADR-010. No Order Service backend, API contract, shared API client, permission model, route, sibling service, or infrastructure change was needed.

## Behavior

- In the existing `USER` Courier mode on My Errands, show a destructive secondary `Cancel errand` action only for an `ACCEPTED` order. Keep `Start errand` available beside it.
- Require confirmation using the existing Base UI AlertDialog component and explain that cancellation aborts the errand and ends the courier assignment.
- On confirmation, call the existing `POST /api/orders/{id}/cancel-accepted` route through `useApi()` with the existing `commandId`, Firebase UID as `actorId`, and current `expectedVersion` payload.
- On success, forward the returned `ABORTED` order to the page, remove it from the courier's assigned list, and show a success toast. On failure, preserve the task in the list and show the existing API error toast.
- Backend role, assignment, and current-status checks remain authoritative.

## Affected artifacts

- `frontend/src/components/orders/order-actions.tsx`
- `frontend/src/components/orders/order-actions.test.tsx`
- `frontend/src/app/my-errands/page.tsx`
- `frontend/src/lib/orders.ts`
- `frontend/src/lib/orders.test.ts`
- `order-service/sprints/sprint-1/acceptance-tests.md`
- `order-service/docs/requirements-traceability.md`
- `order-service/docs/change-log.md`
- `order-service/docs/active-work/yao-xiang.md`
- `ai/usage-log.md`

The frontend order status model now includes `ABORTED`, matching the existing Order API response. A small list-update helper removes aborted errands because the backend clears the `courierId` and the courier query no longer includes that order.

## Verification

- TDD: the new component tests first failed because `Cancel errand` was absent for an accepted courier order; the implementation then passed all focused checks.
- `npm test`: passed, 18 tests across 7 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 12 existing warnings in `src/app/login/login-form.tsx` and `src/app/profile/page.tsx`, no errors and no warnings in changed files.
- `npm run build`: passed after allowing the build to fetch the existing Geist and Geist Mono fonts. The sandboxed first attempt could not reach Google Fonts.
- `git diff --check` on the changed frontend files: passed.
- No backend or peer-service code changed, so backend tests were not rerun. No authenticated browser or live Pub/Sub check was performed.
