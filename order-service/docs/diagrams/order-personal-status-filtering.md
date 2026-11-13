# Personal Order filtering — CHANGE-094 / ADR-032

Approved UI/query refinement; no new peer interaction or data model.

```mermaid
sequenceDiagram
    actor User as Requester or Courier
    participant Page as My Requests / My Errands
    participant Poll as useOrderList / visible polling
    participant API as OrderController.mine
    participant Query as OrderQueryService
    participant Repo as OrderRepository / PersistenceAdapter
    participant DB as PostgreSQL
    User->>Page: Choose status (default All)
    Page->>Page: Reset page 1
    Page->>Poll: Owner + mode + page + optional status
    Poll->>Poll: Abort previous selection read
    Poll->>API: GET /api/orders/mine
    API->>API: Existing role/identity/mode verification
    API->>Query: requestedBy / courierFor with status
    Query->>Repo: Owned filtered page
    Repo->>DB: Status/ownership/history/visibility before count and pagination
    DB-->>Repo: Matching references/content and totals
    Repo-->>API: Existing OrderPage via Query
    API-->>Page: Existing mapped page response
    loop Every5 seconds while auth-ready and visible
        Poll->>API: Same selection and page, no overlapping reads
    end
```

```mermaid
classDiagram
    MyRequestsPage --> OrderStatusFilter
    MyErrandsPage --> OrderStatusFilter
    MyRequestsPage --> OrderPagination
    MyErrandsPage --> OrderPagination
    MyRequestsPage --> useOrderList
    MyErrandsPage --> useOrderList
    useOrderList --> useVisiblePolling
    OrderController --> OrderQueryService
    OrderQueryService --> OrderRepository
    OrderRepository <|.. OrderPersistenceAdapter
    OrderPersistenceAdapter --> JpaOrderRepository
    OrderPersistenceAdapter --> JpaOrderCourierAttemptRepository
```

OrderActions changes presentation only: Abort errand still uses existing cancel-accepted sequence/domain rules. Credit and generic polling15 seconds remain. No JPA/API contracts in presentation beyond existing gateway call; DB filtering stays infrastructure-owned.

## Mode-specific status options — CHANGE-095 (2026-10-09)

Requester dropdown excludes ABORTED. Courier dropdown excludes OPEN, EXPIRED and CANCELLED; it retains ABORTED immutable-attempt history. All statuses remains the default. OrderStatusFilter requires an explicit requester/courier mode, supplied by each existing page. This is a UI-only refinement of ADR-032: existing API enum/query, authentication, ownership, pagination and five-second polling remain unchanged.
