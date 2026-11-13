# FoC User Service

The User Service manages student accounts and authentication for Friend on
Campus (FoC). It is responsible for user identity, profile information,
authentication sessions, roles, permissions, and account status. Other
microservices should access user data through this service's API; they must
not access its database directly.

## Responsibilities

- Register NUS student accounts.
- Validate registration input and enforce uniqueness of the NUS student
  number (User UID).
- Store passwords as one-way hashes and never expose plaintext passwords or
  password hashes in responses.
- Authenticate registered users and issue, validate, expire, and revoke
  sessions or equivalent authentication tokens.
- Provide authenticated users with their own profile and basic information
  about other users where permitted.
- Allow updates to mutable profile fields while protecting immutable and
  protected fields.
- Deactivate and reactivate user accounts without losing the account record.
- Manage user roles, permissions, and account statuses such as active,
  deactivated, and suspended.
- Produce structured logs for significant authentication and account-management events.

## User data

The service must collect and maintain the following registration/profile data:

- NUS student number (User UID)
- Email address
- Display/profile name
- Password hash
- Account role and status
- Account-creation timestamp
- Profile-update timestamp, where applicable

The NUS student number and account-creation timestamp are immutable. The
profile name, email address, and password are mutable, subject to validation.
Display names are trimmed at the edges and must contain only English letters
separated by single spaces; punctuation, digits, backslashes, and control
characters are rejected.
Sensitive profile information should only be exposed through an appropriate
authenticated response or consuming service; sensitive authentication data
must never be included.

## Authentication and authorization

### Registration

Registration should:

1. Validate required fields and normalize fields where applicable, including
   email addresses and NUS student numbers.
2. Reject duplicate NUS student numbers.
3. Reject empty, malformed, unsupported, or disallowed input.
4. Enforce the configured password policy: 8–100 characters, at least one
   number, one alphabetic character, and one special character.
5. Hash the password before persistence.
6. Create the account with the default status: active and non-administrative.

Failed registration attempts must not partially create an account or corrupt
existing user data.

### Login and sessions

Login must validate the supplied credentials against the stored password hash.
Successful authentication creates an authenticated session/token. Invalid,
expired, malformed, or tampered credentials/tokens must be rejected without
revealing whether a particular account exists.

Sessions expire after 30 minutes of inactivity or 24 absolute hours, whichever
comes first. Valid protected requests refresh the inactivity deadline but never
extend the absolute lifetime. Logout invalidates the session, and invalidated
sessions must not be accepted for protected operations.

Session validity and database cleanup are separate. Protected requests reject
expired or revoked sessions immediately based on their timestamps and
revocation state; the session row does not need to be deleted first. A
background cleanup job deletes revoked and expired session rows once when the
service starts and then hourly. Consequently, an unusable session row may
remain in the database for up to roughly one hour after it becomes invalid.

Protected requests must verify that the authenticated identity matches the
requested user where required. Ordinary users cannot grant themselves
administrative privileges, modify another user's profile, or perform
administrative operations.

### Roles and account status

The service supports regular users and administrators. Administrative
privileges must be explicitly authorized, persisted, and revocable.

An active administrator can promote another active user with
`POST /admin/users/{user_id}/grant-admin`. The target cannot be the caller,
already have administrator rights, or be inactive. Administrator rights can be
removed with `POST /admin/users/{user_id}/revoke-admin`. Administrators find
and review accounts with the read routes in
[Administrator account review](#administrator-account-review).

Account status changes must be enforced during authentication and protected
operations:

- **Active** — normal account access is allowed.
- **Deactivated** — set by the user; the account record is retained.
- **Suspended** — set by an administrator; access is blocked until changed.

Reactivating a profile must restore it to an active state and must not
silently create a new account.

## Profile access rules

- An authenticated user may view their own profile, including their NUS
  student number and display name.
- An authenticated user may view another user's basic profile information,
  limited to the profile name.
- An active administrator may view any account's full profile, in any status,
  through the `/admin/users` routes. Password hashes and session data are
  never returned.
- Sensitive information must be omitted or masked in full-value displays.
- Users may update permitted mutable fields only.
- NUS student numbers, account timestamps, roles, statuses, and another
  user's profile are not user-editable.
- Successful updates return the updated permitted profile fields.

## Security requirements

- Store passwords in a non-reversible form using a password-hashing
  algorithm; never persist or return plaintext passwords.
- Do not log passwords, password hashes, session tokens, or other sensitive
  authentication credentials.
- Require authentication and authorization for protected operations.
- Use generic authentication and registration errors that do not disclose
  account existence or internal implementation details.
- Keep the User Service database private to this service.
- Expose only the minimum user information required by each consuming
  service.
- Record structured audit logs for significant authentication and
  account-management events.

Audit events include `user_registered`, `registration_failed`,
`login_succeeded`, `login_failed`, `logout_succeeded`, `logout_failed`,
`profile_updated`, `password_changed`, `account_deactivated`,
`account_reactivation_failed`, and `account_reactivated`. Successful events
use user UUIDs; failed events use fixed reason codes such as
`invalid_credentials`, `identity_conflict`, or `database_unavailable`. These
events never include student numbers, email addresses, passwords, password
hashes, session tokens, or upstream exception text.

## Non-functional targets

The project requirements specify the following targets for the User Service:

- A normal login should complete within 2 seconds for at least 95% of
  requests under normal load.
- Support up to 60,000 active profiles.
- Remain available independently of unrelated services where possible.
- Avoid duplicate accounts when clients retry registration.
- Preserve persistent user data when another microservice fails.
- Encapsulate account, authentication, authorization, and profile logic in
  this service.

## API and integration notes

The implemented route names and request/response schemas are documented in
`../swagger.io` and in the examples below. The API contract documents, at a
minimum:

- Registration, login, logout, session validation/refresh, and profile
  operations.
- Authentication and authorization requirements for each operation.
- Validation rules and safe error responses.
- Which profile fields are returned to the account owner, other users, and
  consuming services.
- Account-status and role-management behavior.

Consuming services should depend on the User Service API or documented
authentication events, not on implementation details or direct database
access.

### Internal identity checks

Trusted services can validate a caller's bearer session and receive only the
minimal identity needed for authorization:

```bash
curl http://user-service:8080/internal/auth/identity \
  -H 'Authorization: Bearer <access-token>' \
  -H 'X-Internal-Service-Token: <USER_SERVICE_INTERNAL_TOKEN>'
```

The response is `{"id":"<user-id>","role":"user|admin","status":"active"}`.
Both the active user session and the internal service token are required. The
endpoint does not return email addresses, student numbers, or other profile
fields. Keep the internal token in deployment secrets and never forward it to
clients.

### Internal administrator checks

Trusted services can check a user's authorization without accessing the User
Service database directly:

```bash
curl --cacert /run/tls/ca.crt https://user-service:8080/internal/users/<user-id>/admin \
  -H 'X-Internal-Service-Token: <USER_SERVICE_INTERNAL_TOKEN>'
```

The response is only `{"is_admin": true}` or `{"is_admin": false}`. It is
`true` only for an existing active account whose persisted role is `admin`;
regular, unknown, deactivated, and suspended accounts return `false`.
Requests require the shared `USER_SERVICE_INTERNAL_TOKEN` configured for the
User Service and trusted callers. Keep this token in deployment secrets and
never forward it to clients.

Trusted services can also check the lifecycle state of a user:

```bash
curl --cacert /run/tls/ca.crt https://user-service:8080/internal/users/<user-id>/status \
  -H 'X-Internal-Service-Token: <USER_SERVICE_INTERNAL_TOKEN>'
```

The response is `{"status":"active"}`, `{"status":"deactivated"}`,
`{"status":"suspended"}`, or `{"status":"unknown"}` for a missing user.
Services that only need to authorize access should treat only `active` as
allowed. The exact status is useful when a consuming service needs different
messaging, workflow, or audit behavior for self-deactivation versus
administrator suspension.

### Administrator account review

An active administrator can list, search and read accounts in any status, so
a suspended or deactivated account can still be found, reviewed and
reinstated. `GET /users/{user_id}` cannot do this: it returns only the display
name, and only for active accounts.

```bash
curl --cacert /run/tls/ca.crt   'https://user-service:8080/admin/users?q=alice&status=suspended&limit=20&offset=0'   -H 'Authorization: Bearer <admin-access-token>'

curl --cacert /run/tls/ca.crt https://user-service:8080/admin/users/<user-id>   -H 'Authorization: Bearer <admin-access-token>'
```

`GET /admin/users` accepts these optional query parameters:

| Parameter | Values | Meaning |
| --- | --- | --- |
| `q` | up to 254 characters | Case-insensitive substring of the student number, email or display name. `%` and `_` match literally. |
| `status` | `active`, `deactivated`, `suspended` | Only accounts in this status. |
| `limit` | 1–100, default 20 | Page size. |
| `offset` | 0 or more, default 0 | Accounts to skip. |

It answers `{"items": [...], "total": <matching accounts>, "limit", "offset"}`,
newest accounts first, with the account ID breaking ties so pages don't
overlap. `GET /admin/users/{user_id}` answers one account, or `404` when it
does not exist. Each account has the same fields as `GET /users/me`.

Both routes return `401` without a valid session and `403` unless the caller
is an active administrator. The role is re-read from the database on every
request, so a session issued before admin rights were revoked loses access
immediately. Out-of-range parameters return `422`.

Account state is then changed with `POST /admin/users/{user_id}/suspend`,
`/unsuspend`, `/grant-admin` and `/revoke-admin`.

## Local development

The service is containerized from this directory. Once the application entry
point and dependencies are added, build and run it from the repository root
with the project compose configuration:

```bash
docker compose build user-service user-migrate
docker compose up user-service
```

The local compose setup also starts PostgreSQL as `user-db`. The service
requires the `DATABASE_URL` environment variable; it does not fall back to
SQLite. Compose runs the one-shot
`user-migrate` service to apply all pending Alembic migrations before starting
the application:

```bash
cp .env.example .env
docker compose up --build user-db user-service
```

The application image does not run migrations in its own startup command, so
multiple application replicas can start safely after the migration job
completes. In another deployment system, run `alembic upgrade head` as a
single migration job before starting or rolling out application replicas.

### First administrator bootstrap

The Compose stack includes a one-shot `user-bootstrap` job. Set all of these
variables in the untracked `.env` file before starting the stack:

```dotenv
BOOTSTRAP_ADMIN_NUS_STUDENT_NUMBER=A0123456X
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_DISPLAY_NAME=Platform Admin
BOOTSTRAP_ADMIN_PASSWORD='use-a-long-password-with-1-symbol!'
```

When all four variables are empty, the job exits successfully without making
changes. A partially configured set fails so an administrator is never
silently skipped. The job runs after `user-migrate` and before
`user-service`.

Bootstrap completion is recorded in the database on the singleton
administrator-state row in the same transaction as the administrator account.
The row is locked while the transaction runs, so retries, restarts, and
multiple bootstrap instances create at most one administrator. A failed
transaction leaves the marker unset and can be safely retried. Once the marker
is set, changing or removing the environment variables cannot create another
initial administrator.

To apply migrations directly during local development, run this from
`user-service/` with the target database configured in `DATABASE_URL`:

```bash
python -m alembic upgrade head
```

`DATABASE_URL` is required; migrations do not fall back to a local SQLite
database. This prevents accidentally believing that a production database was
migrated when only a local database was changed.

The PostgreSQL migration smoke test is opt-in and requires a disposable test
database. Set `TEST_DATABASE_URL` to that database and run:

```bash
TEST_DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/foc_users_test \
  python -m pytest -q tests/test_migrations_postgres.py
```

The administrator-state concurrency tests use the same disposable PostgreSQL
database and separate connections for each worker:

```bash
TEST_DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/foc_users_test \
  python -m pytest -q tests/test_concurrency_postgres.py
```

CI runs this smoke test against a temporary PostgreSQL service. Do not point
it at a development or production database.

Databases created by versions before Alembic was introduced are recognized as
the baseline automatically when their existing `users` and `user_sessions`
tables are present. Verify the schema and take a backup before migrating any
production database.

The service is available to other containers on the Compose network at
`https://user-service:8080`. Callers must trust the internal CA described in
the root `docs/internal-https.md`. The current Compose configuration does not
publish port 8080 to the host. To access the API from the host, temporarily add
this to the `user-service` definition in `compose.yaml`:

```yaml
ports:
  - "8080:8080"
```

Once the port is published, create a user with:

```bash
curl --cacert certs/ca.crt -X POST https://localhost:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"nus_student_number":"A0123456X","email":"student@example.com","display_name":"Student","password":"Password1!"}'
```

Log in with the registered NUS student number and password:

```bash
curl --cacert certs/ca.crt -X POST https://localhost:8080/login \
  -H 'Content-Type: application/json' \
  -d '{"nus_student_number":"A0123456X","password":"Password1!"}'
```

The response contains an opaque bearer token. Session tokens are stored only
as hashes and expire after 30 minutes of inactivity or 24 hours, whichever
comes first. Revoked and expired session records are pruned by a background
job that runs once at service startup and then hourly. Invalid credentials and
non-active accounts return the same generic authentication error.

Use the returned token for protected requests:

```bash
curl --cacert certs/ca.crt https://localhost:8080/users/me \
  -H 'Authorization: Bearer <access-token>'
```

The owner profile response includes the NUS student number, display name, and
permitted account fields. It never includes a password hash or authentication
token. An authenticated user can view another active user's basic profile with
`GET /users/{user_id}`; that response contains only `display_name`.



Update mutable profile fields with a partial request using `PATCH` (or the
`PUT` compatibility alias). Omitted fields are preserved, and an empty object
is accepted as a no-op. The NUS student number, role, status, and timestamps
are not accepted as update fields:

```bash
curl --cacert certs/ca.crt -X PATCH https://localhost:8080/users/me \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"display_name":"Updated Student","email":"new@example.com"}'
```

`DELETE /users/me` (or `POST /users/me/deactivate`) deactivates the account
without deleting its record. A deactivated account can be restored on the same
record by posting its existing credentials to `/users/reactivate` (the
`/users/me/reactivate` and `/reactivate` paths are compatibility aliases), then
logging in again. Password changes and deactivation revoke all active bearer
sessions, so clients must authenticate again after either operation.

The service refreshes the inactivity deadline on valid protected requests,
without extending the 24-hour absolute lifetime. End the session with:

```bash
curl --cacert certs/ca.crt -X POST https://localhost:8080/logout \
  -H 'Authorization: Bearer <access-token>'
```

Missing, malformed, expired, tampered, revoked, and non-active-account
credentials are rejected with `401 Unauthorized`.

The development database credentials are defined in `compose.yaml`; replace
them with secrets or an untracked environment file before using a deployed
environment. Create a new Alembic migration for every production schema
change and run it once, as a deployment job, before starting application
replicas.

Do not commit credentials, tokens, private keys, or production configuration.
Use environment variables or a local, untracked environment file for local
development.

## Requirements source

This README summarizes the User Service requirements in the FoC Project
Milestone 1 document, especially functional requirements F5–F9 and User
Service non-functional requirements NFR7. The README is a service-level guide;
the project document remains the authoritative source for the full
requirements set.
## Credit account initialization

User registration and administrator bootstrap do not provision Credit
accounts or publish `user.created`. Credit Service owns provisioning and lazily
initializes its UUID-only accounts from qualifying Order Service events. This
keeps User Service independent of Credit provisioning state.
