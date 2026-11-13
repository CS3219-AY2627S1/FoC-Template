# Current account and selected-role authorization

User owns this contract. The feature brief was approved in this chat before implementation.
Implementation editor: Codex, nominated by Darryl for the six services and shared configuration.
Affected-owner review is required from Darryl (User/Admin), Jun Hui (Supplier/runtime), XueTing
(Order), and Eldridge (Credit/Chat). Implementation verification does not constitute their review.

## Private User API

`GET /internal/users/{userId}/authorization` returns
`{"userId":"<UUID>","active":true,"roles":["REQUESTER","COURIER"]}` from User's persisted
account and assignments. `active` means exactly ACTIVE. Absent accounts return 404. Success
responses are `Cache-Control: no-store`. No email, password, profile or token-session data is
returned. Repeated reads have no effects or operation IDs; there is no authorization event stream.

Admin, Supplier, Order, Credit and Chat are the only caller subjects. Authenticate with the
existing independent service-assertion profile: RS256, issuer `foc-service-auth`, receiving audience
`user-service`, pinned key ID/public key bound to the service subject, required jti, bounded iat/exp
and maximum 60-second lifetime. Assertions are reusable within that lifetime for idempotent reads;
jti is an assertion identity, not a single-use operation receipt. User/browser JWTs cannot call
this endpoint. Supplier/Order identities do not gain access to Admin eligibility or operation receipts.
The compatibility `admin-eligibility` endpoint retains its original Admin/Chat/Credit ACL.

Each backend first verifies the original User JWT locally: RS256, issuer, audience, subject,
selected role and time validity. It then requires an ACTIVE account with that exact selected role
still assigned. Other assigned roles do not elevate this token. User uses its own repository;
consumers call the private API. Delegated Chat actor JWTs undergo both checks before entering
transactional methods. Existing User/Admin privileged checks remain additional protections.

## Boundaries and failure handling

Every protected REST request checks current permission before controller transactions. Public
health, assets, login/verification/reset and public Supplier discovery remain public. An invalid
JWT is 401; known revoked/missing account or selected role is 403. Existing resource denials retain
their established semantics after identity authorization. Requester/courier ownership, self-acceptance
prevention, historical Chat assignment epochs, hidden case resources, reviewer permissions, immutable
receipts and User self/final-admin lifecycle protection remain locally enforced.

No authorization response is cached, including denials. Consumers use a two-second connection and
three-second overall request timeout, reject redirects and validate returned UUID/field types/roles.
Timeouts, malformed responses, transport errors, missing signing/trust setup and non-200/non-404
responses fail closed as 503. A subsequent request checks again and can recover immediately. REST
does not automatically retry mutations. Existing operation/idempotency keys govern client retries.
No application database lock is acquired across the new remote authorization check.

STOMP CONNECT verifies the signed token and current permission. SUBSCRIBE and other authenticated
inbound frames recheck that session's JWT and current state. Only `/user/queue/chat` is subscribable;
STOMP SEND is rejected because message mutations use the REST API. Every outbound application
MESSAGE is checked for its specific session, including token expiry. Denial or User uncertainty
suppresses the message and closes that session with policy violation; reconnect is required after
recovery. Heartbeats are not application messages. Idle sessions are checked at their next protected
frame/delivery, not by a periodic poll. Existing message-recipient/resource checks precede fan-out.
Reconnect retrieves missed authorized history through REST and its existing sequence cursor.

Admin commands retain the original eventId/operationId/request hash and inbox/outbox. For a new
effect User checks ACTIVE/ADMIN locally inside its lifecycle transaction; Credit checks User before
its ledger transaction. Revoked actors produce durable rejection. User failures do not grant access
or create permanent authorization rejection: existing Kafka retry/DLT/recovery machinery owns
redelivery and reconciliation. A completed duplicate republishes its immutable original outcome
without another effect, even after actor revocation or User outage. Producer facts, already committed
Order lifecycle effects and ledger reconciliation are not reinterpreted as new privileged commands.
No bearer token is placed in Kafka. Broker authentication/producer ACLs and envelope validation remain
required. Monitor rejected HTTP authorization status, Kafka retry/DLT and pending/unknown actions;
tokens and private resource metadata must never be logged.

## Runtime configuration and privacy

All five consumers need `<SERVICE>_USER_URL`, `<SERVICE>_SERVICE_KEY_ID` and
`<SERVICE>_SERVICE_PRIVATE_KEY` (base64 PKCS8 RSA >=2048 bits), even if Kafka is disabled. User's
`USER_SERVICE_TRUSTED_KEYS` pins all five independent public keys with their service subjects.
Compose and local Kubernetes use private User service DNS; local Supplier/Order secrets must include
their signing keys. Existing Admin/Chat/Credit signing secrets are reused. The AWS secret preparation
script adds the missing Supplier/Order/Credit identities and User trust without rotating existing
credentials; no secret preparation or deployment is executed as part of this change.

Do not route `/internal/**` through Gateway or public ingress. Kubernetes User stays ClusterIP;
local NetworkPolicies already permit service-to-User traffic for JWKS on the same port. The User
Compose host mapping is loopback only. Production internal traffic requires TLS via the selected
service-network/mesh configuration; the checked-in HTTP application URLs alone do not supply TLS.
Readiness health does not mean private keys/trust/TLS are correctly provisioned: acceptance must
exercise a protected request with each service identity. No new required Compose interpolation
variable is introduced; absent identities fail closed for protected operations.

## Revocation window and token-session exclusions

There is no cache or event-propagation delay. A request/delivery authorized immediately before a
ban or role removal can finish afterward. Remote checks and independent service transactions are
not globally atomic, and an in-flight operation can wait for its local transaction/locks after the
check. There is no promised fixed upper bound on that concurrency interval. Already transmitted or
buffered WebSocket frames cannot be recalled. Idle unauthorized sockets receive no new application
messages and close at their next checked frame/delivery. Reactivation or restoration of an assignment
can restore use of an otherwise unexpired token. Role switching does not revoke other roles.

This feature revokes current account/role permission, not individual bearer tokens. Existing User
requirements explicitly defer all-session invalidation after password changes: the current browser
signs out, but existing access tokens can survive until their 15-minute expiry. Logout clears local
browser credentials; it has no server token denylist. No approved password-reset token invalidation
requirement was found; adding token/session versions, password-reset invalidation or persistent logout
revocation requires a separate brief and explicit requirements confirmation.

## Manual acceptance

Automated verification: run each affected service's documented `mvnw verify`. User's
`CurrentUserSecurityTest` issues tokens through the actual `JwtTokenService` before changing persisted
account state. `AdminEligibilitySecurityTest` checks private caller ACLs and current response data.
Each consumer's `CurrentAuthorizationBoundaryTest` uses real signed bearer tokens, its actual
authorization filter/client and an explicitly test-owned authenticated User HTTP fixture; it checks
ban/role changes, unaffected users, resource denial, malformed responses and outage/recovery. Chat
also exercises existing-session inbound/outbound interceptors, actual SIMP delivery headers, closure
and expiry. Existing resource, lifecycle and Kafka suites remain separate regression coverage.
These fixtures do not establish deployed six-service acceptance or production TLS readiness.

Shared checks: `python3 .github/scripts/compose_env_check.py`,
`python3 docs/contracts/validate_contracts.py` with its pinned validation dependencies,
`docker compose config --quiet`, and YAML/shell validation for the changed runtime configuration.

Use disposable accounts, two active administrators, and an existing requester/courier errand. Save
the original JWT strings before each change; do not log in again when testing their denial.

1. Provision all five service identities and User trust. Verify a protected request succeeds through
   Gateway in each consumer. Verify `/internal/users/<id>/authorization` is unreachable through
   Gateway and rejects anonymous/browser JWT calls directly. Supplier/Order assertions may call
   authorization but cannot read `/internal/users/admin-operations/<operationId>`.
2. Save Requester, Courier and Admin JWTs for the same test account. Establish a Chat WebSocket,
   CONNECT with each selected-role token on separate sessions and SUBSCRIBE to `/user/queue/chat`.
   Verify authorized REST history/image access and live delivery before revocation.
3. From the second administrator ban the account. Reuse the original tokens against User profile
   and mutations, Supplier mutations, Order operations, Credit queries, Admin reports/cases and
   Chat history/send/images. Expect 403 with no effects; public Supplier discovery stays public.
   Trigger delivery to the established sockets: no application message, then socket closure.
   An unrelated user's authorized requests and delivery must still succeed.
4. Reactivate, reconnect and verify recovery. Remove ADMIN while retaining REQUESTER; the saved
   Admin token must fail on protected APIs and sockets, while the saved Requester token still obeys
   ordinary permissions. Self/final-active-admin removal/ban must remain protected. Repeat selected
   role removal for Courier using an approved User-owned fixture if no public revocation API exists.
5. Verify another requester's edit/cancel/complete and another courier's pickup/delivery/withdrawal
   remain denied. Check historical courier message epochs and unauthorized image/case access.
6. Stop User after a successful request. Valid-token protected consumer REST requests return 503
   without mutation; established WebSocket delivery is suppressed and the session closes. Restore
   User and verify the next request uses current state, including a ban applied during recovery.
7. Delay a new Admin credit correction/ban command, revoke its requesting administrator, then
   consume it. Expect recorded ACTOR_NOT_AUTHORIZED with no balance/status effect. Repeat Credit
   consumption during User outage: retry/UNKNOWN, no financial effect; restore and reconcile using
   the same operationId. Replay a completed command after revocation and outage: identical recorded
   outcome, no repeated financial effect or re-ban after reactivation.
8. Verify expiry, wrong signature/issuer/audience and forged service identities still fail. Verify
   logout/password change behavior matches the token-session exclusions above.

Record affected-owner review and explicit user manual acceptance in the chat; neither is implied
by automated tests or by the feature-brief approval.
