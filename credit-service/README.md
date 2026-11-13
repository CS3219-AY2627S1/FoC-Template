<!--
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-20–2026-11-06 (Asia/Singapore).
Mode/scope: Documented and checked the human-defined Credit implementation, including the integrated lifecycle consumer, logging correction and existing verification suites.
Review: I edited for style and conciseness.
Exact prompts, key responses and checks: ai/usage-log.md, entries 003–050.
-->

# Credit service

Credit Service manages credit accounts, reservations and history using PostgreSQL
17 and `pg` with explicit SQL migrations. User registration events grant 10 credits
once per user ID. Order Service uses authenticated plaintext gRPC; the frontend
uses JWT-authenticated REST for each user's own balance and history.

| Interface | Address / path | Access |
| --- | --- | --- |
| gRPC | Port 50054, six RPCs listed below | Order Service token |
| REST balance | GET `/credits/me/balance` on port 3004 | User JWT |
| REST history | GET `/credits/me/history` on port 3004 | User JWT |
| Health | GET `/health` on port 3004 | Public |
| User events | RabbitMQ queue `credit.user-events` | `user.created`, `user.deleted`, `user.restored` |

## Source layout

```text
credit-service/
  src/
    domains/       existing account, reservation, history and idempotency types
    repos/         repository contract, PostgreSQL implementation and lock encoder
    services/      credit rules, validation and history bookmarks
    grpc/          plaintext gRPC handlers, service-token authentication and error mapping
    rest/          REST handlers and user-token authentication
    events/        user event handler (created, deleted, restored) and consumer
    env.ts
    index.ts
  test/
  migrations/
  package.json
  tsconfig.json
  .env.example
```

The workspace is `credit-service/`, named `@foc/credit-grpc`. TypeScript builds
into `dist/`; `src/index.ts` starts REST, gRPC and the event consumer.
`migrations/run-migrations.cjs` is the tracked runner used by `npm run db:migrate`
and the `credit-migrate` job. It supports an optional inclusive `--to` stop point.
Local `scripts/` and `docs/` are not required by a fresh clone.

## Business operations

- `initCredits({ userId })` is an internal method used by the `user.created`
  callback. New accounts receive 10 total/0 reserved credits exactly once per
  userId, with an `INITIAL_GRANT` history row and saved result in one transaction.
  Matching saved successes replay; confirmed prior grants without saved results
  succeed without writes. A DELETED placeholder without `INITIAL_GRANT` or
  `BALANCE_RESTORED` receives its 10-credit grant and remains DELETED. The grant
  adds 10 to the existing total, including any `TRANSFER_IN` credits received
  through settlement. It preserves reserved credits and does not require 0/0.
  Other existing accounts lacking grant evidence fail with `ALREADY_EXISTS`
  and no changes.
- `getBalance` returns userId, total, reserved, and computed available credits. A missing
  account fails; reads never initialize an account.
- `reserveCredits` creates a lifetime-unique reservation per order, holds credits,
  records `RESERVED`, and starts version at 1. Insufficient credits fail without
  changes. Without a saved result, an existing matching requester/amount returns
  the current reservation in any status without writes. A mismatch fails with
  `REQUEST_CONFLICT`.
- `updateReservation` takes the new total held and expected version. It checks
  saved result, existence, active status, matching version, changed amount, then
  available credits for an increase. It applies only the difference, increments
  version, and records signed `RESERVATION_UPDATED` deltas. Unchanged amounts are rejected.
- `releaseCredits` decreases reserved credits only, marks `RELEASED`, increments
  version, and records `RELEASED`. Settled reservations fail. An already released
  reservation without a saved result returns its current state without writes.
- `settleCredits` atomically decreases the requester's total and reserved credits,
  increases the courier's total, sets `SETTLED`/courier/version, and writes
  `TRANSFER_OUT` and `TRANSFER_IN`. Missing courier accounts and self-settlement
  fail without changes. Courier assignment is validated by Order Service. Without
  a saved retry result, an already SETTLED reservation returns its current state
  without writes when the courier matches; a different courier fails with
  FAILED_PRECONDITION/REQUEST_CONFLICT. RELEASED reservations fail with INVALID_STATE.
- `getReservation` reads the full current reservation, including its IDs, amount,
  status, courier and version. Missing reservations fail with `NOT_FOUND`.
- `markDeleted({ userId })` changes ACTIVE to DELETED without changing balances,
  reservations or history. Missing accounts become DELETED 0/0 placeholders;
  DELETED and CLOSED accounts remain unchanged.
- `restoreCredits({ previousUserId, userId })` locks both account resources and
  rows in sorted order in one READ COMMITTED transaction. It creates an ACTIVE
  destination with the source balance, closes and zeroes the source in one SQL
  update, and writes one `BALANCE_RESTORED` history row on the destination, even
  for zero credits. It grants no starter credits and writes no source history
  or restore idempotency record. Destination records contain no source ID.

Balance/history reads, new reserves and reservation updates require ACTIVE
accounts; otherwise they return `ACCOUNT_NOT_FOUND`. Release and settlement
allow ACTIVE or DELETED accounts, including the courier in settlement.
GetReservation accepts every account status. Saved reserve/update successes
replay before status checks, including after deletion.

Restoration acknowledges an existing destination when the source is CLOSED.
An existing destination with a missing or non-CLOSED source, a CLOSED source
with no destination, equal IDs, or an ACTIVE source lacking allocation history
raises `RestoreError`. Missing sources, DELETED placeholders awaiting their
grant, and sources with reserved credits remain retryable and move no credits.
The source must have `INITIAL_GRANT` or `BALANCE_RESTORED` history before transfer.
Migration [011](migrations/011_account_lifecycle.sql) adds the status and CLOSED
0/0 checks, restored history constraints, and one opening allocation per user
across `INITIAL_GRANT` and `BALANCE_RESTORED`.

Mutations own one READ COMMITTED transaction. Lock order is retry key, order
resource (account resource for initialization), then account rows in ascending
user-ID order. Accounts remain locked through history insertion and commit.
The repository never commits or rolls back. Any failure rolls back account,
reservation, history, and retry-result changes together.
Deletion takes the account resource lock before its row lock; restoration takes
both account resource locks in sorted order before locking both rows.

Saved successful retries replay before current-state checks. Mutation replies
are snapshots of the state immediately after that operation. An identical reserve
retry after an update can therefore return the original amount/version/status;
call GetReservation to obtain the full current reservation. Existing
missing-result fallback rules above remain unchanged. The operation-scoped
key is userId for initialization, orderId for reserve/release/settle, and
JSON `[orderId, expectedVersion]` for updates. SHA-256 request hashes use the
human's validated-field arrays; caller identity and metadata are excluded.
See [the exact definitions](ai/prompts/014-business-rules-and-implementation-design.md).
The [advisory-lock encoder](src/repos/advisoryLockKey.ts) hashes UTF-8
JSON `[namespace, key]` and converts its first eight bytes to a signed big-endian
64-bit decimal string, following [exchange 019](ai/prompts/019-advisory-lock-key-encoding.md).
PostgreSQL [transaction-level advisory locks](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS)
release at transaction end.

## User event consumer

Credit accepts this `user.created` payload from User Service's event transport:

```json
{
  "type": "user.created",
  "eventId": "registration-event-id",
  "occurredAt": "2026-10-22T00:00:00.000Z",
  "userId": "registered-user-id"
}
```

The [user event handler and registration helper](src/events/userEvents.ts)
validate deliveries with the shared `userEventSchema` and verify matching
delivery and payload event IDs. Every event requires `type`, `eventId`,
`occurredAt` and `userId`:

| Event | Additional required fields | Credit operation |
| --- | --- | --- |
| `user.created` | None | `initCredits({ userId })`; grant 10 once |
| `user.deleted` | `deletedAt` | `markDeleted({ userId })`; keep balance, reservations and history |
| `user.restored` | `previousUserId` | `restoreCredits({ previousUserId, userId })`; move the balance with no starter grant |

Deletion does not require `purgeAfter`. Restoration validates both IDs. User
Service sends `user.restored` instead of `user.created` when a user returns
within four years; after that window no restoration event is sent. Credit does
not calculate the retention window or purge old records.

Malformed events, invalid IDs, inconsistent initial allocations and permanent
restoration conflicts become `NonRetryableError`. Other failures remain
retryable through the shared client's retry/dead-letter handling. The handler
awaits each service operation, so RabbitMQ acknowledges only after the
transaction commits or a repeat is confirmed. Duplicate event IDs or different
events for the same user cannot grant or restore credits twice. Restoration
uses the destination account and CLOSED source as its repeat check and writes
no restore idempotency record.

Deletion and restoration handler logs contain only `eventId`; creation retains
its existing user/balance success log. The restored account's history contains
only its own `BALANCE_RESTORED` row, with no source ID. If the source still has
reserved credits, restoration moves nothing and retries; exhausted retries
dead-letter the message. A dead-lettered restoration message retains both IDs
until it is removed.

The [consumer helper](src/events/broker.ts) creates one RabbitMQClient for
CREDIT_USER_QUEUE using serviceName credit-service and prefetch 10. Configure
RABBITMQ_URL: required; the Docker example reaches a broker
published on the Docker host. Supply a URL reachable from your chosen deployment.
After both API listeners start, `index.ts` attempts consumer startup in the
background with the same CreditService instance. Failed connection, registration
or package-load attempts retry indefinitely after 1, 2, 4, 8, 16 and then 30 seconds,
remaining capped at 30 seconds. Each failed startup attempt logs its error message
and next delay once; the REST and gRPC APIs keep running. Connection attempts
reuse the same client. Once connected, Credit registers its consumer and exits
the startup retry loop. The shared client's existing reconnect loop handles later
disconnects and restores its registered consumers.

SIGINT/SIGTERM cancel a pending startup retry wait and prevent further attempts.
Shutdown closes both API listeners, waits for an in-flight startup operation,
closes the broker, then ends the database pool. A connection that finishes during
shutdown is closed without registering a consumer. A broker close failure is
logged and does not skip database cleanup.

`@foc/messaging` is now included as a local workspace and Credit dependency;
root builds, Credit predev and the Docker image build it before Credit. The
package was copied from `origin/events/data-validation` at
`0b48f5f85be01d148176a6410c9ca22c2b8e672e`. **Broker implementation and contracts
are authored by @sunpterodactyl and the shared messaging contributors.** Credit-specific work includes consumer wiring/tests and the
human-requested shared-client `isConnected` getter used for live listener health. User Service publication remains owned by its implementer. There is no InitCredits RPC.

## gRPC authentication and errors

The shared [credit.proto](../shared/grpc/proto/credit.proto) exposes:

| RPC | Request fields | Response |
| --- | --- | --- |
| GetBalance | userId | userId, totalCredits, reservedCredits, availableCredits |
| ReserveCredits | orderId, requesterId, amount | Full reservation |
| UpdateReservation | orderId, amount, expectedVersion | Full reservation |
| ReleaseCredits | orderId | Full reservation |
| SettleCredits | orderId, courierId | Full reservation |
| GetReservation | orderId | Full current reservation |

A full reservation contains orderId, requesterId, amount, status, optional courierId,
reservationId and version. Shared TypeScript clients use camelCase; protobuf field
names use snake_case. Initialization is event-driven and history is REST-only.

The six order-only RPCs are GetBalance, ReserveCredits, UpdateReservation,
ReleaseCredits, SettleCredits, and GetReservation. The caller supplies
`x-credit-service-token` metadata. Credit derives service identity from its
configured secret using direct string equality. Missing/unknown or
multiple tokens yield `UNAUTHENTICATED`; a known unauthorized service yields
`PERMISSION_DENIED`. Only the order-service secret is configured at startup.

Set `CREDIT_ORDER_SERVICE_TOKEN` to the same secret on Credit and Order Service.
Credit gRPC always uses plaintext on port 50054 (or the configured GRPC_PORT).
Order uses the shared client's default plaintext credentials and sends
x-credit-service-token. There are no Credit TLS configuration variables.
CREDIT_JWT_PUBLIC_KEY_PATH is still required for REST user-token verification.

Business errors preserve gRPC codes and the `x-credit-error-reason` trailer:
ACCOUNT_NOT_FOUND, RESERVATION_NOT_FOUND, INSUFFICIENT_CREDITS, VERSION_CONFLICT,
INVALID_STATE, or REQUEST_CONFLICT. Invalid IDs/amounts fail before connecting to
the database. Order IDs must be lowercase hyphenated UUIDs. Amounts and expected
versions are positive int32 integers. IDs must be nonempty, at most 128 characters,
with no leading/trailing whitespace or control characters.
Database serialization/deadlock/lock failures map to
ABORTED; connection failures map to UNAVAILABLE; unknown failures map to INTERNAL.
Only the dedicated ValidationError maps to INVALID_ARGUMENT (or REST 400).
Unexpected errors, including ordinary TypeError, return generic INTERNAL/500
messages and are logged with the original error on the server. Known business,
authentication and transient error mappings are preserved.

The shared Credit client preserves codes/trailers and retries only UNAVAILABLE,
ABORTED and DEADLINE_EXCEEDED using an application loop.
The defaults are three total attempts within one 1,300 ms budget; the backoff base
starts at 50 ms, doubles, caps at 500 ms, and each wait is half the base plus a
random amount up to half the base. Every attempt uses the remaining budget.
Earlier upstream deadlines apply; delays that consume the remaining time are
skipped, and no retry starts after expiration. The last error is returned unchanged.
Client/per-call overrides are documented in the
[shared client reference](../shared/grpc/README.md#credit-client-retries), including
the existing timeoutMs override and maxAttempts/initialDelayMs/backoffMultiplier/
maxDelayMs. Other service client behavior is unchanged.

## Health

Public GET `/health` on port 3004 runs `SELECT 1` and reports live listener readiness:

```json
{ "status": "ok", "db": "up", "listener": "up" }
```

| Database | Listener readiness | HTTP | Overall status |
| --- | --- | --- | --- |
| up | up or down | 200 | ok |
| down | up or down | 503 | degraded |

The listener is down before initial registration, while disconnected or recovering,
and during shutdown. It becomes up after initial registration or after the shared
client reconnects and finishes restoring its consumers. Credit reads the shared
client's `isConnected` getter; it does not actively probe RabbitMQ. Consumer
cancellation on an otherwise open channel is not detected by this getter.
Listener readiness remains informational: database health alone controls HTTP
status and overall status. No token is required.

```sh
curl -i http://localhost:3004/health
```

Compose healthchecks both `credit-db` (`pg_isready`) and `credit-service` (this
`/health` endpoint, which must return 200).

## Frontend REST and user history

GET `/credits/me/balance` returns userId, totalCredits, reservedCredits, and
availableCredits. GET `/credits/me/history` accepts optional pageSize and
pageToken and returns entries and nextPageToken (null on the last page).
Responses use camelCase, string IDs, ISO UTC timestamps, integer credits, and
null optional links. History entries and pagination tokens omit the internal
sequenceId. Each nextPageToken is the base64url-encoded UUID of the last entry
returned on that page.

Both routes require `Authorization: Bearer <user token>`. Credit verifies the
User Service RSA public key, RS256 only, a subject and an unexpired exp. The
subject selects the user; caller-supplied IDs or admin roles give no extra reach.
Errors have `{ error, message }` fields. Matching GET routes require authentication;
missing/invalid tokens return 401. Route matching happens first, so an unknown
path returns 404 even without a token. Known limitation: unsupported methods
currently return 404 rather than 405, with or without a token.
On matched routes, invalid sizes/bookmarks return 400; missing, DELETED or CLOSED
accounts return 404; transient service failures return 503; internal failures
return 500. Both balance and history require an ACTIVE account.

The REST listener runs on port 3004. Set CREDIT_JWT_PUBLIC_KEY_PATH to the User
Service public PEM. Local Compose mounts that same file read-only at
/run/credit/user-service-public.pem, defaulting to ../user-service/keys/public.pem
relative to credit-service/. Supply that public file before starting; no private
User Service key is read, mounted, or packaged.

Both history RPCs, their messages/types, and client wrappers have been removed.
User history is REST-only; there is no order-history operation.

History storage/query support is implemented. Entries retain order_id and
reservation_id (both NULL for `INITIAL_GRANT` and `BALANCE_RESTORED`), both signed
deltas, and created_at.
Migration 006 adds an always-generated bigint sequence_id, unique sequence index,
`(user_id, sequence_id DESC)` index, and one INITIAL_GRANT per user via a partial
unique index. Migration 011 replaces that index with one allowing a single
`INITIAL_GRANT` or `BALANCE_RESTORED` row per user. There is no order-history
method/index. Queries page downward below
the sequence boundary; sequence values stay decimal strings in JavaScript.
Created_at is display-only: PostgreSQL [now()](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)
uses transaction start. The human selected default page size 50, maximum 100,
entry-ID bookmarks, and INVALID_ARGUMENT for invalid sizes/tokens.
Bookmarks encode the last returned entry's UUID as UTF-8 base64url, without JSON,
user ID or sequence ID. On continuation, Credit validates the token and looks up
the private sequence boundary using `WHERE id = $1 AND user_id = $2`, with user_id
from the authenticated subject. Malformed UUIDs, nonexistent entries and entries
belonging to another user all produce `Invalid history page token` (REST 400).
Old `{ userId, sequenceId }` tokens are rejected. No schema or migration change
is needed. Query pageSize defaults to 50 and must be an integer from 1 to 100.
Pages fetch one extra row; later requests use sequence_id strictly below the
resolved boundary. Sequence values and the existing ordering/index stay internal.

## Setup and configuration

Copy [.env.example](.env.example) to the ignored `credit-service/.env`. Both
Docker Compose and host development read it. Supply User Service's public PEM
before starting Credit (`npm run keys:generate` in user-service). No private User
Service key is needed.

| Configuration | Default / requirement |
| --- | --- |
| CREDIT_ORDER_SERVICE_TOKEN | Required; match Order Service's configured secret |
| CREDIT_JWT_PUBLIC_KEY_PATH | `../user-service/keys/public.pem`, relative to credit-service/ |
| RABBITMQ_URL | Required, .env.example uses : `amqp://guest:guest@localhost:5672` |
| DOCKER_RABBITMQ_URL | Compose: the broker as seen from the container (`host.docker.internal`) |
| HTTP_PORT / GRPC_PORT | `3004` / `50054` |
| PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE | Compose creates `credit-db` from PGUSER/PGPASSWORD/PGDATABASE and publishes it on PGPORT; host runs connect through PGHOST:PGPORT |

### Docker (from credit-service/)

Provide a reachable RabbitMQ broker separately; this Compose file starts the
database, the migration job and Credit:

```sh
docker compose up -d --build
```

| Service | What it is | Where (standalone dev) |
| --- | --- | --- |
| `credit-db` | PostgreSQL 17, data in the credit_service_pgdata volume | `127.0.0.1:${PGPORT}` (5433) |
| `credit-migrate` | One-off job: applies new migrations, then exits | — |
| `credit-service` | gRPC + REST | `localhost:50054`, `http://localhost:3004` |

Inside Docker, Credit reaches the database at `credit-db:5432`. Ports are
published by `compose.override.yaml`, which Compose loads only when run from this
folder; the root compose does not load it, so nothing is exposed there.

After source changes, rebuild the image; a previous image does not pick up source
edits automatically:

```sh
docker compose up -d --build credit-service
```

To open psql, stop the stack keeping the data, or reset it:

```sh
docker compose exec credit-db psql -U credit_service -d credit_service
docker compose down       # keep the data
docker compose down -v    # also delete the data
```

### Host development

```sh
npm install                              # from the repository root
npm run dev --workspace @foc/credit-grpc
```

The predev script builds both shared packages.

## SQL migrations

The current tables are credit_accounts, reservations, credit_history and
idempotency_records.

In Docker, the `credit-migrate` job runs `migrations/run-migrations.cjs` on every
`docker compose up`, before `credit-service` starts. It applies every
`migrations/*.sql` in filename order, each in its own transaction, and records
each file in the `credit_migrations` table (filename, applied_at, success).
Files already recorded as successful are skipped; on a failure the file is rolled
back, recorded as unsuccessful, and the run stops. A PostgreSQL advisory lock
prevents two runs from applying migrations at the same time. Databases migrated
by hand before this job existed have no records, so reset them once with
`docker compose down -v`.

To run the same runner from the host against the published database:

```sh
set -a; . ./.env; set +a                 # from credit-service/: export the PG* values
node migrations/run-migrations.cjs
# Or use the same runner through npm:
npm run db:migrate

# Apply pending files only through this filename, inclusive:
node migrations/run-migrations.cjs --to 001_initial.sql
npm run db:migrate -- --to 001_initial.sql
```

From the repository root, the equivalent bounded command is:

```sh
npm run db:migrate --workspace @foc/credit-grpc -- --to 001_initial.sql
```

Without `--to`, the runner applies all pending files. With `--to`, it considers
only files through the named target in sorted filename order, skipping successful
records within that range. Use the exact filename, not a path. An unknown target
or invalid arguments fail before connecting to the database. A stop point does
not undo later files that were already applied. Both bounded and full runs use
the same migration ledger, advisory lock and per-file transactions; the separate
single-file runner has been removed.

The runner uses PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE; PGDATABASE must be
explicit. Each migration runs in one transaction, following
[node-postgres](https://node-postgres.com/features/transactions).
Migration 009 requires the updated service queries that omit account/reservation
timestamps.
Migration 004 enforces unique order_id, settled iff courier is set, and distinct
participants. Migration 005 changes the initial label. Migration 006 converts all
remaining legacy labels, adds sequence paging and initial-grant uniqueness, and
replaces the type check with the six human-specified values. Invalid legacy data
causes a full rollback; it is not removed or silently repaired. Idempotency
operation_type values retain init_credits/reserve/update/release/transfer.
Migration 007 enforces credit_amount > 0 and version > 0 in PostgreSQL. History
deltas are checked by type: INITIAL_GRANT exactly (10, 0); RESERVED
(0, positive); RESERVATION_UPDATED (0, nonzero); RELEASED (0, negative);
TRANSFER_OUT (negative, equal negative); TRANSFER_IN (positive, 0).
Each pair is (total_amount_change, total_reserved_change). Existing invalid rows
reject the entire migration without rewriting data.
Migration 008 requires order_id and reservation_id for every non-INITIAL_GRANT
history entry and forbids both links on INITIAL_GRANT. Its partial unique index
on (reservation_id, type) covers RESERVED, RELEASED, TRANSFER_OUT and TRANSFER_IN;
RESERVATION_UPDATED may occur multiple times. Invalid legacy links or duplicate
indexed events reject the entire migration; no data is repaired or deleted.
Migration 009 drops created_at and updated_at from credit_accounts and reservations.
The account model and repository no longer read or write those columns.
Migration 010 removes user_id and created_at from idempotency_records;
credit_history.created_at remains. The existing balance/reservation REST and
gRPC response fields are unchanged.
Migration 011 adds account status (ACTIVE by default, DELETED or CLOSED),
requires CLOSED balances to be 0/0, and adds `BALANCE_RESTORED` with nonnegative
total change, zero reserved change and NULL order/reservation links. It replaces
the initial-grant-only unique index with one opening allocation per user across
`INITIAL_GRANT` and `BALANCE_RESTORED`. Apply migrations through 011 before
running the lifecycle consumer.

## Verification

Build and run the Credit suite from the repository root:

```sh
npm run build
PGHOST=127.0.0.1 PGPORT=5433 PGUSER=credit_service PGPASSWORD=credit_service_local PGDATABASE=credit_service npm test --workspace @foc/credit-grpc
npm test --workspace @foc/grpc
```


Root `npm test` runs the shared gRPC suite; use the Credit workspace command above
for Credit tests. Without PGDATABASE, the database integration checks skip.

Tests cover migrations and rollback, initial-allocation duplicates, full atomic
rollback, no overspend, version conflicts, settle/release races, opposing
settlements, exact history links/deltas, entry-ID pagination, late writes,
authentication, error trailers and public health. 
The shared [SQL ledger oracle](test/sql/ledger-violations.sql) returns violating
rows for explicitly scoped scenario users/reservations (empty means pass).
It checks order/actor links, held amounts, reservation versions, terminal history,
account/history sums and conservation. The [seeded scenario](test/ledger-invariants.test.cjs)
uses four accounts, six workers within a six-connection pool, and four default
seeds with eight rounds of 48 operations each. Checks run after each round drains;
unexpected errors and deadlocks fail, print the seed and stop remaining rounds.
To replay one seed:

```sh
PGHOST=127.0.0.1 PGPORT=5433 PGUSER=credit_service PGPASSWORD=credit_service_local PGDATABASE=credit_service CREDIT_INVARIANT_SEED=12825 node --test credit-service/test/ledger-invariants.test.cjs
```

The separate live-listener test requires a disposable broker with no other
consumers. A private TCP proxy simulates startup outages and later disconnects
without stopping the broker. It checks health/recovery without a Credit restart,
one restored consumer, registration delivery, duplicates, retries, dead letters,
restart and shutdown during startup backoff using an isolated database schema:

```sh
npm run build
docker run -d --name credit-listener-test -p 127.0.0.1:5674:5672 rabbitmq:3-management
docker exec credit-listener-test rabbitmq-diagnostics -q ping
PGHOST=127.0.0.1 PGPORT=5433 PGUSER=credit_service PGPASSWORD=credit_service_local PGDATABASE=credit_service RABBITMQ_TEST_URL=amqp://guest:guest@127.0.0.1:5674 node --test credit-service/test/listener.integration.cjs
docker rm -f -v credit-listener-test
```

Wait for the broker ping to succeed before running the test. This file is outside
the default test glob and refuses to proceed if the Credit queue is already in
use. It never purges an existing queue. Integration tests clean up their schemas,
listeners and child processes. Agent-run checks do not establish human review.

## Attribution for JSON files

The human approved this attribution method for comment-free JSON in
[entry 005](ai/usage-log.md#005--confirm-column-rules-and-add-pg-migration-tooling).

| File | Tool, date, and scope | 
| --- | --- |
| credit-service/package.json | OpenAI Codex (GPT-6), 2026-10-20–2026-10-21: pg, migration/test scripts, @types/pg, jsonwebtoken and @types/jsonwebtoken; relocated the existing workspace manifest to the service root in exchange 024; relocated the migration CLI in exchange 034 (2026-10-22); added @foc/messaging dependency and predev build in exchange 037; exchange 048 (2026-10-30) points db:migrate to the tracked run-migrations.cjs runner with optional --to. | 
| Root package-lock.json | OpenAI Codex (GPT-6), 2026-10-20–2026-10-21: corresponding dependencies/transitive packages and relocated credit workspace/link metadata; earlier npm also normalized existing flags; exchange 037 adds messaging/amqplib workspace entries and resolves the shared Zod range to 4.6.7. | 
| Root package.json | OpenAI Codex (GPT-6), 2026-10-21: changed only the credit workspace path from credit-service/grpc to credit-service, using the recorded comment-free JSON attribution method; exchange 037 adds the shared/messaging workspace and prerequisite build. | 
| shared/messaging/package.json and tsconfig.json | Original files by @sunpterodactyl/shared messaging contributors, copied byte-for-byte from 0b48f5f in exchange 037. Provenance is in shared/messaging/README.md. | 

Exact prompts/key exchanges and actual checks are archived under
[credit-service/ai/](ai/usage-log.md). The human authors remain responsible for
review, validation, team norms, licensing checks, and submission disclosure.

## AI Use Summary

Credit implementation, tests and documentation assistance are recorded in
[ai/usage-log.md](ai/usage-log.md), including tools/models, exact prompts, affected
files, actual checks and human review status.
