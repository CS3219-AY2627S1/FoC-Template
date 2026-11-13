# User Service

The D2 Friend on Campus User Service uses Spring Boot, Java 17, PostgreSQL, Flyway,
Actuator, and OpenAPI. It provides NUS-email registration and verification, login,
password reset, protected profile management, first-administrator bootstrap, and protected
administrator role/lifecycle APIs. Supplier administration remains owned by the Supplier
frontend; this service provides the role and token contract it consumes.

Owned by Darryl. See [`AGENTS.md`](AGENTS.md) for the coding boundary and
[`../TASK_SPLIT.md`](../TASK_SPLIT.md) for team responsibilities.

## Prerequisites

- Java 17
- Docker Desktop, for PostgreSQL and containerized runs

Maven does not need to be installed globally because this service includes the Maven Wrapper.

## Run tests

From the `user-service` directory, run the complete backend verification suite:

```powershell
.\mvnw.cmd --batch-mode --no-transfer-progress verify
```

On macOS or Linux:

```sh
./mvnw --batch-mode --no-transfer-progress verify
```

## Run locally

For the course-aligned Minikube deployment with persistent PostgreSQL, see
[`k8s/README.md`](k8s/README.md). The Compose instructions below remain available independently.

From the repository root, create a local environment file before the first run if one
does not already exist. Fill in `USER_DB_*` and `JWT_PRIVATE_KEY` before running any
`docker compose` command (even when starting only `user-db`, Compose checks required
variables for the whole file). The local service credentials below must match `.env`;
`.env` is local-only and must never be committed:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Start the dedicated User PostgreSQL database:

```powershell
docker compose up -d user-db
```

Then, from `user-service`, start the application:

```powershell
$env:DB_HOST = "localhost"
$env:DB_PORT = "5434"
$env:DB_NAME = "user_db"
$env:DB_USER = "user_user"
$env:DB_PASSWORD = "change-me"
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$env:JWT_PRIVATE_KEY = [Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey())
.\mvnw.cmd spring-boot:run
```

The two JWT commands generate an ephemeral development key. For a persistent environment, generate
the key once, store the Base64-encoded PKCS#8 private key in the deployment secret store, and set it
as `JWT_PRIVATE_KEY`. Never commit or share this value.

The service listens on port `8081`. Verify its health in another terminal:

```powershell
Invoke-RestMethod http://localhost:8081/actuator/health
```

## Run with Docker Compose

From the repository root, put `USER_DB_NAME`, `USER_DB_USER`, `USER_DB_PASSWORD`, and a
Base64-encoded PKCS#8 `JWT_PRIVATE_KEY` in the local `.env`. For live verification and
reset email, also set `MAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY`, and
`SENDGRID_FROM_EMAIL` there. Use a verified SendGrid sender and a real NUS inbox.
Generate a development-only private key in PowerShell with:

```powershell
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
[Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey())
```

Copy the output into `JWT_PRIVATE_KEY` in `.env` without quotes. Keep a stable key across
restarts in any persistent deployment; changing it invalidates outstanding JWTs. Start the
complete shared-origin stack:

```powershell
docker compose up --build
```

The User Service container reports healthy only after its Actuator endpoint responds;
Compose waits for this check before starting the gateway. Supplier Service startup is
checked independently.

Open <http://localhost:8088>. The production React bundle is built into the User Service JAR,
served under `/user-assets/**`, and reached through the gateway. There is no separate production
frontend container. Port `8081` remains available for User Service debugging. From another
terminal, check `docker compose ps` and `Invoke-RestMethod http://localhost:8081/actuator/health`.
For local frontend-only development, run `npm run dev` from `user-service/frontend`; Vite remains
on port `5174` and proxies API requests through the gateway on port `8088`.

The User database is independent of the Supplier database. It is stored in the
`user-db-data` Docker volume and is available to local PostgreSQL tools at
`localhost:5434`.

## OpenAPI and Swagger UI

With the service running, the live User API contract is available at:

```text
Swagger UI: http://localhost:8081/swagger-ui/index.html
JSON:       http://localhost:8081/v3/api-docs
YAML:       http://localhost:8081/v3/api-docs.yaml
```

Future schema changes must be introduced through forward-only Flyway migrations in
`src/main/resources/db/migration`.

## Register

`POST /api/users/registrations` accepts an email from `@u.nus.edu`, `@u.duke.nus.edu`, or
`@u.yale-nus.edu.sg`, a case-insensitively unique username of at most 20 characters, and a
15–64-character password. New accounts are `UNVERIFIED` with the persisted `REQUESTER` role and cannot log in
until their NUS email is verified.

## Email verification

After registration, the service sends a six-digit verification code through Twilio SendGrid. Codes
are stored only as verifiers, expire after 10 minutes, allow five attempts, and become unusable after
successful verification. Confirm the code with `POST /api/users/email-verifications`, supplying
`email` and `code`; success returns `204 No Content` and activates the account.

Use `POST /api/users/email-verification-resends` with `email` to resend a code. Resends are limited
to one email per 90 seconds and invalidate all earlier verification attempts. A request before the
cooldown expires returns `429 Too Many Requests` with a `Retry-After` header. Per the approved
product rule, resend returns specific responses: `404` for an unknown email, `409` when already
verified, and `403` for a banned account.

Email verification uses the same `MAIL_PROVIDER`, `SENDGRID_API_KEY`, and `SENDGRID_FROM_EMAIL`
environment variables documented under Password reset. Never commit these credentials or a code.

## Activation events and Kafka

The existing email-verification endpoint still returns `204 No Content`. On its first successful
`UNVERIFIED → ACTIVE` transition it now saves one `UserActivated` event in `user_event_outbox`
**in the same database transaction** as activation and code use. Invalid, expired, replayed or
concurrent losing verification requests do not create another event. A failure to save the outbox
row rolls back activation too. Migration V10 is additive; old Flyway migrations are unchanged.

The event follows [version 1 of the shared blueprint](../docs/integration/event-communication-blueprint.md):
topic `user.events`, key = User UUID, `producer=user-service`, `aggregateType=User`,
`aggregateVersion=1`. Its data contains `operationId`, `userId` and `activatedAt`. The complete
envelope, event/operation/correlation IDs and key are stored once and reused for retries. It
contains no email, password, verification code or JWT. There is no automatic backfill for
already-active accounts, and administrator unban/reactivation emits no new activation event.

### Transport configuration

Activation events are always recorded. Sending is disabled by default so standalone/test and
existing Kubernetes environments do not require Kafka before they are configured. The shared
Compose User container explicitly enables publishing and already supplies its own `user_service`
SASL identity. Start/initialize the [shared broker](../deploy/kafka/README.md) before expecting
delivery. Kafka being offline does not block activation or change User's database-backed health.
The producer connects lazily, so a temporarily unresolvable broker hostname also leaves events
pending instead of preventing User startup. Invalid enabled-publisher credentials/settings fail
configuration validation; do not log their values.

| Setting | Default/purpose |
| --- | --- |
| `USER_EVENTS_PUBLISHER_ENABLED` | `false`; Compose sets `true` |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:29092`; Compose sets `kafka:9092` |
| `KAFKA_SECURITY_PROTOCOL` | `SASL_PLAINTEXT` locally; AWS MSK uses encrypted `SASL_SSL` |
| `KAFKA_SASL_MECHANISM` | `PLAIN` locally; AWS MSK uses `SCRAM-SHA-512` |
| `KAFKA_USERNAME` | `user_service` |
| `KAFKA_PASSWORD` | Runtime secret; Compose maps `KAFKA_USER_SERVICE_PASSWORD` from ignored `.env` |
| `USER_EVENTS_POLL_INTERVAL_MS` | `5000` between bounded batches |
| `USER_EVENTS_INITIAL_DELAY_MS` | `5000` before the first batch |
| `USER_EVENTS_BATCH_SIZE` | `10` rows at most per batch |
| `USER_EVENTS_SEND_TIMEOUT_MS` | `5000` acknowledgement timeout; metadata acquisition is separately bounded by the same duration |
| `USER_EVENTS_RETRY_DELAY_MS` | `10000` after each failed application-level send |

Explicit `PLAINTEXT` is supported for isolated test brokers only; never use it as a workaround
for the shared broker's authentication. The local `SASL_PLAINTEXT` setup authenticates but does
not encrypt traffic. Encrypted deployments use `SASL_SSL` and trusted broker certificates.
Never copy database/JWT secrets into an event or reuse the broker administrator identity.

### Delivery, failures and recovery

The background relay locks one ready outbox row at a time using `FOR UPDATE SKIP LOCKED`, allowing
multiple User replicas without simultaneous claims of that row. It sends with `acks=all`, producer
idempotence, and one in-flight request per connection, and sets `published_at` only after broker
acknowledgement. No User row is locked while waiting for Kafka. Failed/uncertain sends increment
the attempt count, store only a bounded error category and remain pending for retry after the
configured delay. There is no retry-exhaustion discard or producer DLT: unsent activation facts
remain in the source outbox until recoverable. Consumer retries/DLT handling belong to Credit.

A crash after broker acknowledgement but before the database commit can deliver the same event
again. Delivery is **at least once**, not end-to-end exactly once: Credit must deduplicate the
stable event/operation IDs and allocate credits at most once. These changes do not implement the
Credit consumer, calculate credit amounts, or replace the existing demo-profile UI fallback.
Pending rows survive application/database restarts on retained storage. Acknowledged rows are
retained for diagnosis; production retention/cleanup remains a reviewed follow-up.

Logs record event type, event/operation/correlation IDs, attempt and outcome only. Micrometer
records `user.events.published`, `user.events.publish.failures`, `user.events.outbox.pending`,
and `user.events.outbox.oldest.age.seconds`. No additional public Actuator endpoints are exposed.
Inspect metadata without printing event payloads or credentials:

```sql
SELECT event_id, user_id, attempt_count, published_at, next_attempt_at, last_failure
FROM user_event_outbox ORDER BY occurred_at;
```

Local Minikube supplies the publisher enable flag, `kafka:9092` broker address and `user_service`
credential through its reviewed Deployment and `user-kafka-client` Secret. AWS staging instead
projects the same identity into the User pod and connects it to the private MSK SCRAM endpoints.
Provision the selected broker before the application. Kafka does not belong on the HTTP gateway.
Check database compatibility before rolling an application image back.

### Verification

Run `./mvnw --batch-mode --no-transfer-progress verify` (Windows: `mvnw.cmd`). Docker is required
for the new disposable PostgreSQL and Kafka integration tests. They test atomicity, rollback,
duplicate/concurrent verification, no historical/unban backfill, real broker delivery and
outage/recovery with stable payloads. Their isolated broker uses plaintext; unit tests verify the
shared SASL/JAAS settings and credential escaping. Never treat a skipped Docker test as a pass.

For manual acceptance, use Compose with the broker initialized and real SendGrid delivery:
register and verify a new test account, then confirm its persisted event is acknowledged in Kafka.
Pause only the broker, verify another new account, confirm the event stays pending, resume the
broker and confirm delivery. Do not delete volumes, log OTPs, bypass verification or expect
credits to appear until Credit's Kafka consumer is deployed.

## First administrator bootstrap

The first administrator is deployment-only: there is no HTTP endpoint and no default credential.
For the first deployment only, inject all of these secrets together:

```text
ADMIN_BOOTSTRAP_EMAIL=first.admin@u.nus.edu
ADMIN_BOOTSTRAP_USERNAME=First Admin
ADMIN_BOOTSTRAP_PASSWORD=a-password-with-at-least-15-characters
MAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=verified-sender@example.com
```

The bootstrap uses a database-locked singleton state, so concurrent instances and restarts create
or promote only one administrator. If its configured email or username belongs to an existing
account, that account retains its `REQUESTER` assignment and is additionally assigned `ADMIN`; existing profile values and password are unchanged.
For a new or still-unverified account, the normal verification OTP is sent and the account cannot
log in until verification succeeds. An already active account needs no new OTP.

Bootstrap is disabled when all `ADMIN_BOOTSTRAP_*` values are blank. Supplying only some of them,
invalid NUS credentials, incomplete SendGrid configuration, or a SendGrid delivery failure stops
application startup. After a successful run, remove the three bootstrap secrets from the deployment;
the persisted completion state also makes later starts no-ops. Never commit these values.

## Login and JWT verification

`POST /api/users/login` accepts an email and password. It returns a `Bearer` access token valid for
15 minutes, its ISO-8601 expiry, stable `userId`, `username`, effective `role`, and persisted
`availableRoles`. Unknown emails, incorrect
passwords, and banned accounts all receive the same `401 Unauthorized` response. An unverified
account receives `403` with Problem Detail code `EMAIL_VERIFICATION_REQUIRED` only after the supplied
password has matched; clients use this to direct that legitimate user to email verification.

Tokens are signed with RS256 and contain these claims:

| Claim | Value |
| --- | --- |
| `sub` | Stable User UUID |
| `username` | User's display username |
| `role` | The single effective session role: `REQUESTER`, `COURIER`, or `ADMIN` |
| `iss` | `friend-on-campus-user-service` |
| `aud` | `friend-on-campus-api` |
| `iat`, `exp` | Issue and 15-minute expiry timestamps |

The public key set is published at `GET /.well-known/jwks.json`. Every backend service that accepts
these tokens must verify the `RS256` signature using the key selected by `kid`, and require the
issuer, audience, and expiry claims above. Consumers must use this endpoint rather than User Service
database access; they should cache keys and refresh them when an unfamiliar `kid` is received.

`GET /api/users/me` returns the authenticated user's persisted profile. Send the access token as
`Authorization: Bearer <token>`. Its response contains the stable user ID, NUS email, username,
persisted `roles`, account status, and account creation timestamp. `PATCH /api/users/me/username` accepts
`{"username":"..."}` and returns the updated persisted profile. Usernames are required, at most
20 characters, and unique case-insensitively; an already-used username returns `409 Conflict`.
The profile API does not permit changing email, role, or status.
The live profile reflects a changed username immediately. An already-issued JWT keeps its prior
username claim until it expires or the user signs in again; services must use the stable user ID,
not that display-name claim, as the account identifier.

### Role assignments and session role selection

Each account has one or more persisted assignments: every existing and newly registered account is
assigned `REQUESTER`; selecting Courier adds the `COURIER` assignment; and the protected
administrator lifecycle API grants or removes the additional `ADMIN` assignment. An account may
hold `REQUESTER` plus `COURIER` and/or `ADMIN`, but each JWT deliberately carries only one
effective role so downstream services can authorize the active workspace without interpreting a
list of roles. Login always starts a new session as `REQUESTER`.

`PATCH /api/users/me/session-role` accepts `{"role":"REQUESTER"}`, `{"role":"COURIER"}`, or
`{"role":"ADMIN"}` and returns a replacement Bearer token, expiry, stable user ID, username,
effective `role`, and `availableRoles`. The caller must be authenticated and active. Any active
Requester may select Courier (which persists the Courier assignment); only an account with the
persisted Administrator assignment may select Admin. A caller cannot manufacture an Admin token by
changing a browser value or request body. Replace the browser's stored access token with the
returned token immediately. The prior token can still be used until expiry while its selected role remains assigned and the
account remains ACTIVE. Every protected operation checks current account/role authorization.
Switching workspace alone does not revoke another role or invalidate other session tokens.

`PATCH /api/users/me/password` accepts the authenticated user's `currentPassword` and a
15–64-character `newPassword`. The current password must match and the replacement must differ
from it before the new value is BCrypt-hashed and stored. A successful browser password change signs that browser session out;
sign in again with the new password. Existing RS256 access tokens are stateless and can remain
valid until their normal 15-minute expiry; immediate all-session token revocation is deferred to
a future token-session design.

With the service running and SendGrid configured, this PowerShell sequence registers an
account, verifies the code from its NUS inbox, then logs in and reads the profile.
Use a new email/username for each run. Before verification, the correct password returns
`403` with `EMAIL_VERIFICATION_REQUIRED`; an incorrect password returns the generic `401`:

```powershell
$registration = @{ email = "alice@u.nus.edu"; username = "Alice"; password = "password-with-at-least-15-chars" } | ConvertTo-Json
Invoke-RestMethod -Method Post http://localhost:8081/api/users/registrations -ContentType "application/json" -Body $registration
$login = @{ email = "alice@u.nus.edu"; password = "password-with-at-least-15-chars" } | ConvertTo-Json
$verification = @{ email = "alice@u.nus.edu"; code = (Read-Host "Six-digit code from the NUS inbox") } | ConvertTo-Json
Invoke-RestMethod -Method Post http://localhost:8081/api/users/email-verifications -ContentType "application/json" -Body $verification
$session = Invoke-RestMethod -Method Post http://localhost:8081/api/users/login -ContentType "application/json" -Body $login
Invoke-RestMethod http://localhost:8081/.well-known/jwks.json
Invoke-RestMethod http://localhost:8081/api/users/me -Headers @{ Authorization = "Bearer $($session.accessToken)" }
```

## Administrator role and lifecycle API

Account-management success feedback appears as small status text and clears after three
seconds, matching the profile feedback timing. Account status badges remain visible.
User cards use shield controls, a red ban action and a green reactivation action.
Icons supplement visible
text labels; confirmation and self/final-administrator protections remain unchanged.

Admin foundation also adds private `GET /internal/users/{userId}/admin-eligibility`.
It accepts only Admin/Chat/Credit service assertions pinned by `USER_SERVICE_TRUSTED_KEYS`,
independently of User JWT keys, and returns `{userId, active, administrator}` from current
persisted state (404 if absent). User/browser tokens cannot access it. The trust map defaults
to empty, denying all callers. See [Admin foundation setup](../admin-service/README.md) for
the key format, local setup and service-token validation rules. This route is not public
gateway scope; shared network/TLS configuration remains a deployment prerequisite.

The User frontend provides account administration at `/?view=users` through **Manage users**
in Admin mode. The broader dispute/case dashboard remains future N2H work. Every endpoint below
requires an `Authorization: Bearer <access-token>` for an account that is currently
both `ADMIN` and `ACTIVE` in the User database. A stale token for a demoted or banned account is
rejected even if its JWT still contains the `ADMIN` role claim.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/users/admin/accounts?query=&page=0&size=20` | Paged account summaries; `query` searches email/username, or matches one exact canonical account UUID (case-insensitive). |
| `PATCH /api/users/admin/accounts/{id}/role` | Body `{"administrator":true}` grants, or `{"administrator":false}` removes, the additional `ADMIN` assignment for an active account. |
| `PATCH /api/users/admin/accounts/{id}/status` | Body `{"status":"BANNED"}` bans an active account, or `{"status":"ACTIVE","reason":"Reviewed appeal"}` reactivates a banned account with mandatory reason/audit. |

There is deliberately no account-deletion API. Role changes and bans are allowed only for active
accounts; unverified accounts cannot be banned. Administrators cannot demote, ban, or delete
themselves. The service serializes role/lifecycle changes and rejects any demotion or ban that
would remove the final active administrator. Invalid transitions return `409 Conflict`; a missing
target returns `404`; non-admin callers return `403`.

## Password reset

`POST /api/users/password-reset-requests` accepts only the registered NUS student domains
(`@u.nus.edu`, `@u.duke.nus.edu`, or `@u.yale-nus.edu.sg`). An ineligible domain returns `400 Bad
Request`. For an eligible address, it always returns `202 Accepted` whether or not that address has
an account. For an active account it invalidates any previous reset code, sends a new six-digit code,
and keeps only a verifier in the database. Codes expire after 10 minutes, allow five attempts, and
cannot be reused after a successful reset. Banned accounts do not receive a reset code and remain
banned.

Requests are limited to one reset email per address every 90 seconds. The endpoint always returns
the same `202` response and a `Retry-After` header for both known and unknown **eligible** addresses;
during the cooldown it does not issue or invalidate another code. Email-provider failures are
also masked by that response; if no message arrives, retry after the cooldown. This preserves the
anti-enumeration contract while allowing the frontend to use the server-provided cooldown.
Concurrent requests for the same account are serialized for login, email verification, and reset-code
validation; a database guard also serializes the first reset request before its per-email cooldown exists.

`POST /api/users/password-reset-verifications` accepts an eligible NUS `email` and the six-digit `code`.
It validates the code without consuming it and returns `204 No Content`, allowing a client to show the
password-entry screen only after successful validation. The existing
`POST /api/users/password-reset-confirmations` then accepts an eligible NUS `email`, `code`, and a
replacement password (15–64 characters); it revalidates and consumes the code when changing the password.
The replacement must differ from the stored password; this rule is checked only after a valid code is supplied.
Invalid, expired, replayed, and exhausted codes return the same `400` Problem Detail response from either
endpoint.

To send real email, configure Twilio SendGrid through environment variables before starting the
service. Do not put these values in source control:

```powershell
$env:MAIL_PROVIDER = "sendgrid"
$env:SENDGRID_API_KEY = "your-sendgrid-api-key"
$env:SENDGRID_FROM_EMAIL = "noreply@example.com"
```

Without `MAIL_PROVIDER=sendgrid`, the local mailer is deliberately disabled and never logs or exposes
reset codes. Registration in that mode still creates an `UNVERIFIED` account, but no OTP reaches
the inbox, so a full manual registration/login demo requires working SendGrid configuration.
Tests use fake mailers instead.

## Frontend

From `user-service/frontend`:

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

The Vite development server runs at `http://localhost:5174` and proxies `/api` through the gateway
on port `8088`. Production assets use `/user-assets/**` and are packaged inside the User Service.
The frontend includes registration, email-verification and resend-code screens, login, and
password-reset flows.
When sign-in is requested from an Admin participant report, successful authentication returns
to the same report or errand-scoped report form. This participant return path does not select
Admin mode or grant administrator access; Admin enforces report privacy on its own API.
Sign-in also preserves approved errand and administrator case/queue destinations. For an Admin
destination, a backend-advertised ADMIN assignment permits a real session-role request before
navigation; no browser-only flag grants access. Selecting Switch to Admin from Profile now opens
the Admin queue. Accounts without the assignment never receive an ADMIN token through this flow.

Successful registration moves directly to six accessible OTP boxes with the registered email already set;
entering the sixth digit automatically submits the verification. The resend button displays its 90-second
cooldown and is disabled until another request is allowed.
When a user supplies the correct password for an unverified account, login likewise moves to that
verification screen; incorrect credentials and banned accounts remain a generic login failure.
Password reset similarly uses six OTP boxes; only a validated code opens the new-password screen.
The reset OTP screen keeps the user in place when requesting another code, shows a browser-side
server-synchronized resend countdown, and offers only a successful OTP path or **Back to sign in**. After a
password update, the frontend shows a completion screen with only **Sign in**. If a reset is unfinished,
returning to **Sign in** and selecting **Forgot password?** in the same browser session returns directly to
the existing code-entry screen; it never stores the OTP or a password, and a new code is sent only after
the server-synchronized resend cooldown.

For sign-in protection, three consecutive incorrect passwords temporarily lock a non-banned account
for 30 seconds. Lockouts, unknown emails, wrong passwords, and banned accounts all return the same
generic authentication failure. The failed-attempt count clears after the cooldown, successful sign-in,
or a successful password reset.

After two generic failures for the same email in one browser session, the frontend adds neutral guidance
to wait 30 seconds or reset the password. This is a browser-only usability aid, not a security control,
and is shown for unknown emails too so it does not reveal whether an account exists.

After login, the signed-in Home follows the shared editorial design with a task-led hero, real links
for requesting or running errands, and responsive shortcuts to Errands, Suppliers and Credits. The
reference design's example activity counts, search results and stock errand imagery are deliberately
not reproduced because User Service does not own authoritative data for them. The existing local brand
artwork provides the visual hero instead. The profile remains on Home and shows persisted email,
username, and the current effective role. A user can change their username or password from this
screen; password changes require the current password and sign the browser session out after success.
Role assignments, account status, and creation time remain protected API data; account status and
creation time are not shown in the everyday profile UI.

Every new login starts as Requester. The persistent Profile and Supplier headers use an accessible
**Acting as** segmented selector with `Requester` and `Courier` choices; selecting Courier exchanges
the current token for a Courier token and records that extra assignment. The username is an account-menu
trigger that links to Profile and offers **Admin mode** to accounts with the persisted Administrator
assignment. Selecting Admin likewise exchanges the token, rather than changing only browser state. On
Profile, it keeps the user on Profile; in Supplier, it opens Supplier administration. Returning to
Requester exchanges the token again before public Supplier routing. Profile displays `Account access`
as `Admin` or `User`, which describes the persistent entitlement rather than the current workspace.
Signed-out users can browse Suppliers without signing in.

The production User and Supplier SPAs share the API-issued session object in
`sessionStorage["foc.user-session"]` because both are presented from `http://localhost:8088`. The
stored session is rejected and cleared when malformed or expired. It contains the short-lived access
token, its single effective role, and the account's available assignments; it contains no password.
Each role selection replaces this object with the response from
`PATCH /api/users/me/session-role`. There is no `foc.ui-mode` authorization or presentation flag.
The authenticated Profile header and service cards link to Locations and the user's Credit dashboard.
After successful login, the shared frontend starts the Credit Service's authenticated, idempotent
account activation in the background; login still succeeds if Credit is temporarily unavailable,
and the Credit dashboard retries activation when opened.
Every successful login opens Profile except when authentication was requested by the protected Credit
page, which returns to that validated same-origin route. Supplier `returnTo` destinations continue to
open Profile. A `returnTo` value accepts only approved relative Supplier and Credit UI routes; absolute,
external, API, and malformed destinations are rejected. An Admin destination
never silently elevates a Requester or Courier token: the administrator must explicitly select Admin
mode. Backend authorization always uses the signed JWT's effective role.

Admin mode exposes a **Manage users** dashboard from Profile and the account menu. It lists and searches
accounts through the protected lifecycle API and lets an administrator grant or remove the additional
Administrator assignment, ban active accounts, and reactivate banned accounts. Destructive changes use
an explicit confirmation and display backend conflict messages. The current administrator is labelled
and has no self-demotion or self-ban controls; the backend remains authoritative and also protects the
final active administrator. Supplier administration remains available through the Supplier frontend
with an effective Admin token.

For the complete presentation flow, use `http://localhost:8088`. For a standalone frontend smoke
test, use `http://localhost:5174`. Register a fresh NUS address,
confirm that login is refused until the delivered OTP is entered, verify the email,
log in and inspect the profile, then sign out. Request a password reset, enter the
new OTP and password, and confirm that the old password fails while the new one works.
The first-admin bootstrap must be tested with a dedicated, empty User database or a
previously unused deployment; it is one-shot and should not be retriggered by deleting
the existing database volume. Role/lifecycle API checks require an already verified
administrator and at least one additional active test account. In Admin mode, open **Manage users**,
search for that account, promote it, then sign in as that account and confirm Admin mode is available.
Do not delete production data for a manual test.

## Case sanctions integration

See [sanctions ownership, behavior, recovery and verification](../admin-service/SANCTIONS_INTEGRATION.md).

The prepared local Kubernetes Deployment enables the existing `USER_ADMIN_COMMANDS_ENABLED`
listener using User's existing Kafka identity. Activate only after the documented topic/group/DLT
ACLs are present. No signing key, database credential or account is replaced for activation.
Authenticated Chat alone can read User's immutable original outcome at
`GET /internal/users/admin-operations/{operationId}`; absence is 404 and unavailable storage is 503.
That read creates no sanction and exposes no private audit reason. See the
[approved completion protocol](../docs/integration/chat-admin-contract.md#integration-completion-refinements--9-november-2026)
and [actual readiness/acceptance record](../admin-service/INTEGRATION_READINESS.md).
`AdminOperationSecurityTest` verifies the route over real HTTP/PostgreSQL with independently
generated test-only service identities, including wrong audience, non-Chat caller and missing result.

## Current account authorization

Protected operations require the verified JWT's selected role to remain assigned to an ACTIVE
User account. Current User decisions are never cached; denial is 403 and dependency uncertainty
is 503. Existing resource and lifecycle rules still apply. See the
[current authorization contract and acceptance checks](../docs/integration/current-authorization.md).
