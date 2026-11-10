<!-- Additional AI assistance: OpenAI Codex (GPT-6), 2026-11-09. Scope: Transaction history API and verification documentation for #58. Author review: Reviewed and approved by @phuc. -->
<!-- Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing implementation and verification notes. Author review: Reviewed and approved by @phuc. -->
<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Documented the Credit Service database and logic as implemented from docs/decision-record.md.
Author review: Reviewed and approved by @phuc
Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
Scope: Documented the Kafka consumer, DLQs, outbox publisher loop and the end-to-end test.
Author review of additional changes: Reviewed and approved by @phuc
-->

# Credit Service

Owns every credit balance on the platform. The design is in
[docs/implementation-proposal.md](docs/implementation-proposal.md) and the decisions behind it in
[docs/decision-record.md](docs/decision-record.md).

## Status

| Part | State |
|---|---|
| Database: roles, schema (decision D1), migration runner | Done |
| Message handling: account status, initial grant, reserve, capture, release, forfeit | Done |
| Account-status replay protection | `processed_account_status` (`0003`), written atomically with effects; retain markers indefinitely |
| Outbox: insert, publish batch, retention cleanup | Done |
| Balance read (`getBalance`) | Done; authenticated `GET /me/credit` |
| Kafka topics, including the two DLQs | Created by the shared `kafka-init` Compose service, see [../kafka/README.md](../kafka/README.md) |
| Kafka consumer, rejection replies, DLQ, outbox publisher loop | Done (`src/consumer.ts`, `src/publisher.ts`, `src/index.ts`) |
| Own transaction history HTTP API | Implemented; see contract below |
| `/health` HTTP API | Not implemented |

## Layout

```
migrations/0001_create_credit_tables.sql  schema and credit_app grants
docker/postgres/init-roles.sh             creates credit_migrator and credit_app on a fresh volume
src/migrate.ts, src/migrations.ts         migration runner (same rules as User Service)
src/messages.ts                           validates incoming Kafka payloads
src/accounts.ts                           account status, initial grant, forfeit, balance
src/reservations.ts                       reserve, capture, release
src/outbox.ts                             outbox insert, publisher batch, cleanup
src/consumer.ts                           Kafka consumer: parse, handle, reply/DLQ, commit offset
src/publisher.ts                          outbox publisher loop and hourly cleanup
src/kafka.ts                              Kafka client and producer (acks=all, idempotent)
src/index.ts                              service entry point
src/http.ts, src/sessionVerifier.ts        own-history route and live User verification
src/transactions.ts                       history validation and read-only query
src/lifecycle.ts                          independent, retriable Kafka startup
src/db.ts                                 pool and inTransaction()
e2e/                                      end-to-end test in its own Compose stack
```

## How messages are handled

`src/consumer.ts` reads `user.account-status` and `credit.commands` (group `credit-service`), one
message at a time in partition order, and commits a message's offset only after it is fully
handled (decision D7):

| Handler outcome | What the consumer does before committing the offset |
|---|---|
| Message not JSON, or fails validation | Sends it to the topic's DLQ with the reason |
| `applied`, `duplicate`, `reserved` | Nothing more (`CreditReserved` is in the outbox) |
| `rejected` (reserve) | Produces `CreditReservationRejected` to `credit.results` and waits for the ack (decision D5) |
| `invalid` | Sends it to the topic's DLQ with the reason |

DLQs: `user.account-status.dlq` and `credit.commands.dlq`. A message whose handling throws is
retried in place, 5 attempts in total, then sent to the DLQ. When the database or Kafka is
unreachable, attempts are not counted: the message is retried until the outage ends, because
sending it to the DLQ would lose a valid message.

`src/publisher.ts` publishes the outbox (batches back to back, 250 ms pause when empty) and
deletes published rows older than 7 days every hour.

## Running locally

Set `CREDIT_DB_ADMIN_PASSWORD`, `CREDIT_DB_MIGRATION_PASSWORD` and `CREDIT_DB_APP_PASSWORD` in
`.env`, then:

```sh
docker compose up -d --build credit-service   # starts kafka, credit-db, migrations, then the service
docker compose logs -f credit-service          # one JSON line per handled message
```

## Tests

### End-to-end (through Kafka)

```sh
bash credit-service/e2e/run.sh        # or: cd credit-service && npm run test:e2e
```

Starts a separate, throwaway Compose stack (project `foc-credit-e2e`: Kafka, credit-db,
credit-service; no host ports, volumes deleted afterwards), then plays User Service and Order
Service: it sends messages to `user.account-status` and `credit.commands`, and checks the replies
on `credit.results`, the DLQs and the database. It covers the initial grant, accepted and rejected
reserves (each reason code), duplicate deliveries, capture, the three release events, suspension,
closure with forfeit, invalid messages going to the DLQ, and the outbox being fully published.
On failure it prints the credit-service logs; `--keep` leaves the stack running.

### Database tests

The database tests need a disposable PostgreSQL 17 server and a superuser URL. Each test file creates its
own database, applies the migrations, and drops the database afterwards.

```sh
cd credit-service
npm install
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
```

They cover the verification plan in implementation-proposal.md §12, including concurrent
duplicate deliveries, concurrent reserves from one user, capture/cancel races, deferred forfeit,
two outbox publishers at once, and that `credit_app` cannot change `credit_transactions`. After
every database test, each balance is checked against the sum of its ledger deltas and its `HELD`
reservations.

## Transaction history HTTP API

Current balance is available separately at public `GET /api/v1/me/credit`
(internal `GET /me/credit`). It uses the same live User Service verification and
returns `{ available, reserved, total }` from the current account, without date or
pagination parameters. Results use `Cache-Control: no-store`. An account not yet
created returns 404 `CREDIT_ACCOUNT_NOT_READY`; callers can retry while the initial
account notification propagates. Missing/inactive sessions return 401 and dependency
outages return 503, matching history. It does not create an account or grant credits.

`GET /api/v1/me/credit/transactions` through the frontend gateway maps to
`GET /me/credit/transactions` on Credit (port 3003 by default).
Send `Authorization: Bearer <access-token>`. Credit forwards it to User Service
`GET /auth/verify` and uses only the verified ID, including for administrators.

| Query | Meaning |
| --- | --- |
| `from` | Optional inclusive ISO timestamp with timezone, e.g. `2026-11-02T00:00:00+08:00` |
| `to` | Optional exclusive timestamp; must be later than `from` |
| `page` | Zero-based integer, default 0 |
| `size` | Integer from 1 to 100, default 20 |

Timestamps require seconds and `Z` or an explicit `+/-HH:MM` offset; fractional
seconds may contain 1 to 3 digits. Date-only values, invalid calendar dates,
repeated parameters, unknown parameters (including `userId`), invalid pagination,
and unsafe offsets return 400. Either date bound can be used alone.
Use `URLSearchParams` or URL-encode `+` as `%2B`. For a complete Singapore calendar
day, use midnight `+08:00` through the following midnight as the exclusive end.

Example request for 2 November 2026 in Singapore:

```sh
curl -G http://localhost:8080/api/v1/me/credit/transactions \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'from=2026-11-02T00:00:00+08:00' \
  --data-urlencode 'to=2026-11-03T00:00:00+08:00' \
  --data-urlencode 'page=0' --data-urlencode 'size=20'
```

Response: `{ items, page, size, totalItems }`. Each item contains `id` (decimal
string), `type`, `availableDelta`, `reservedDelta` (whole credit numbers),
`reservationId`, `orderId` (nullable), and `createdAt` (UTC ISO timestamp).
All six ledger types are returned. Both deltas are retained because a reservation
moves credits between available and reserved balances. Rows sort newest first by
`createdAt`, then `id`. Count and page share one PostgreSQL statement snapshot.
New entries can shift later page positions. Unknown/not-yet-created accounts,
unmatched filters and out-of-range pages return 200 with an empty `items` array;
out-of-range pages still include the filtered total. Responses use `Cache-Control: no-store`.

401 means a missing, invalid, expired or inactive session. User verification
outages/timeouts and database connection outages return 503. Malformed successful
verification replies or unexpected upstream statuses return 500. Internal error
details are not returned to clients.

For direct startup, set `USER_SERVICE_BASE_URL` (required), `PORT` (default 3003),
and `USER_SERVICE_VERIFY_TIMEOUT_MS` (default 1000, maximum 60000). Migration commands
still need only their database settings. Compose supplies the internal User URL;
`CREDIT_PORT` and `CREDIT_USER_SERVICE_VERIFY_TIMEOUT_MS` configure the host port and
timeout. Vite uses `CREDIT_SERVICE_URL` (default `http://localhost:3003`).

HTTP starts after database readiness independently of Kafka connection attempts.
Kafka startup failures retry in the background. Shutdown drains HTTP, stops Kafka
workers and closes the shared pool, with a 15-second overall shutdown deadline.
No schema migration is needed. AWS Credit deployment remains outside this change
under ADR 0001.
