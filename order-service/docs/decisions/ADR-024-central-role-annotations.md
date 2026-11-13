# ADR-024: Central role annotations and request-scoped User Service verification

- Status: Accepted
- Date: 2026-10-08
- Approved by: User, explicit contextual annotation implementation instruction on 2026-10-08
- Related change: CHANGE-079

## Decision

Use Spring method-security meta-annotations RequireRequesterRole, RequireCourierRole and RequireAdminRole on public API commands. Firebase authentication runs first; HttpUserServiceRoleProvider calls GET /api/users/role-context with the verified bearer token once per authenticated production request. Validate the returned userId against JWT sub and keep the entire role set; there is no role hierarchy or implicit admin override. The annotations inspect these confirmed authorities rather than issuing duplicate HTTP calls.

Production defaults to HTTP roles using Order-specific ORDER_USER_SERVICE_MODE; explicit mock mode remains available for controlled tests. The production profile ignores the shared USER_SERVICE_MODE mock setting. Local !prod remains anonymous and method security stays disabled. Local HTTP peers retain token-based verification; local mock peers retain supplied mock actor IDs.

Application UserServicePort verification remains before receipt replay as a defense and identity boundary. Both adapters reuse a validated JWT caller's role and subject when present; HttpPeerAdapters still performs fresh courier-eligibility checks. Identity/role mismatches return 403. Locked domain ownership and state checks are unchanged. Internal lifecycle-token and scheduler paths retain their own authorization and do not acquire human-role annotations.

## Endpoint policy

- Requester: create, complete, cancel OPEN, repost/configure, repost-draft, manual repost.
- Courier: accept, start, pickup, deliver, cancel ACCEPTED.
- Admin: paginated GET /api/orders.
- Shared GET /{id} and /available accept any confirmed requester/courier/admin role; role resolution runs through the filter. /mine selects the requester/courier verification according to its mode.

## Peer inspection and verification obligations

UserController implements GET /api/users/role-context (UserRoleContext: userId, roles) and GET /api/users/courier-eligibility (isCourierEligible), both authenticating the supplied Firebase bearer token. Classification: MATCHES_APPROVED_CONTRACT. Missing profiles can currently produce User Service 500, treated as fail-closed 503 on role lookup; HTTP 404 grants no roles. No User Service source/contract changes. Tests cover all three annotations, multiple roles, forged identities, malformed role responses, dependency failures, anonymous local behavior, no duplicate production role lookup, and courier eligibility. Live authenticated peer and Docker checks remain separate verification.

## Consequences

Production admin users must have admin in User Service's stored roles; MOCK_ADMIN_EMAILS does not grant production HTTP-role access. Role facts are reused only in the current request, not cached across requests. Changing annotations cannot bypass row-lock ownership rules. API shapes, event/outbox behavior, schema, frontend and sibling services remain unchanged.

## Spring implementation references

- https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html (meta-annotations and catch-all authentication).
- https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/web/authentication/AuthenticationEntryPointFailureHandler.html (default service-exception rethrow must be disabled so the configured JSON entry point emits 503).
