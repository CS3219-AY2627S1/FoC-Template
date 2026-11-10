# FoC Order Service

Order creation/read, acceptance, cancellation, expiry, pickup, delivery, completion
unilateral participant failure and overdue tracking are implemented.
Identity is checked through User; Supplier details are captured through its API.
Credit HTTP calls follow the contract in [API.md](API.md), implemented by the
separate [Credit Service](../credit-service/API.md). Root Compose connects to
real Credit for reservations and asynchronous settlement. Automated test
doubles live under `tests/` and are excluded from the Order package/image.
Cancellation/expiry/failure events are persisted and published asynchronously
for Credit to release the reserved reward.
Role-appropriate lifecycle UI controls are available on the errand detail page.
Either participant can mark ACCEPTED/PICKED_UP failed with a required reason and
confirmation. No second approval or admin is needed; no penalty is applied.

## Run the real integrated workflow

Follow the root [macOS/Windows setup guide](../README.md#local-setup-overview).
Start the four local database stacks, configure Order/Credit's own database
logins and matching service secret, then enable both `order` and `credit`
Compose profiles. The website on **port 3000** uses real Credit. The former
port-3001 mock demo has been retired; there is no application mock mode or
fallback when Credit is unavailable.

Requesters can cancel an OPEN errand after confirmation; others can accept it.
Actions stop being offered at the acceptance deadline, with server-side guards
remaining authoritative. Duplicate clicks are blocked; lost responses offer a
same-action retry; conflicts offer refresh; confirmed actions refresh private
history. Use another browser/incognito session to test as the courier.

## Stack and boundaries

Python 3.13, FastAPI/Pydantic, SQLAlchemy async/asyncpg and a separate Supabase
PostgreSQL 17 project, following User Service's runtime conventions. Supplier
uses a different PostgreSQL driver; its implementation is unchanged. Order never
reads another service's database or imports its business logic.

The application factory owns a connection pool and closes it on shutdown. Startup
does not connect, migrate or seed the database. Readiness runs a bounded read-only
check for schema access, SELECT access to four required tables and the lifecycle
migrations' failure and completion-event columns. It does
not prove external services are ready or replace migration validation. Liveness
remains independent of it.

## Local setup

Run from `order-service/`. Docker Desktop must already be running. Health checks
need only Order's database. Protected APIs require User; creation also requires
Supplier and a compatible Credit service. Acceptance/cancellation require fresh
User authentication but make no additional Credit/Supplier call. Only the outbox
publisher requires RabbitMQ; a broker outage does not block lifecycle commits.

1. Create an isolated Python environment using Python 3.13 and install dependencies.

   Windows Git Bash:

   ```bash
   py -3.13 -m venv .venv
   .venv/Scripts/python.exe -m pip install -e '.[dev]'
   ```

   If `py` cannot find your Python installation, use the path to your Python 3.13
   executable. On macOS/Linux use `python3.13` and `.venv/bin/python` instead.
   PowerShell can use `py -3.13` and `.\.venv\Scripts\python.exe`.

2. Install the team-pinned Supabase CLI and start **this service's** database:

   ```bash
   npm ci
   npx supabase start
   ```

   The project ID is `order-service`. Auth, Data API, storage, realtime, analytics,
   SMTP and edge functions are disabled because F0 does not use them. Studio is
   an operator UI, never a browser dependency of FoC. No hosted project is linked.

3. Copy `.env.example` to an ignored `.env` using VS Code, only if `.env` does not
   already exist. Set `DATABASE_URL` to the connection URL from this project's
   `npx supabase status`. Keep that output and its credentials local. Do not reuse
   a User or Supplier URL. Host applications use `127.0.0.1:16422`.

   The local CLI's administrative database credential is for development only.
   The migration creates an `order_service_app` NOLOGIN role with schema USAGE,
   with table-specific grants from the creation migration. A deployment operator
   must provision a dedicated login that inherits this role and keep its password
   local; no login/password is embedded in migrations. The local administrative
   URL is not a production-credential setup.

4. Start the API in that terminal:

   ```bash
   .venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8002
   ```

   Stop it with Ctrl+C. On PowerShell use `.\.venv\Scripts\python.exe`.

| Purpose | Address |
| --- | --- |
| Order API / Swagger | `http://localhost:8002/docs` |
| Process liveness | `http://localhost:8002/health/live` |
| Database readiness | `http://localhost:8002/health/ready` |
| Order Studio | `http://localhost:16423` (select `order_service`) |
| Order PostgreSQL | `127.0.0.1:16422` (not a webpage) |

The schema contains `orders`, `order_history` and `creation_operations` after
applying the creation migration. On an existing F0 database, review and run
`npx supabase migration up --local` before expecting readiness to pass; do not
reset existing data. Reserved local
ports are in `1642x`, separate from User's configured `1542x` and Supplier's `5532x`.
The existing User port migration is separate work, not a prerequisite for F0.

## Migrations and preserved data

`supabase/migrations/` is the sole schema history. The migrations create the owned
schema, role and tables; they grant no access to Supabase browser roles.
Never use SQLAlchemy `create_all`, an additional migration framework or startup DDL.

```bash
npx supabase migration new <description>
npx supabase migration up --local
```

Review the generated SQL before applying it. Reconstruct migrations with
`npx supabase db reset --local` **only in an explicitly disposable/new Order
database**, never in a teammate's project or a populated development database.
The reset deletes local application data. Ordinary stop/start retains it:

```bash
npx supabase stop
npx supabase start
```

Do not use `--no-backup` for normal stops. Never reset User/Supplier to test Order.

## Independent Docker run

From `order-service/`:

```bash
docker build -t foc-order-service:dev .
docker run --name foc-order-service-dev --env-file .env.docker --add-host host.docker.internal:host-gateway -p 127.0.0.1:8002:8002 -d foc-order-service:dev
```

Before running, create an ignored `.env.docker` in VS Code with the same settings
as `.env`, but change only the database hostname to `host.docker.internal`.
Keep port `16422` and the database's own credentials. Containers cannot reach the
host database through their own `127.0.0.1`. The image runs as a non-root user and
contains neither environment files nor Supabase CLI runtime state.

Use `docker logs foc-order-service-dev`, `docker stop foc-order-service-dev` and
`docker start foc-order-service-dev` to inspect/stop/restart it. Rebuilding the
image does not update an existing container: stop and remove that API container,
then repeat `docker run`; the separate database volume is unaffected. Do not run
the host API and container on port 8002 simultaneously.

The root Compose `order` profile starts Order API, creation recovery, expiry and
outbox workers alongside the existing stack. Apply the reviewed Order migrations
before rebuilding/restarting this profile. From the repo root:

```bash
docker compose --env-file user-service/.env --profile order up --build -d
```

Separate Supabase stacks still need to be running; this is not yet the complete
M7 fresh-copy one-command deployment. Shared broker configuration is supplied only
to the Order publisher; no service reads another service's database. Existing
`.env.docker` files need not be overwritten: new settings have safe defaults.

## Tests

Windows Git Bash (PowerShell accepts the equivalent backslash paths):

```bash
.venv/Scripts/python.exe -m pytest -q -m 'not integration'
.venv/Scripts/ruff.exe check app tests
```

To include the two read-only database checks, set `ORDER_TEST_DATABASE_URL` in
your terminal environment to an isolated, migrated Order database URL, then run:

```bash
.venv/Scripts/python.exe -m pytest -q
```

The two foundation integration tests are read-only. Creation/lifecycle integration tests
require a separate `ORDER_WRITE_TEST_DATABASE_URL` pointed at a **disposable,
migrated Order-only database**; they insert generated test data and intentionally
retain creation data for inspection; lifecycle tests remove only their generated
rows. Never point that variable at production or another
service's database. These tests skip unless explicitly configured. Ordinary
creation/lifecycle tests do not apply migrations or reset schemas. The dedicated
migration-upgrade test requires an admin connection: it creates a separate
`order_upgrade_<uuid>` database, preserves an existing OPEN fixture across the
upgrade, and removes only that scratch database. It never resets the supplied DB.
Container checks and Supabase CLI reset verification remain separate.
Real event-delivery tests additionally need `ORDER_TEST_RABBITMQ_URL` pointed at a
disposable RabbitMQ broker. They create/delete UUID-named test exchanges/queues,
never the shared `foc.events` exchange or a real Credit queue.

## Creation recovery worker

After updating the checkout, reinstall the package (`pip install -e '.[dev]'`).
In a separate terminal using Order's environment, run:

```bash
.venv/Scripts/python.exe -m app.orders.worker
```

The installed `order-recovery` command is equivalent. The API does not start a
background worker implicitly. Run the worker alongside it to recover abandoned
attempts after crashes/timeouts. It uses the same Order DB and dedicated Credit
credential, never a persisted user token. Configure fixed User/Supplier/Credit
origins using `.env.example`; do not overwrite an existing `.env` blindly.

The worker marks unresolved reservations ready for an authenticated requester retry;
it never creates orders using stale user authentication. At the acceptance deadline,
it closes the creation intent and retries Credit compensation. See [API.md](API.md)
for the required abort-fence contract. Without Credit, recovery remains pending.
Health endpoints probe Order storage, not this independent worker's progress.

## Expiry and outbox workers

After installing the updated package, run these in separate terminals:

```bash
.venv/Scripts/order-expiry.exe
.venv/Scripts/order-outbox.exe
```

On Linux use `order-expiry` and `order-outbox`. Compose uses these same entrypoints
with the same independently built Order image. The API starts neither implicitly.
The expiry worker checks every 5 seconds in batches of 50 and immediately drains
full batches; it catches up after downtime and retries database outages. The
under-60-second expiry requirement still needs measurement under the agreed load;
the polling interval alone is not proof. Reached deadlines block acceptance and
cancellation even during worker downtime.

The publisher polls every second. It uses the same durable topic exchange as User
(`foc.events`) and persistent, mandatory messages with publisher confirmations.
Unroutable events remain PENDING and retry with capped backoff rather than being
discarded. Until Credit provisions its durable bindings, this is expected.
Published does **not** mean the consumer has released the credits. See [API.md](API.md)
for payloads, duplicate handling, lease fencing and Credit-owner responsibilities.

Monitor `docker compose --env-file user-service/.env --profile order logs
order-expiry order-outbox` from the root and inspect Order's `outbox_events`
state/attempts/next_attempt_at/last_error_code. A healthy API does not prove either
worker is progressing. No credentials or payload free text belong in logs.

## Continuous integration

The shared GitHub Actions workflow validates Order on pull requests targeting
`main` and pushes to `main` when `order-service/**` or the workflow file changes.
It follows User Service's Python 3.13 setup and installs `.[dev]`, then runs:

```bash
ruff check app tests
python -m pytest -m "not integration" -q
```

The existing shared Docker build step builds the Order image without publishing
or deploying it. Order validation contributes to the shared `CI passed` result.
Existing checks for other components are preserved; workflow edits also trigger
Supplier validation under its existing change filter.

No database credentials or local environment files are needed. All tests marked
`integration` are explicitly deselected, not counted as passing.
CI does not start Supabase, apply/reset migrations, run the container or verify
cross-service integration. Continue running those checks locally as described
above; a green image build does not prove runtime database connectivity.

## Postman / HTTP smoke checks

Create a local Postman variable `orderBaseUrl = http://localhost:8002`.
No account or token is required for the operational endpoints.

| Request | Expected result |
| --- | --- |
| `GET {{orderBaseUrl}}/health/live` | `200`, `{"status":"live"}` even if the database is down |
| `GET {{orderBaseUrl}}/health/ready` | `200`, `{"status":"ready"}` when the migrated database is accessible |
| Ready with an unset URL, inaccessible DB or missing schema | `503`, safe `SERVICE_NOT_READY` error; no URL/password/SQL details |

Supply `X-Correlation-ID: order-f0-demo` and check the same response header. An
absent/malformed ID is replaced with a generated ID. Readiness errors include
`error.correlationId`, `error.message` and empty `error.fieldErrors`, following
User Service's operational envelope. Business APIs use `/v1` and camelCase.

### Lifecycle demo checklist

Use a real funded OPEN order with User, Supplier and Credit running. An
unconfirmed 503 create attempt is not such an order; do not bypass the reservation
check. Use Postman `orderBaseUrl = http://localhost:8002`, or port 3000 through
the website proxy. Check the real Wallet/ledger after terminal outcomes.
Automated integration fixtures deliberately seed fictional reserved orders only
inside disposable test databases, not the development Supabase projects.

1. Save different requester/courier tokens in local Postman variables.
2. Courier: `POST {{orderBaseUrl}}/v1/orders/{{orderId}}/accept` with no body.
   Expect 200/ACCEPTED, courierId and acceptedAt; retry and verify no second history.
3. Requester self-accept: expect 403; another courier after acceptance: 409.
4. On a different OPEN order, requester POST `/v1/orders/{{orderId}}/cancel`.
   Expect CANCELLED and one history/outbox record; retry remains unchanged.
5. Let another OPEN order reach its deadline. Both accept/cancel reject; the expiry
   worker records EXPIRED, a SYSTEM history entry and one event. Accepted orders
   never expire from this deadline.
6. Inspect event publication/retry and actual Credit release.
   A broker message alone does not meet D3's meaningful consumer-effect requirement.

API/state guards, race tests and detailed event contract: [API.md](API.md).

For an outage demo, stop only the Order database container, repeat both requests,
then restart it and verify readiness recovers without restarting the API. This
interrupts Order connections; do it only in your own test environment.

TLS URL support preserves the requested `sslmode` using asyncpg's documented
SSL modes. `require` encrypts without guaranteeing certificate verification;
use `verify-full` with a trusted certificate for verified remote connections.
See [asyncpg connection options](https://magicstack.github.io/asyncpg/current/api/index.html)
and [Supabase CLI configuration](https://supabase.com/docs/guides/local-development/cli/config).

## Verification coverage

Automated tests cover authenticated creation and retries, competing acceptors,
participant permissions, lifecycle transitions, deadlines, transaction rollback,
and outbox delivery/retries. Database and broker checks require the isolated
resources described in [Tests](#tests).

Dependency doubles exercise outage and retry paths without modifying real
wallets. Validate integrated settlement against Credit's wallet and ledger;
unit-test results alone do not establish inbox delivery, cloud availability or
performance under load.
