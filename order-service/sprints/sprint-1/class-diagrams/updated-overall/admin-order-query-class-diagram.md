# Admin Order Query Class Diagram (CHANGE-057)

```mermaid
classDiagram
    class AdminOrderController {
      +listOrders(OrderStatus status, Pageable pageable) OrderPageResponse
    }
    class OrderQueryService {
      +allOrders(OrderStatus status, int page, int size) OrderPage
    }
    class OrderRepository {
      <<interface>>
      +findAllOrders(OrderStatus status, int page, int size) OrderPage
    }
    class OrderPersistenceAdapter {
      +findAllOrders(OrderStatus status, int page, int size) OrderPage
    }
    class JpaOrderRepository {
      <<interface>>
      +findAll(Pageable) Page~Order~
      +findByStatusOrderByCreatedAtDesc(OrderStatus, Pageable) Page~Order~
    }
    class OrderMapper {
      <<MapStruct>>
      +toResponse(OrderPage) OrderPageResponse
    }
    class RoleProvider {
      <<interface>>
      +rolesFor(Jwt) Set~Role~
    }
    class HttpUserServiceRoleProvider
    class MockUserServiceRoleProvider
    class FirebaseRoleAuthoritiesConverter
    class SecurityConfiguration

    AdminOrderController --> OrderQueryService
    AdminOrderController --> OrderMapper
    OrderQueryService --> OrderRepository
    OrderPersistenceAdapter ..|> OrderRepository
    OrderPersistenceAdapter --> JpaOrderRepository
    FirebaseRoleAuthoritiesConverter --> RoleProvider
    HttpUserServiceRoleProvider ..|> RoleProvider
    MockUserServiceRoleProvider ..|> RoleProvider
    SecurityConfiguration --> FirebaseRoleAuthoritiesConverter
```

`@RequireAdminRole` (a Spring `@PreAuthorize` meta-annotation) protects the controller operation. Database access stays in the infrastructure adapter. The User Service remains authoritative for roles; the mock implementation is restricted to local/mock configuration.

Under CHANGE-079/ADR-024, production defaults to HTTP User Service roles independently of sibling mock settings. See order-authorization.md for the shared authorization components.
