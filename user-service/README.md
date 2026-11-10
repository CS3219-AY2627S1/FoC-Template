# User Service

Phases 0 through 6 provide a runnable FastAPI foundation, verified student
account creation, and revocable authentication. The service has database-aware
health checks, structured redacted logs, correlation IDs, Supabase SQL
migrations, bcrypt credential storage, Mailpit OTP verification, RS256 access
tokens, rotating refresh-token cookies, and self-only identity/profile
management. Requester and courier are order-level participant relationships on
the same stable user ID; they are not separate accounts, profile modes, or
system roles. Fixed User, Admin, and Super Admin role guards use current
server-side identity state. Supplier Service
verifies normal access tokens locally and asks User Service for a current,
fail-closed supplier-management decision immediately before an administrative
operation.

Verification email defaults to SMTP/Mailpit for development. Optional AWS SES
delivery uses the existing sender boundary and an EC2 role, without storing AWS
access keys. See [SES setup and development compatibility](docs/SES_EMAIL.md)
before enabling it; sandbox recipients, sender verification and IAM permissions
are separate from code deployment.

Chat Service uses the dedicated, private [chat identity interfaces](docs/chat-integration-contract.md)
for caller-authorized partial username search and current participant lookup. Configure
`CHAT_SERVICE_SHARED_SECRET` separately from Supplier Service's secret. The participant
POST is a read-only batch lookup and needs no browser bearer token. See the
[verification and handoff](docs/chat-integration-verification.md) for isolated test/demo commands.

Verified registration and Super Admin bootstrap both write a durable
`user.registered.v1` outbox record in the same database transaction as the
User and credential. The independently restartable `outbox-publisher` Compose
service publishes exactly `eventId`,
`eventType`, `userId`, and `occurredAt` to the durable `foc.events` RabbitMQ
topic exchange. It stores no password, profile, OTP, refresh token, or other
credential data in the event path. Consumer services must treat `eventId` and
`userId` as idempotency keys.

## Local development

Account status supports only `ACTIVE` and `DELETED`. Deletion remains terminal;
registering again creates a new user ID. Apply committed database migrations
before releasing the application and restart User Service afterward. The
account-status migration recreates the enum while preserving existing active
accounts and deleted tombstones, and aborts if any unsupported status is still
in use. Applied migration history remains unchanged.

Run these commands from this directory.

Local Supabase uses PostgreSQL port `15422` and Studio at
`http://localhost:15423`. Its other local ports share the `1542x` range, below
Windows' default dynamic port range to avoid virtual-networking reservations.

For an existing setup that used database port `54322`, run `npx supabase stop`
and update only the port in `.env`'s `DATABASE_URL` and `DATABASE_URL_DOCKER` to
`15422`, keeping their hosts and credentials. Run `npx supabase start` again;
the normal stop/start commands retain the database volume. Keep the existing
development secrets. To apply pending migrations to that saved database, use
`npx supabase migration up --local`; the reset below is for a disposable or new
database.

1. Install the pinned Supabase CLI package and start the isolated local
   PostgreSQL stack.

   npm install
   npx supabase start

2. Create a Python 3.13 environment, install the service, and generate
   development-only secrets. The generator reads the local database URL without
   printing it, writes ignored files only, and does not overwrite existing
   secrets unless explicitly run with --force.

   py -3.13 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install --upgrade pip
   .\.venv\Scripts\pip.exe install -e ".[dev]"
   .\.venv\Scripts\python.exe scripts\generate_dev_secrets.py

3. Apply the committed schema history to the local database.

   npx supabase db reset

4. Start the service, Mailpit, and RabbitMQ. The service reaches the Supabase
   CLI PostgreSQL container through the derived DATABASE_URL_DOCKER value and
   reaches RabbitMQ with the generated non-guest development credentials.

   docker compose up --build

The liveness probe is available at http://localhost:8000/health/live. Once
Supabase PostgreSQL is reachable, http://localhost:8000/health/ready returns
200. Mailpit is available at http://localhost:8025, RabbitMQ management at
http://localhost:15672, and its local-only AMQP endpoint is localhost:5672 for
the D2 event-capture demo.

The liveness endpoint never waits for PostgreSQL; the readiness endpoint
performs the database probe. The application never creates, modifies, or
migrates schema objects at startup. Standard `postgresql://` database URLs are
accepted and normalized to the asyncpg dialect internally.

## Tests and local database reset

Run the unit and ASGI integration tests:

    .\.venv\Scripts\pytest.exe

To run the real database readiness integration test, start local Supabase and
use the helper. It discovers the local database URL without echoing it:

    .\.venv\Scripts\python.exe scripts\run_tests_with_local_supabase.py

Migration upgrade/rollback tests create and remove temporary databases using
the local Supabase administrator connection. They require `CREATE DATABASE`
privileges and leave the configured database's schema and data unchanged.

The Supabase migration directory is the only migration history. Schema changes
must be created with:

    npx supabase migration new <description>
    npx supabase db reset

For the hosted project, authenticate with the Supabase CLI and link this local
project using the actual cloud project reference for foc-user-service:

    npx supabase link --project-ref <project-ref>

The CLI link state remains local and ignored. Do not place hosted database
credentials, Supabase URLs, or Supabase keys in this repository.

## Phase 1 manual smoke test

Keep `docker compose up --build` running, then use a second PowerShell window.
First confirm the service is ready:

    Invoke-RestMethod http://localhost:8000/health/ready

Create a valid, unique student account. The password below is an example only;
do not reuse it outside local testing.

    $registration = @{
      username = "phase1-smoke-user"
      email = "phase1-smoke-user@u.nus.edu"
      password = "Phase1SmokePass1!"
    } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri http://localhost:8000/v1/auth/registrations -ContentType "application/json" -Body $registration

Open http://localhost:8025, open the verification email, and copy its
six-digit code. Verify with that code:

    $verification = @{
      email = "phase1-smoke-user@u.nus.edu"
      otp = Read-Host "Mailpit verification code"
    } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri http://localhost:8000/v1/auth/email-verifications -ContentType "application/json" -Body $verification

The response must report `status: active` and `systemRole: USER`. Repeat the
registration request to see duplicate protection, or replace one field with an
invalid NUS email, a username containing a space, or a weak password to see
safe field errors.

## Phase 2 manual smoke test

Start from an account already verified through the Phase 1 flow. The development
secret generator creates the RSA key pair configured by `JWT_PRIVATE_KEY_PATH`
and `JWT_PUBLIC_KEY_PATH`; never copy those values into a request, response,
or source file.

In a second PowerShell window, log in and retain the web session so the
`HttpOnly` refresh cookie is sent automatically:

    $webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $login = Invoke-RestMethod -Method Post -WebSession $webSession -Uri http://localhost:8000/v1/auth/sessions -ContentType "application/json" -Body (@{
      email = "phase1-smoke-user@u.nus.edu"
      password = "Phase1SmokePass1!"
    } | ConvertTo-Json)
    $accessToken = $login.accessToken

The server caps every refresh session at 24 hours and invalidates a session
after 30 minutes without an authenticated request. Those limits apply even if
an older local `JWT_REFRESH_TOKEN_TTL_SECONDS` value is longer.

Read only the authenticated caller's profile:

    $authorization = @{ Authorization = "Bearer $accessToken" }
    Invoke-RestMethod -Headers $authorization -Uri http://localhost:8000/v1/users/me

Rotate the refresh session, then use the returned access token:

    $rotated = Invoke-RestMethod -Method Post -WebSession $webSession -Uri http://localhost:8000/v1/auth/sessions/refresh
    $authorization = @{ Authorization = "Bearer $($rotated.accessToken)" }
    Invoke-RestMethod -Headers $authorization -Uri http://localhost:8000/v1/users/me

The original access token is now rejected because its server-side session was
revoked during rotation. Finally, log out and confirm the rotated token is also
rejected:

    Invoke-WebRequest -Method Delete -WebSession $webSession -Headers $authorization -Uri http://localhost:8000/v1/auth/sessions/current
    Invoke-WebRequest -SkipHttpErrorCheck -Headers $authorization -Uri http://localhost:8000/v1/users/me

The final request must return `401`; the refresh token is never returned in JSON.
The public signing key is available at
`http://localhost:8000/.well-known/jwks.json`; it contains no private-key material.

## Phase 3 manual smoke test

Continue the Phase 2 browser session with its current `$authorization` header.
Update the authenticated caller's display name:

    $profile = Invoke-RestMethod -Method Patch -Headers $authorization -Uri http://localhost:8000/v1/users/me -ContentType "application/json" -Body (@{
      displayName = "phase3-renamed"
    } | ConvertTo-Json)
    $profile.userId
    Invoke-RestMethod -Headers $authorization -Uri http://localhost:8000/v1/users/me

Both responses must show the same `userId` and updated `displayName`.
Protected fields are rejected rather than ignored:

    Invoke-WebRequest -SkipHttpErrorCheck -Method Patch -Headers $authorization -Uri http://localhost:8000/v1/users/me -ContentType "application/json" -Body (@{
      systemRole = "ADMIN"
    } | ConvertTo-Json)

The request returns `422` and a subsequent profile read is unchanged. To
permanently delete the current account, supply its password and an explicit
acknowledgement. The service deletes its credentials and sessions, removes the
profile's PII, and retains only a de-identified `DELETED` tombstone with the
same stable user ID:

    $deletion = @{
      currentPassword = "Phase1SmokePass1!"
      acknowledgeDeletion = $true
    } | ConvertTo-Json
    Invoke-WebRequest -Method Delete -WebSession $webSession -Headers $authorization -Uri http://localhost:8000/v1/users/me -ContentType "application/json" -Body $deletion
    Invoke-WebRequest -SkipHttpErrorCheck -Headers $authorization -Uri http://localhost:8000/v1/users/me

The deletion returns `204`, clears the refresh cookie, and the final profile
request returns `401`. The same credentials can no longer log in; the released
email and username may later register a new account with a different user ID.

## Phase 4 Supplier authorization smoke test

The public JWKS endpoint remains available at
`http://localhost:8000/.well-known/jwks.json` for Supplier Service to cache and
use when checking a normal FoC access JWT. It contains only public signing-key
material.

Before any supplier create, update, or deactivation request, Supplier Service
must call User Service through the `foc-user-service-internal` Compose network.
It supplies the original user bearer token, the locally generated
`SUPPLIER_SERVICE_SHARED_SECRET`, and one of the declared supplier-management
actions. The exact request and fail-closed handling are documented in
[`docs/supplier-authorization-contract.md`](docs/supplier-authorization-contract.md).

For a local HTTP check, use an access token for a verified account and replace
the placeholders only in a local terminal; never commit or log the shared
secret:

    $headers = @{
      Authorization = "Bearer <access token>"
      "X-FoC-Service-Secret" = "<SUPPLIER_SERVICE_SHARED_SECRET>"
    }
    Invoke-RestMethod -Method Post -Headers $headers -Uri http://localhost:8000/v1/internal/authorization-decisions -ContentType "application/json" -Body (@{
      action = "SUPPLIER_CREATE"
    } | ConvertTo-Json)

An active `USER` receives a `200` response with `allowed: false`; active
`ADMIN` and `SUPER_ADMIN` accounts receive `allowed: true`. Missing service
identity, malformed or expired bearer tokens, and every timeout/error must deny
the supplier-management operation. Supplier Service must not make an
administrative decision from a JWT role claim or receive User Service database
access.

## Super Admin account management

The web client's **Manage admins** page at `/admin/users` is available only to
Super Admins. The exact username/email lookup at `GET /v1/admin/users` also
requires Super Admin access; Admins and ordinary Users receive `403`.

`GET /v1/admin/admins` returns the current non-deleted Super Admins and Admins,
with only `userId`, `username`, `email`, and `systemRole`. Super Admins appear
first, and each role group is sorted by normalized username ascending.
Deleted account tombstones are excluded even though their historical role is
retained. The page displays username, NUS email, and system role in vertically
stacked rows, and allows confirmed role changes for other accounts through the
existing role-update endpoint. It refreshes the list after changes made from
either a search result or a list row.

Account status supports only `ACTIVE` and terminal `DELETED` tombstones.
Existing role-lifecycle rules remain unchanged, and Admins retain their
existing Supplier management capabilities.

## Phase 5 administrator lifecycle smoke test

The first Super Admin is deliberately not created through the public
registration flow. After completing the local setup, set explicit values only
in the ignored `.env` file (or in a deployment secret store):

    BOOTSTRAP_SUPER_ADMIN_USERNAME=<valid-username>
    BOOTSTRAP_SUPER_ADMIN_EMAIL=<valid-nus-email>
    BOOTSTRAP_SUPER_ADMIN_PASSWORD=<valid-password>
    BOOTSTRAP_SUPER_ADMIN_DISPLAY_NAME=<optional-valid-display-name>

The username, email, display name, and password use the same validation policy
as registration. Create the initial verified authority once:

    .\.venv\Scripts\bootstrap-super-admin.exe

The command prints only the new user ID. It refuses to run if any active Super
Admin already exists, and it never prints the configured credentials or their
bcrypt hash.

With a valid Super Admin access token and a different active user ID, change
that user's system role through the Super Admin-only endpoint:

    $roleChange = @{ systemRole = "ADMIN" } | ConvertTo-Json
    Invoke-RestMethod -Method Patch -Headers @{ Authorization = "Bearer <super-admin-access-token>" } -Uri "http://localhost:8000/v1/admin/users/<target-user-id>/system-role" -ContentType "application/json" -Body $roleChange

Every successful role transition increments the target's `roleVersion`, revokes
all of the target's existing sessions, and appends an immutable redacted audit
record. Admins cannot make role changes; self-role changes fail. The service
uses a transaction-scoped PostgreSQL advisory lock so a demotion or
self-tombstone deletion cannot remove the last active Super Admin. After a
second Super Admin exists, a non-last Super Admin may use the normal confirmed
self-deletion flow.

## Phase 6 D2 demonstration and timing evidence

The Compose stack starts `outbox-publisher` alongside User Service. It claims a
pending event with a short database lease, publishes it with RabbitMQ publisher
confirms, and marks it published only after the broker accepts it. A transient
failure releases the lease, increments the observable attempt count, records a
safe error type, and schedules bounded exponential retry. A repeated delivery
can therefore retain the same event ID; the future Credit Service must process
that ID and user ID idempotently.

For one clean local database, configure the bootstrap Super Admin fields in the
ignored `.env` file and set a normal-user password only in the terminal. The
non-secret sample identity is in
[`docs/d2-demo-users.example.json`](docs/d2-demo-users.example.json).

Set `D2_DEMO_NORMAL_PASSWORD` to a local test password only in the terminal
that invokes the script; never place it in source control. Then run:

    .\.venv\Scripts\python.exe scripts\run_d2_demo.py

The script performs bootstrap, registration, Mailpit OTP verification, event
capture from RabbitMQ, login, protected-field rejection, Super Admin promotion,
and the User-to-Admin Supplier authorization transition. It prints neither
passwords, OTPs, access tokens, shared service secrets, nor RabbitMQ
credentials.

To record local p95 timing evidence, create one verified timing account and set
its email/password plus a separate registration-password variable only in the
current terminal. Then run:

    .\.venv\Scripts\python.exe scripts\measure_d2_timings.py --samples 10

The command emits p95 and mean milliseconds for registration, login, profile
read, and profile write. It establishes D2 instrumentation and a repeatable
measurement method; the specified scale tests remain planned for Sprint 4.
