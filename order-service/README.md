<!-- AI Assistance Disclosure: ChatGPT (Codex), 2026-10-24.
Scope: Updated Order integration/client/pickup documentation after Order-only port. Human review pending.
See usage-log.md. -->

# Order Service

## Local PostgreSQL

Requires Docker Desktop running. Compose reads `order-service/.env`, which only
fills the values in `compose.yaml` (database credentials and the Credit token);
`order-service/grpc/.env` is separate and only used for host development. From
`order-service/`:

```sh
cp .env.example .env                     # once; do not overwrite an existing .env
docker compose up -d order-db --wait
docker compose ps
docker compose exec order-db psql -U order_service -d order_service
```

The stack uses PostgreSQL 16, matching User Service, with a persistent named
volume and a readiness check. Local development credentials are
`order_service` for both username and password (see `.env.example`). Standalone,
`compose.override.yaml` publishes the database on port 5434 (5433 is Credit's),
so the host connection URL is:

```text
postgresql://order_service:order_service@127.0.0.1:5434/order_service
```

Within the Compose network the database address is `order-db:5432`.

Stop the stack while retaining data, or reset it:

```sh
docker compose down       # keep the data
docker compose down -v    # also delete the data
```

## Prisma schema and migrations

The author-provided schema is in `prisma/schema.prisma`: OrderCreation, Order,
CreditOperation and OrderEditOperation, with the supplied enums, indexes and relationships.
The initial migration is committed as source under `prisma/migrations/` and has
been applied to the local database. Prisma 6.19.3 matches User Service.

From the repository root, export the local database URL and run:

```sh
export DATABASE_URL=postgresql://order_service:order_service@127.0.0.1:5434/order_service
npm run prisma:validate --workspace @foc/order-grpc
npm run prisma:deploy --workspace @foc/order-grpc
npm run prisma:generate --workspace @foc/order-grpc
npm run prisma:status --workspace @foc/order-grpc
```

For team-approved schema changes, create a migration locally with:

```sh
npm run prisma:migrate --workspace @foc/order-grpc -- --name descriptive_name
```

Use migration files rather than `db push`. In Docker, the one-off `order-migrate`
job applies committed migrations (`prisma migrate deploy`) on every `docker compose
up`, and `order-service` starts only after it succeeds. For host development,
apply them explicitly using the commands above. Generated client files live in `grpc/src/generated/prisma`
and are ignored by Git.

PostgreSQL row locks implement the author's confirmed first-lock-wins rule for
Order mutations. CreditOperation and OrderEditOperation persist recovery work.
Acceptance and delivery are implemented below; pickup remains outside this change.

## Application structure

The existing `@foc/order-grpc` workspace remains in `order-service/grpc`. It now
runs Express REST and gRPC together, following User Service conventions:

- `grpc/src/api/app.ts`: Express application and database-backed health endpoint.
- `grpc/src/grpc/`: existing RPC server/clients; GetOrder remains UNIMPLEMENTED.
- `grpc/src/env.ts`: dotenv loading and Zod configuration validation.
- `grpc/src/db.ts`: service-specific Prisma client and database probe.
- `grpc/src/index.ts`: database connection, HTTP/gRPC startup and shutdown.
- `prisma/`: author-supplied schema and migrations.

Creation, editing and cancellation routes/controllers use shared services under
`grpc/src/services`. Production RPC adapters live in `grpc/src/dependencies`.
Request JWTs are verified using the User Service public key in `grpc/src/auth`.

## Host development

Requires Node.js 20+ and Docker Desktop. From the repository root:

```sh
npm ci
cp order-service/grpc/.env.example order-service/grpc/.env
# Edit the copied file if using different database or server ports.
cp order-service/.env.example order-service/.env
docker compose -f order-service/compose.yaml up -d order-db --wait
```

Do not overwrite an existing `.env`; update it instead. npm workspace commands
run with `order-service/grpc` as the working directory, so dotenv loads that
workspace's `.env`. Existing shell variables take precedence.

```sh
export DATABASE_URL=postgresql://order_service:order_service@127.0.0.1:5434/order_service
npm run prisma:deploy --workspace @foc/order-grpc
npm run dev --workspace @foc/order-grpc
```

The dev script builds the shared gRPC library and generates the Order Prisma
client first. For compiled startup, build the shared library and Order service:

```sh
npm run build --workspace @foc/grpc --workspace @foc/order-grpc
npm start --workspace @foc/order-grpc
```

`DATABASE_URL` is required and must be a PostgreSQL URL. `PORT` defaults to 3003;
`GRPC_PORT` to 50053; `GRPC_HOST` to 0.0.0.0. Ports must be 1–65535. Other RPC
settings and local peer addresses are listed in `grpc/.env.example`. No peer
service needs to be running for startup or health checks. The application fails
startup on invalid settings or an unavailable database.

## Docker application startup

From `order-service/` (after `cp .env.example .env`):

```sh
docker compose up --build -d --wait
curl -i http://localhost:3003/health
docker compose ps
docker compose logs order-service
```

| Service | What it is | Where (standalone dev) |
| --- | --- | --- |
| `order-db` | PostgreSQL 16, data in the order_service_pgdata volume | `127.0.0.1:5434` |
| `order-migrate` | One-off job: `prisma migrate deploy`, then exits | — |
| `order-service` | REST + gRPC, running as the node user | `http://localhost:3003`, `localhost:50053` |

Expected: `order-migrate` exits 0, then `order-service` becomes healthy and
`/health` returns HTTP 200 with `{"status":"ok","db":"up"}`. If the database
becomes unavailable, `/health` returns HTTP 503 with
`{"status":"degraded","db":"down"}`. Docker builds its own Linux Prisma client.
The runtime image holds production dependencies and compiled output only; it
excludes local `.env`, keys, node_modules and host-generated clients.

Ports are published by `compose.override.yaml`, which Compose loads only when run
from this folder; the root compose does not load it, so nothing is exposed there.
Stop a host-run Order process before starting the container, since both use
ports 3003 and 50053.

Compose supplies the container database URL explicitly using `order-db:5432`.
The host-development `grpc/.env` is not loaded into the image. Stop with
`docker compose down`; the database volume is retained. Rebuild after application
source changes (`docker compose up -d --build order-service`).

## Setup issue verification (2026-10-21)

- [x] Existing team Express/TypeScript framework and dependencies installed.
- [x] Existing workspace retained with api/grpc layout and env/db building blocks.
- [x] dotenv settings loaded and Zod rejects invalid ports/database URL.
- [x] Prisma connects to the Order-owned PostgreSQL database.
- [x] Docker application builds, applies migrations and starts REST plus gRPC.
- [x] GET /health returns 200 when the database is available and 503 when unavailable.
- [x] Setup/startup instructions documented above.

Verified compiled host startup on alternate ports and clean SIGTERM shutdown.
Both Docker containers were restored to healthy after the database-outage check.
These checks cover the initial setup issue. See lifecycle verification below for
subsequent implementation. Team author review remains required.

AI usage records are consolidated in [usage-log.md](usage-log.md). The initial
applied migration retains its historical attribution path to preserve its checksum;
that attribution refers to the same records now maintained in this service.

## Order lifecycle (2026-10-22)

**Peer-service status:** Supplier GetSupplier/IsOpen and User outbox are inherited
from main. The Credit runtime in this checkout remains a scaffold. Successful production creation requires the real User
GetPublicProfile, implemented Supplier GetSupplier/IsOpen, and Credit from the
agreed `feat/credit-implementation` contract. Order now imports that contract
from `@foc/grpc`; the duplicate local protobuf was removed. Shared contracts
and teammate sources are unchanged by this Order-only port. No test doubles
are enabled in normal startup.

Configure `grpc/.env` for host development:

```dotenv
USER_SERVICE_PUBLIC_KEY_PATH=../../user-service/keys/public.pem
USER_GRPC_ADDR=localhost:50051
SUPPLIER_GRPC_ADDR=localhost:50052
CREDIT_GRPC_ADDR=localhost:50054
CREDIT_ORDER_SERVICE_TOKEN=your-order-credential
```

Use the same credential configured by Credit. Order-to-Credit gRPC is plaintext
for both localhost and container/service DNS addresses; there is no CA setting.
Only User's public key is needed by Order. A configured unreadable public-key
path fails startup. Without a public key, Order writes return 503; without a Credit
credential, Credit-dependent writes return 503 and no recovery worker runs.
Health continues to probe PostgreSQL independently.

For Docker, set `CREDIT_ORDER_SERVICE_TOKEN` in `order-service/.env` (it must
match Credit's), then start the stack as above:

```sh
docker compose up --build -d --wait
```

Generate User's keys through its existing instructions if absent; do not replace
an existing key pair. Compose mounts only the public key read-only (override its
location with `USER_PUBLIC_KEY_PATH`). Standalone, `compose.override.yaml` points
peer RPCs at host-run services through Docker Desktop's host.docker.internal; in
the full stack, peers are reached by service name (`user-service:50051`,
`supplier-service:50052`, `credit-service:50054`). Credit uses plaintext gRPC
with the unchanged x-credit-service-token credential. Without running peers,
Order still starts and `/health` still works.

### HTTP contract

All writes require a valid User RS256 bearer JWT with USER role. The requester ID
comes from the signed subject. ADMINISTRATOR alone does not grant permission.

| Method / route | Behavior | Success |
| --- | --- | --- |
| GET /orders | ADMINISTRATOR only; all orders, including history | 200 |
| GET /orders?scope=open | USER; unassigned, future-expiry orders created by others | 200 |
| GET /orders?scope=requested | USER; orders created by the JWT subject, including history | 200 |
| GET /orders?scope=assigned | USER; orders assigned to the JWT subject, including history | 200 |
| POST /orders | Create after confirmed credit reservation | 201, 200 replay, 202 pending |
| PATCH /orders/:id | Requester edits an unassigned, unexpired order | 200, 202 pending |
| POST /orders/:id/cancel | Requester cancels an unassigned, unexpired order; retains history | 200, 202 pending refund |
| POST /orders/:id/accept | Another USER accepts an eligible unassigned order | 200 |
| POST /orders/:id/deliver | Assigned USER courier delivers a PICKED_UP order | 200, 202 pending settlement |

Creation and editing require a nonblank Idempotency-Key header. Creation requires
supplierId (positive bigint decimal string), destination, requestDetails, credits
(positive int32), and expiryTime (ISO timestamp with explicit offset). Editing
accepts any nonempty subset of these five fields. Unknown fields are rejected;
requester identity, names and pickup snapshots cannot be supplied by the client.
Required text must be nonblank; expiry must be at least one hour after database
time at initial creation/edit validation. Supplier must currently be open.

Newly published orders are UNASSIGNED/RESERVED. Returns use `{order: {...}}` with
supplierId serialized as a decimal string and timestamps as ISO UTC. Internal
creation/edit/recovery payloads are not exposed. Pending creation returns
`{creationId, state: "PENDING"}`; pending edit/cancellation returns the current
`{order}` with HTTP 202. Preserve the original body and Idempotency-Key on retries.

Same key + same creation body resumes/returns the original order. Same key + a
changed body returns 409. Different keys are distinct creation requests even if
all fields match; there is **no five-minute duplicate-content rule**. For edits,
reuse the same key for the same patch on the same order; changed patches with
that key return 409. The frontend should disable repeated submission while a
request is processing and reuse its original key after uncertainty.

Validation returns 400, missing/invalid JWT 401, insufficient role/ownership 403,
missing order 404, and conflicts/invalid transitions/dependency rejections 409.
An unavailable dependency returns 503 before recording creation when directory
validation cannot complete. Once creation is durable, an uncertain Credit result
returns 202. Error JSON uses `{error: "..."}`, with creationId where applicable.

### Recovery and expiry

The backend worker starts when Credit is configured; it does not depend on an
open frontend. It recovers pending creation/edit work, expires orders and retries
refunds. Work is persisted before mutating Credit; processing leases survive
restarts. It uses the same stable order ID for reservation/release and the same
expectedVersion for an edit update. Current GetReservation state is checked
rather than trusting historical mutation-replay snapshots.

Explicit business rejection stops that operation. Uncertain work has an initial
attempt plus five retries, delayed by 5, 15, 45, 135 and 135 seconds. A processing
lease lasts 30 seconds; batches contain at most 100 records and the loop polls
after one second. Expiry compensation has its own refund retry budget.

Exhausted reserve/refund work is retained as PERMANENTLY_FAILED with a sanitized
lastError; creation/financial state remains pending until resolved. Exhausted
edits become RECONCILIATION_REQUIRED. These records require operator reconciliation;
no automatic success/refund or administrative reset endpoint is claimed.

Expiry cancels UNASSIGNED, ASSIGNED and PICKED_UP orders with reason EXPIRY and
returns the reservation to the requester. Requester cancellation uses reason
REQUESTER. Cancellation and its REFUND_PENDING intent commit together. REFUNDED
is recorded only after Credit confirms the current reservation is RELEASED.
An expired unpublished creation is compensated rather than published.

Mutations lock Order rows. Active durable edits exclude other edits/cancellation;
expiry may still cancel and release the reservation. No courier-priority guarantee
is implemented: the author's latest decision is first-lock-wins. Courier
acceptance acquires that same row lock and rejects active edit operations until
their reconciliation completes. There is no separate DELETE route
and no physical deletion of order history. Listing/history UI is outside this change.

### Lifecycle tests

From the repository root:

```sh
npm ci
npm run build --workspace @foc/grpc --workspace @foc/order-grpc
npm test --workspace @foc/order-grpc
```

For integration tests, use a separate disposable database, never the normal
Order database:

```sh
docker run --detach --name foc-order-lifecycle-tests \
  --publish 127.0.0.1:55437:5432 \
  --env POSTGRES_USER=order_service --env POSTGRES_PASSWORD=order_service \
  --env POSTGRES_DB=order_service_test postgres:16

docker exec foc-order-lifecycle-tests pg_isready -U order_service -d order_service_test
# Once accepting connections:
DATABASE_URL=postgresql://order_service:order_service@127.0.0.1:55437/order_service_test \
  npm run prisma:deploy --workspace @foc/order-grpc
TEST_DATABASE_URL=postgresql://order_service:order_service@127.0.0.1:55437/order_service_test \
  npm run test:integration --workspace @foc/order-grpc
```

If that test container already exists, use docker start instead of docker run.
Tests refuse a missing URL or database name outside order_service_test[_suffix].
They create and remove only their own fixture rows. Test-only peer servers/ledger
exercise PostgreSQL persistence, HTTP authentication/validation, real gRPC adapter
calls, same-key concurrency, business failures, timeouts, crash/worker recovery,
credit edits, cancellation and picked-up expiry. They do not certify deployed
peer-service implementations. Remove only the disposable test container afterward:

```sh
docker rm -f -v foc-order-lifecycle-tests
```

Verified on 2026-10-22: 8 unit/authentication/gRPC tests and 23 PostgreSQL/HTTP/gRPC
integration tests passed (31 total). Docker build/startup, both migrations and
HTTP health passed. These results use test-only peers for successful lifecycle
workflows; production peer integration remains subject to the status above.

### User order listings

Use a User Service bearer JWT with USER role. Identity is taken exclusively from
its subject; callers cannot supply another requester/courier ID.

- `GET /orders?scope=open`: UNASSIGNED orders created by other users whose expiry
  is later than database time, even if the expiry worker has not run yet.
- `GET /orders?scope=requested`: all orders created by the caller, including history.
- `GET /orders?scope=assigned`: all orders assigned to the caller as courier,
  including completed/cancelled history.

All return HTTP 200 and `{ "orders": [...] }`, using the public fields described
below (including id, status, destination and credits), newest first, without
pagination. Empty matches return `{ "orders": [] }`. Missing/invalid credentials
return 401; ADMINISTRATOR without USER returns 403 for these scoped views.
Unknown/empty/repeated scopes or unsupported query parameters return 400.
An administrator with USER can also use these views for their own subject.
Listings are snapshots; acceptance still rechecks eligibility under a row lock.

### Administrator dashboard: GET /orders

Requires a valid User Service bearer JWT with ADMINISTRATOR role. USER alone
returns 403; missing/invalid credentials return 401. An administrator does not
also need USER for this read. Existing write endpoints still require USER.
The configured User public key is required, as for other authenticated endpoints.

```sh
curl http://localhost:3003/orders \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Returns HTTP 200 with `{ "orders": [...] }`. Each entry contains the existing
public Order fields: IDs, participant names, pickup information, destination,
request details, credits, status, cancellation reason, credit state, expiry and
lifecycle/audit timestamps. Supplier IDs are decimal strings; timestamps are ISO
UTC strings and absent optional values are null. Internal creation payloads,
idempotency keys and recovery/edit operations are excluded.

All persisted Order rows are returned, newest first (createdAt descending, then
id descending), including DELIVERED, CANCELLED/EXPIRY, requester cancellations,
and overdue active rows. Pending unpublished creations have no Order row and
are excluded. An empty database returns `{ "orders": [] }`. There are currently
no filters or pagination for the unscoped administrator view. The dashboard can filter the returned
information, using DELIVERED for completed orders and cancellationReason EXPIRY
for orders cancelled by expiry. No User/Supplier/Credit RPC is needed for this
read; the response uses stored snapshots.

### Cancellation and expiry issue verification

Verified 2026-10-22 on order-functionality: 9 unit/authentication/gRPC tests and
32 PostgreSQL/HTTP/gRPC integration tests passed (41 total). This includes the
previous creation/edit/admin tests and the following cancellation/expiry checks:

- Requester can POST /orders/:id/cancel only for an unassigned, unexpired order.
- Missing credentials, wrong owner, admin-only role, malformed UUID/body and
  unknown orders are rejected. Assigned, picked-up and delivered orders cannot
  be manually cancelled; overdue cancellation requests return 409 and the worker
  applies expiry instead.
- Concurrent cancellation/replay retains one history row and one refund intent.
- Expiry cancels UNASSIGNED, ASSIGNED and PICKED_UP, preserving delivered and
  future orders; the configured worker handles it without a frontend request.
- Release transport errors, uncertain commits, wrong-owner receipts and stale
  release replies never falsely mark REFUNDED. Restart/expired-lease recovery
  checks current reservation state before completing the refund.
- Initial attempt plus five retries is enforced; explicit rejection and exhausted
  work remain recorded as unresolved REFUND_PENDING for reconciliation.
- If cancellation is committed but the immediate refund or receipt write fails,
  the endpoint returns 202 with the durable cancelled/pending order. A failure
  before cancellation commits is still an error.

Live peer-service integration still requires the implemented Credit service and
configured token; tests use separate test-only peer services. These checks did
not add pickup or order-detail endpoints. Acceptance and scoped user
listings were implemented subsequently, as documented here.

For the real User/Supplier/Credit walkthrough, see [Manual integration testing](MANUAL_TESTING.md), including current peer-service blockers and expected responses.

### Errand acceptance

`POST /orders/:id/accept` requires a USER bearer JWT and accepts no request fields
(an empty body or `{}` is allowed). The authenticated subject becomes courierId;
clients cannot supply a courier ID. ADMINISTRATOR alone is insufficient.

```sh
curl -i -X POST "http://localhost:3003/orders/$ORDER_ID/accept" \
  -H "Authorization: Bearer $COURIER_TOKEN"
```

Successful acceptance returns HTTP 200 `{order: {...}}`, with ASSIGNED,
courierId and a database-generated acceptedAt. The optional courierName remains
null; this change does not fetch a courier-name snapshot. The existing credit
reservation stays RESERVED; acceptance makes no additional Credit mutation and
can run without configured Credit peers for an already published reserved order.

Requester self-acceptance and missing USER role return 403; missing/invalid JWT
returns 401; invalid UUID/body returns 400; an unknown order returns 404. Already
assigned/terminal orders, expired orders, non-reserved financial state or a
pending/reconciliation-required edit return 409. Repeating even the winning
courier's acceptance returns 409 rather than assigning again.

The transaction locks the Order row, checks current state and active edits,
samples database time after acquiring the lock and persists courier/status/time
atomically. Concurrent couriers use the agreed first-lock-wins rule; no courier
priority over cancellation is claimed.

Verified 2026-10-22: all 13 unit/authentication/gRPC tests and 38 dedicated
PostgreSQL/HTTP/gRPC integration tests passed (51 total). Acceptance coverage
includes 12 concurrent couriers with exactly one winner, requester/role denial,
already assigned/expired orders, expiry while waiting for the row lock,
cancellation races, pending credit edits and HTTP JWT-derived identity.

Retrieval verification: real PostgreSQL/HTTP tests cover scoped ownership,
self-exclusion, overdue rows, history, empty lists, invalid query parameters and
role separation. The full suite passes 13 unit tests and 39 integration tests.


### Delivery and Credit settlement

`POST /orders/:id/deliver` requires a USER JWT belonging to the assigned courier.
The body must be empty or `{}`. The order must be PICKED_UP, unexpired and have
RESERVED credits. Ownership failure returns 403, invalid state/expiry 409,
unknown order 404, invalid UUID/body 400 and missing/invalid JWT 401. Missing
Credit configuration returns 503. The requester cannot deliver their own order.

A row-locked transaction records DELIVERED, deliveredAt, SETTLEMENT_PENDING and a
unique durable SETTLE intent together. Delivery replay by the same courier is
supported. The client calls `SettleCredits(orderId, courierId)` only when current
`GetReservation` reports a matching RESERVED hold. It then reads the current
reservation again: only matching order/requester/amount, SETTLED status and the
correct courier can confirm SETTLED. Mutation replies alone do not confirm it.

The endpoint returns `{ "order": { ... } }`: 200 when settlement is confirmed,
202 when delivery is durably recorded but credit transfer remains pending.
DELIVERED records with pending settlement are excluded from expiry/refund work.
Database receipt-write failures after delivery also return 202, allowing lease
recovery to confirm a transfer already committed by Credit.

The background worker now runs settlement recovery as well as creation/edit,
expiry and refunds. It reconciles before retrying, uses a 30-second lease, and
shares the existing initial attempt plus five retries/backoff (5, 15, 45, 135,
135 seconds). Explicit business rejection or exhausted retries stops automatic
attempts and retains SETTLEMENT_PENDING with a failed operation for manual
reconciliation; neither case reports credits as settled. No schema changes.

Transport remains plaintext gRPC with `x-credit-service-token` on every call.
Order uses `createCreditClient` and the protobuf from shared `@foc/grpc`; its private Credit client/protobuf were removed.
Verification: 13 unit/auth/gRPC tests and 48 real Order PostgreSQL integration
tests pass (61 total). Added real gRPC transport tests with a simulated Credit
ledger, including successful/rejected/uncertain reservations, release recovery,
settlement, concurrent delivery, stale/wrong receipts, bounded retries, automatic
recovery and receipt-write failure. These tests do not certify the deployed
Credit implementation or a complete live multi-service journey. Pickup is now
implemented as described in the integration update below; delivery requires a PICKED_UP order.


### Order editing with Credit integration

`PATCH /orders/:id` requires a requester USER JWT and an `Idempotency-Key` header.
Supply a nonempty partial body containing supplierId (decimal string), destination,
requestDetails, credits (positive int32), and/or offset-bearing ISO expiryTime.
The resulting order must meet the existing validation rules, including expiry at
least one hour after database time and a currently open supplier. Only the
original requester can edit an unexpired UNASSIGNED order.

The durable OrderEditOperation saves the request, complete target fields and
Credit expectedVersion before adjustment. A credit change calls atomic
`UpdateReservation(orderId, targetCredits, expectedVersion)`. Credit checks funds
for the extra amount on an increase and releases excess hold on a decrease;
Order does not release/re-reserve or rely on a potentially stale balance check.
Credit remains responsible for enforcing that adjustment atomically. When the
amount is unchanged, Order performs no UpdateReservation mutation (it still
reads the current reservation to validate/reconcile it).

Matching current reservation amount/version must be confirmed before persisting
new order fields. Success returns 200 `{ "order": {...} }`; uncertain durable
work returns 202 with the current order, whose credits are not prematurely
changed. Same key/body resumes the operation; changed body with that key returns
409. A business rejection returns 409 without applying proposed order fields.
Unavailable preflight dependencies return 503 before creating an edit intent.

Active durable edits block acceptance and other edits. If acceptance acquires
the row lock and assigns first, editing returns 409 without changing Credit.
Recovery uses the saved expectedVersion, processing lease and existing bounded
retry/backoff policy. Exhausted uncertain work remains RECONCILIATION_REQUIRED
and blocks conflicting commands until reconciled.

Editing issue verified 2026-10-22: all 13 unit tests and 55 integration tests pass
(68 total). Added real gRPC client transport coverage for full available-funds
increases, insufficient funds, decreases, unchanged amounts, concurrent same-key
requests, actual acceptance races, pre/post-commit failures and receipt-write
crash recovery. These tests use real Order PostgreSQL and test-only Credit
ledger handlers; verification of the deployed Credit implementation is separate.
The existing production edit implementation required no changes for this issue.

## Order-only integration update (2026-10-24)

See [INTEGRATION_NOTES.md](INTEGRATION_NOTES.md) for teammate dependency
requirements and validation scope. The agreed shared Credit/Supplier contracts
are now included; normal builds and tests no longer need temporary overrides.
The full Credit business runtime remains in the teammate PR.

Order now uses shared createCreditClient with service-token metadata on each
RPC; creditValidation.ts retains response validation and error classification.
Explicit ACCOUNT_NOT_FOUND is retried within the existing bounded budget.
Supplier results use shared validation; missing locationDescription becomes "-".
Destination remains a string; Order schema/migrations are unchanged.

`POST /orders/:id/pickup` requires USER role and the assigned courier, an
unexpired ASSIGNED order, and an empty JSON object. A row-locked transaction
sets PICKED_UP and pickedUpAt, returning 200 with `{ "order": {...} }`. Wrong
actor/role returns 403, missing/invalid JWT 401, malformed input 400, missing
order 404, invalid transition/expiry 409. Repeated pickup returns 409. No credits
move at pickup. Supplier opening is checked during creation; pickup/delivery use
the saved snapshot without another Supplier RPC, as approved by the human.

## AI Use Summary

ChatGPT (Codex), implementation/test/documentation generation, 2026-10-21–22.
Implemented the author-provided schema and approved Order contracts, including
plaintext Credit RPC integration, durable creation/edit/refund/settlement
recovery and author-approved delivery. Prompts, key exchanges, affected files
and verification are recorded in [usage-log.md](usage-log.md). Human review and
validation remain pending. See the root README final AI Use Summary for the
consolidated project disclosure and submission slide-deck link requirement.
