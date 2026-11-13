# ADR-012: Admin paginated Order listing

- Status: Accepted; implementation verified by full `mvn verify` (86 tests; coverage gates passed)
- Date: 2026-10-02
- Owner: Order Service
- Approved by: User, explicit request to implement on 2026-10-02
- Related change: CHANGE-057

## Context

NTH1 assigns the administrator dashboard to Admin Service, while Order Service owns order records and is the only service allowed to query its persistence. Sprint 1 did not include the Admin Service integration. The user explicitly requested an Order-side query that Admin callers can use and directed us to follow Supplier Service's admin verification pattern.

## Decision

- Provide `GET /api/orders` through a separate `AdminOrderController`, protected by `@PreAuthorize("hasRole('ADMIN')")`.
- Authenticate Firebase bearer tokens and derive roles from User Service `GET /api/users/role-context`, matching Supplier's role-context adapter and mock configuration. No role or identity is accepted from query parameters.
- Accept optional `OrderStatus status`; absent/null means all statuses. Accept Spring `Pageable`; expose one-based page numbering (default page 1, size 20), cap size at 100, and return `OrderPageResponse`.
- Route through `OrderQueryService`, domain `OrderRepository`, `OrderPersistenceAdapter`, and Spring Data JPA. Sort newest-created orders first. No database calls in API/application layers.
- Use a synchronous read/query for this requested paginated response. Do not add an event, projection, database schema change, frontend, or Admin Service implementation.
- Return 404-free empty pages for valid filters without results; invalid status/page binding is 400; unauthenticated/unauthorized users receive 401/403; User Service role lookup failure is fail-closed with 503.
- Runtime profile behavior (updated by CHANGE-062): non-production profiles permit anonymous calls and do not activate method-level role checks; the `prod` profile requires authentication for non-public endpoints and enforces the admin role on this query.

## Consequences

Order Service provides the paginated data API but does not implement NTH1's dashboard. Admin Service can call this endpoint when that service is implemented. All status filtering and pagination remain Order-owned. EV-3 query/polling is approved for this explicit read endpoint; event publication remains unselected.

## Communication alternatives

- Synchronous request/response: selected. Each dashboard page/filter request reads current Order-owned data and returns totals in one bounded page. This fits the user's explicit API request and avoids copying order state. The trade-off is that dashboard reads depend on Order Service availability and add one cross-service request.
- Periodic polling: not selected as a separate mechanism. The dashboard can refresh by calling this same endpoint; a background polling loop would add repeated load and still provide only interval-bounded freshness.
- In-process event: unsuitable for serving the Admin Service because it cannot cross the service boundary or return a requested page.
- Durable broker event/read projection: not selected for this endpoint. It could decouple dashboard reads and support push updates, but would require Admin-owned projection storage, event schema/versioning, replay/deduplication, retries/dead-letter recovery, and eventual-consistency handling before pagination/filter totals are reliable. Those capabilities are not requested here.

No migration is needed. The User Service role-context API is classified `MATCHES_APPROVED_CONTRACT` based on inspection of its implementation and Supplier's actual integration pattern. Live authenticated cross-service verification remains separate from unit/context tests.
