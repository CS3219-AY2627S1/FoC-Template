# Shared production authorization sequence (CHANGE-079 / ADR-024)

This prefix applies to human Order APIs; local !prod bypasses token/method-role security and retains adapter mock identities. System schedulers and lifecycle-token routes keep their existing separate authorization.

```mermaid
sequenceDiagram
    actor Caller
    participant Filter as Firebase resource-server filter
    participant Roles as HttpUserServiceRoleProvider
    participant User as User Service
    participant Guard as Role annotation / Spring method security
    participant API as Order controller
    participant App as Application service
    participant Peer as UserServicePort adapter
    participant Context as VerifiedOrderCaller
    participant DB as Order database
    Caller->>Filter: API request + Bearer token
    Filter->>Filter: Validate Firebase JWT
    Filter->>Roles: rolesFor(verified JWT)
    Roles->>User: GET /api/users/role-context (caller token)
    User-->>Roles: userId + complete roles set
    Roles->>Roles: Require userId == JWT subject
    Roles-->>Filter: Confirmed ROLE authorities
    Filter->>Guard: Authenticated request context
    Guard->>Guard: Check endpoint required role
    alt missing role
        Guard-->>Caller: 403 FORBIDDEN
    else permitted role
        Guard->>API: Invoke API
        API->>App: Bind/map/delegate command
        App->>Peer: Verify requested actor before replay
        Peer->>Context: Reuse verified JWT subject + required authority
        Context-->>Peer: Matching caller, or reject forged actor
        opt courier operation using HTTP peers
            Peer->>User: GET /api/users/courier-eligibility
            User-->>Peer: isCourierEligible
        end
        Peer-->>App: Provider-confirmed actor
        App->>DB: Read command receipt / lock Order for mutation
        App->>App: Recheck locked ownership, version and lifecycle state
        App->>DB: Existing business transaction
        App-->>Caller: Existing API response
    end
```

Invalid/missing tokens return 401. Failed/malformed role lookup (including a mismatched response identity) returns 503. Local HTTP peers still call role-context because no authenticated Spring JWT context exists in !prod. Shared read APIs allow any recognized role; /mine verifies the role for its selected mode. Each subsequent request resolves roles again, avoiding stale authorization caches.
