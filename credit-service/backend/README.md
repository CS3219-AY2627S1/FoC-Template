<!--
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
Scope: Generated credit backend setup and API documentation.
Author review: Verified correctness and improved formatting.
-->
# Relay Credit Service Backend

Authenticated credit balance and history API for Relay, backed by Prisma and
PostgreSQL. The source folders follow the User Service backend layout.

## Database

- `CreditBalance` / `credit_balances`: one record per user, with available and
  reserved credit balances, ACTIVE/CLOSED status, and an updated timestamp.
- `TransactionRecord` / `transaction_records`: transaction reference, timestamp,
  sender, receiver, transaction type, and amount.
- `CreditSettlement` / `credit_settlements`: transfer settlement records with
  CREDITED or PENDING status, retained when a courier account closes.

The transaction reference is persisted as the canonical `service:id:type` key
from `@relay/contracts`. Its primary key prevents duplicate references. The API
returns the reference object specified by the contract. Credit amounts use
PostgreSQL decimals for arithmetic and are returned as numbers in HTTP responses.

User identifiers are strings, matching the contracts. Transaction history has no
foreign key to balance records, so deleting a balance does not delete history.
Prisma also maintains its standard `_prisma_migrations` metadata table.

This backend imports its isolated Prisma client through `@relay/credit-prisma`.
`prisma:generate` writes it to `packages/credit-prisma/generated`, so generating
another service's client does not overwrite Credit's client.

## Docker

From the repository root, start the complete environment with Floci:

```sh
npm run up:compose
```

Floci provisions the credit PostgreSQL database and Kafka broker. There are no
`credit-postgres` or `kafka` Compose services. The launcher discovers their
endpoints and credentials before starting the application. Compose exposes
Credit directly at localhost:3002; normal browser traffic uses
http://localhost:8080/api/credit. API container port is 3000.

Startup runs `prisma migrate deploy` before Express. `/health` checks process
liveness; `/healthz` checks database models and returns 503 on failure.

```sh
docker compose exec credit-api wget -qO- http://127.0.0.1:3000/healthz
docker compose exec credit-api npx prisma migrate status --schema=credit-service/backend/prisma/schema.prisma
```

## Source development

Use `npm run dev` from the repository root after `npm ci`. It loads Floci's
generated host endpoints, prepares the database, and starts Credit on port
3003. See the [local guide](../../floci/README.md).

For isolated commands, first export the required settings from
`.env.example`, replacing database and broker values with the discovered ones.
Then run from the repository root:

```sh
npm run prisma:generate --workspace=@relay/credit-backend
npm run prisma:migrate --workspace=@relay/credit-backend -- --name your_change
npm run build --workspace=@relay/credit-backend
```

## HTTP API

| Method | Route                                 | Response                                                  |
| ------ | ------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/credit`                         | `{ userId, availableCredit, reserveCredit, lastUpdated }` |
| GET    | `/api/credit/history?offset={number}` | `{ records: TransactionRecord[] }` (up to 100)            |
| POST   | `/internal/credit/reserve`            | `CreditBalance & { status: 'RESERVE_SUCCESS' }`           |

The two read routes verify the browser's Cognito access and ID cookies locally
through the shared middleware and require a verified email. They do not call
User Service for session validation. The validated Cognito subject selects the
user's records. An optional `userId`
query parameter must match that subject; another user's ID returns 403.
Responses use the credit contract directly, without User Service's
`{ ok, data }` envelope. Dates are serialized as ISO strings.

Reserve accepts the contract body
`{ transactionReference: { service, id, type: 'CREDIT_RESERVE' }, userId, amount }`.
The internal route requires the configured x-credit-service-token header. The body
userId selects the balance to reserve. The amount must be a
nonnegative number. The balance and a `CREDIT_RESERVE` history record are updated
atomically. Repeating a reservation reference returns HTTP 409 with TRANSACTION_CONFLICT
without charging again. The same conflict applies when a release or transfer
transaction already exists with the same service and id. A missing balance returns `USER_NOT_FOUND` (404);
invalid amounts and insufficient available credit return 422.

History includes transactions where the user is sender or receiver, newest
first, with reference as a deterministic tie-breaker. Each response contains
at most 100 records. The optional `offset` query parameter is a non-negative
integer that skips that many records in the database; it defaults to 0.
Request `offset=100`, `offset=200`, and so on to load later batches. Invalid
offsets return `INVALID_REQUEST` (400). No transactions returns
`{ records: [] }`. Missing or invalid authentication returns
`UNAUTHENTICATED` (401), invalid userId input returns `INVALID_REQUEST` (400),
and an unverified email returns `FORBIDDEN` (403).

Configure Cognito issuer/JWKS/client settings for cookie verification, database
and Kafka settings, and `CREDIT_SERVICE_INTERNAL_TOKEN` for internal reservations.
`USER_API_URL`, `USER_API_TIMEOUT`, and `USER_SERVICE_INTERNAL_TOKEN` remain in
configuration but are not used by the public read-route authentication middleware.
Compose's host proxies `/api/credit`; Kubernetes ingress routes it directly.

## Tests

With the local environment running, load its generated endpoints and run the
test script (which generates the client and builds automatically):

```sh
# After npm run up:compose, load generated local endpoints in Bash:
set -a
source floci/docker/.generated.env
set +a
export CREDIT_TEST_DATABASE_URL="$CREDIT_DATABASE_URL_HOST"
export KAFKA_BROKERS="$KAFKA_BROKERS_HOST"
export KAFKA_AUTH_MODE=none
npm run test --workspace=@relay/credit-backend
```

The test script generates the Prisma client, applies pending migrations, builds
`dist/`, and then runs the HTTP, command, and Kafka integration tests. Use the
generated host broker endpoint; a fixed `localhost:29092` listener is not assumed.

Integration tests use the configured credit database and test authentication
fixtures. Fixtures use unique IDs and are removed afterward. Tests cover
Cognito-cookie authentication, ownership checks, balance serialization,
history filtering/ordering, reservation validation and idempotency, concurrent
spending, and the Kafka registration-to-transfer workflow.

## New-user credit allocation

User Service writes a version 1 `UserRegistered` envelope to its PostgreSQL
outbox when a profile is created. Its publisher sends the envelope to
`KAFKA_TOPIC_USER_EVENTS`. Credit Service reads `payload.cognitoSub` and
allocates 100 available credits and 0 reserved credits, with one
`INITIAL_ALLOCATION` transaction from `SYSTEM` to that user.

The `user:<cognitoSub>:INITIAL_ALLOCATION` reference makes replay safe.
Start Kafbat UI with `npm run views:compose -- kafka` at http://localhost:8081.
Start Credit Prisma Studio with `npm run views:compose -- credit` at
http://localhost:5557.

## Errand outcomes and user deletion

Credit Service consumes `KAFKA_TOPIC_ERRAND_EVENTS`. It maps
`ErrandCompleted` to a credit transfer, and `ErrandCancelled` or
`ErrandExpired` to a release. It ignores the other errand event types.
Credit Service uses the errand ID to read the prior reservation and takes
the requester and amount from that record. A completion, cancellation, or
expiry without a reservation is sent as an `ErrandErrorEvent` to
`KAFKA_TOPIC_ERRAND_DLQ`. When `ErrandCreationFailed` arrives before its
reservation, Credit Service atomically records a zero-amount reserve and
release without changing the balance. This prevents a delayed HTTP
reservation from charging the user. If a reservation already exists, that
failure event releases its reserved amount instead.

Release and transfer take the same per-reference database lock as reserve.
Exactly one terminal credit outcome can be recorded for an errand; a later
conflicting event goes to the DLQ. Duplicate events with the same outcome
are idempotent. Credit Service checks the requester and requires a courier
for completed errands. If DLQ publication fails, the source event is retried.

A `UserDeleted` event on `KAFKA_TOPIC_USER_EVENTS` marks the balance CLOSED
and records its total in a USER_DELETION transaction; it does not delete the
balance or ledger history. Existing credited courier settlements become PENDING.
A later completion addressed to a closed courier records a pending settlement
rather than adding available credit. Reserved requester funds remain available
to resolve in-flight errands. A delayed registration event cannot reactivate
the deleted user's account. `kafka-init` creates `user-events`,
`user-events-dlq`, `errand-events`, and `errand-events-dlq` before APIs start.
Malformed, duplicate, out-of-order, and failed credit operations from user
messages are copied to `KAFKA_TOPIC_USER_DLQ` with an `error` code. Credit
Service acknowledges the source message after the DLQ write succeeds, so a
poison event does not block later messages. If the DLQ write itself fails,
Kafka retries the source message rather than losing it; the offset cannot
advance until Kafka can accept the DLQ record.
