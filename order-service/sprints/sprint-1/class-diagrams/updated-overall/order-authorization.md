# Role authorization classes (CHANGE-079 / ADR-024)

```mermaid
classDiagram
    class SecurityConfiguration
    class ProductionMethodSecurityConfiguration
    class FirebaseRoleAuthoritiesConverter
    class RoleProvider {
        <<interface>>
        +rolesFor(Jwt) Set~Role~
    }
    class HttpUserServiceRoleProvider
    class MockUserServiceRoleProvider
    class UserRoleContextResponse {
        +String userId
        +List~String~ roles
    }
    class RequireRequesterRole {
        <<annotation>>
    }
    class RequireCourierRole {
        <<annotation>>
    }
    class RequireAdminRole {
        <<annotation>>
    }
    class RequireOrderRole {
        <<annotation>>
    }
    class VerifiedOrderCaller {
        +identityFor(Role, String) Optional~String~
    }
    class HttpPeerAdapters
    class MockPeerAdapters
    class OrderController
    class AdminOrderController
    SecurityConfiguration --> FirebaseRoleAuthoritiesConverter
    FirebaseRoleAuthoritiesConverter --> RoleProvider
    RoleProvider <|.. HttpUserServiceRoleProvider
    RoleProvider <|.. MockUserServiceRoleProvider
    HttpUserServiceRoleProvider --> UserRoleContextResponse
    ProductionMethodSecurityConfiguration ..> RequireRequesterRole
    ProductionMethodSecurityConfiguration ..> RequireCourierRole
    ProductionMethodSecurityConfiguration ..> RequireAdminRole
    ProductionMethodSecurityConfiguration ..> RequireOrderRole
    OrderController ..> RequireRequesterRole
    OrderController ..> RequireCourierRole
    OrderController ..> RequireOrderRole
    AdminOrderController ..> RequireAdminRole
    HttpPeerAdapters --> VerifiedOrderCaller
    MockPeerAdapters --> VerifiedOrderCaller
```

The production role provider calls User Service once per authenticated request, and annotations inspect the resulting SecurityContext authorities. VerifiedOrderCaller is the shared typed JWT identity guard used by adapters before receipt replay. It does not inspect or load Orders; ownership/state guards remain in the locked domain/application flow. The HTTP adapter preserves fresh courier eligibility; the local mock adapter preserves distinct local actor IDs. No manual RoleAspect, role hierarchy, cross-request cache or database changes.
