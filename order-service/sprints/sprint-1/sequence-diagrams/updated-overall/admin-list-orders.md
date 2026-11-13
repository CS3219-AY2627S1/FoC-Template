# Admin lists orders (CHANGE-057)

```mermaid
sequenceDiagram
    actor Admin
    participant Security as Order Security
    participant User as User Service
    participant Controller as AdminOrderController
    participant Query as OrderQueryService
    participant Port as OrderRepository
    participant Adapter as OrderPersistenceAdapter
    participant JPA as JpaOrderRepository
    participant DB as Order Database

    Admin->>Security: GET /api/orders?status?&page&size + Firebase bearer token
    Security->>Security: verify token; resolve roles
    Security->>User: GET /api/users/role-context with caller bearer token
    User-->>Security: userId and roles
    alt no ADMIN role
        Security-->>Admin: 403 Forbidden
    else ADMIN role
        Security->>Controller: authenticated principal with ROLE_ADMIN
        Controller->>Query: listAll(status or null, pageable)
        Query->>Port: findAllOrders(status, zeroBasedPage, size)
        Port->>Adapter: persistence query
        alt status is null
            Adapter->>JPA: findAll(Pageable, createdAt DESC)
        else status supplied
            Adapter->>JPA: findByStatusOrderByCreatedAtDesc(status, Pageable)
        end
        JPA->>DB: paged SELECT
        DB-->>JPA: page content and totals
        JPA-->>Adapter: Page<Order>
        Adapter-->>Port: OrderPage
        Port-->>Query: OrderPage
        Query-->>Controller: OrderPage
        Controller-->>Admin: OrderPageResponse (one-based page)
    end
```

The endpoint is a synchronous query. An absent status includes every status. User Service lookup failure fails closed with 503; invalid status/page binding returns 400. Public pages are one-based, default to page 1/size 20, and page size is capped at 100.

CHANGE-079/ADR-024 uses RequireAdminRole on this operation. Production role lookup defaults to HTTP and verifies response userId == JWT subject; mock email grants no longer apply to the default production configuration. See [order-authorization.md](order-authorization.md).
