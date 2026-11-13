# CHANGE-057: Admin paginated Order query

- Date: 2026-10-02
- Developer: Yao Xiang, Developer 1
- Status: USER-APPROVED; IMPLEMENTED; `mvn verify` PASSED (86 tests; line and branch coverage gates passed)
- Approval: Explicit request to create an admin controller, inspect Supplier's admin verification, filter by optional status, and accept pageable input.
- Related decision: ADR-012

## Behavior

Add `GET /api/orders` in a dedicated admin controller. An absent status returns orders across all statuses; a present status filters exactly. Page results use the shared `OrderPageResponse` and public one-based page numbering. Admin access uses Supplier's `@PreAuthorize("hasRole('ADMIN')")` pattern, with Firebase authentication and User Service role-context resolution.

## Architecture and ownership

The API delegates to `OrderQueryService`, then the `OrderRepository` port, then `OrderPersistenceAdapter` and Spring Data JPA. No other service accesses Order persistence. The query sorts by newest creation time. User Service role lookup failure fails closed. Mock mode follows Supplier's configured admin email behavior.

This Order-side endpoint supports future NTH1/Admin Service use. It does not add an Admin Service implementation, dashboard UI, or event consumer. EV-3 query/read is approved specifically for this explicit endpoint. No persistence schema change is expected.

## Verification

- Wrote the all-orders/query/controller/security/persistence tests before implementation; the initial compile failed because `AdminOrderController` did not yet exist.
- Focused tests cover unfiltered and filtered persistence, page mapping, one-based HTTP page parameters, size caps, admin-only access, User Service bearer forwarding, mock admin email mapping, Firebase emulator decoding, and 401/403/503 handling.
- Full `mvn verify` passed 86 tests with zero failures/errors/skips and passed both configured JaCoCo thresholds.
- OpenAPI structural verification includes the new endpoint. `git diff --check` and final scope review passed.
- User Service API was inspected; live authenticated User Service/Order Service runtime integration was not exercised.

## Runtime security follow-up

CHANGE-062 restores the established profile split: the admin role is enforced in the `prod` profile only; non-production profiles permit anonymous access and do not activate method-level security. The admin query contract, pagination, and production authorization requirement remain unchanged.
