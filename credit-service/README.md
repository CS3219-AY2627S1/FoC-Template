<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-09-25
Mode: Documentation generation and formatting.
Scope: Documented team-finalized Credit Service behavior, interfaces, data contracts, and operating instructions.
Author review: I reviewed for correctness and edited where needed.
-->

# Credit Service

The Credit Service owns Friend on Campus credit accounts, balances, reservations and the
immutable credit ledger. Sprint 1 allocates exactly 50 credits after registration, lets an
authenticated user view their own balances, and reserves usable credits before an order becomes open.
It also implements the merged Order Service contract for courier assignment, reopen holds,
refunds, and completion settlement.

## Run

```bash
# Whole system through the gateway at http://localhost:8080
docker compose up --build

# Service from source against local PostgreSQL and the Auth emulator
docker compose up -d credit-postgres firebase-emulator
PORT=8084 SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5434/credit_service \
SPRING_DATASOURCE_USERNAME=credit_dev SPRING_DATASOURCE_PASSWORD=credit_dev_password \
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 ./mvnw spring-boot:run
```

- Swagger UI: `/api/credits/docs`
- OpenAPI JSON: `/api/credits/v3/api-docs`
- Health: `/actuator/health`
- Peer-service handoff: [`docs/admin-transaction-api-handoff.md`](docs/admin-transaction-api-handoff.md)

## Sprint 1 API

Every business endpoint requires a Firebase ID token. The token subject is used directly for
`GET /api/credits/me` and must match the `userId` or `requesterId` supplied to write operations.
Credit resolves application roles independently through User Service. Courier assignment and
hold-for-reopen require `ROLE_COURIER` in addition to their existing identity and reservation
ownership checks. Local Compose uses mock roles; cloud deployments use
`GET /api/users/role-context` with the caller's bearer token and fail closed when role lookup is
unavailable. Administrator balance and transaction queries require `ROLE_ADMIN`. These remain
caller-authenticated gateway endpoints; restricting them to trusted Order-to-Credit service calls
is separate work.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/credits/me` | Return the authenticated user's total, reserved and usable balances. |
| `GET` | `/api/credits/me/transactions?page=1&size=20` | Return the authenticated user's newest credit transactions. |
| `GET` | `/api/credits/users/{userId}/balance` | Let an administrator view one user's authoritative total, reserved and usable balances. |
| `GET` | `/api/credits/users/{userId}/transactions?page=1&size=20` | Let an administrator view one user's newest credit transactions. |
| `GET` | `/api/credits/all/transactions?page=1&size=20` | Let an administrator view newest transactions across all users; each item includes `userId`. |
| `PUT` | `/api/credits/orders/{orderId}/reservation` | Atomically reserve credits, using `orderId` as the idempotency key. |
| `GET` | `/api/credits/orders/{orderId}/reservation` | Recover the authenticated requester's reservation status. |
| `PUT` | `/api/credits/orders/{orderId}/courier-assignment` | Idempotently associate the authenticated courier before Order persists acceptance. |
| `POST` | `/api/credits/orders/{orderId}/hold-for-reopen` | Clear the assigned courier without releasing the requester's held credits. |
| `GET` | `/api/credits/commands/{key}` | Return an owned durable command result, including a committed `PENDING` result. |
| `POST` | `/api/credits/commands/{key}/compensate` | Fence an unfinished command or conditionally reverse its own applied effect. |
| `POST` | `/api/credits/internal/command-compensations` | Receive an authenticated Pub/Sub compensation request. |
| `POST` | `/api/credits/admin/compensation-results/{eventId}/redrive` | Redrive a retained failed result with its original event ID (administrator only). |

Reservations use `RESERVED`, `REFUNDED` and `PAID`.
There is no gift, withdrawal, top-up, direct balance update, or generic CRUD API.

Reservation, courier-assignment, and hold-for-reopen mutations opt into synchronous recovery only
when both `Idempotency-Key` and a positive `X-Command-Generation` are supplied. Supplying neither
preserves the legacy contract; supplying only one is a validation error. Recovery-aware responses
include `Idempotency-Key` and `Command-Outcome`. A key is bound permanently to its authenticated
actor, operation, order, and canonical input, so it cannot be repurposed by increasing its
generation.

Credit commits a `PENDING` command record before attempting its financial or assignment effect.
The effect and terminal `APPLIED` or `REJECTED` result then commit atomically in a second
transaction. A retry resumes a committed pending command and returns a saved terminal response
without repeating the effect. Compensation uses the same command lock and generation fence. It can
release only the reservation created by that command, clear only the exact assignment carrying that
command identity, or restore the exact courier/assignment pre-image saved by a keyed
`CLEAR_COURIER`. Every reservation mutation advances a shared revision, so a later clear,
assignment, settlement, or refund prevents an old compensation from undoing newer state. Unsafe or
historical effects without trustworthy revision or pre-image evidence return
`RECONCILIATION_REQUIRED`.

Reservation reversals remain fully recorded in the immutable ledger, including their
`COMPENSATION` reason and command identity. The authenticated user's transaction-history projection
suppresses both the compensated reservation and its reversal because the corresponding Order was
never created. Administrator transaction-history projections apply the same filtering. Genuine
cancellation and expiry refunds remain visible.

## User and Order events

Google Cloud Pub/Sub delivers user-account creation and each finalized Order event stream to an authenticated, typed push
endpoint:

| Event | Push endpoint | Credit action |
|---|---|---|
| `UserCreated` | `POST /api/credits/internal/user-events/created` | Idempotently create the user's credit account and allocate 50 credits. |
| `OpenOrderRefundTaskEvent` | `POST /api/credits/internal/order-events/open-refund` | Release the requester's reservation after `CANCELLED` or `EXPIRED`. |
| `OrderCompletionTaskEvent` | `POST /api/credits/internal/order-events/completion` | Debit the requester's reserved/total balance and credit the recorded courier. |

These endpoints use a separate Google OIDC security chain from the Firebase-authenticated user API.
It validates the push service-account email, token issuer and audience. Each endpoint invokes its
designated handler directly, while checking the subscription and declared event type as routing
guardrails. The receiver requires compact schema version 2 in the Pub/Sub attributes and verifies
the attribute event ID/type against the seven-field body. Credit resolves the requester from its
reservation and verifies the event amount and courier against that authoritative record.

`AcceptedOrderCancellationTaskEvent` remains an Order/User penalty event and is not consumed by
Credit. When an expired accepted-order cancellation requires a financial refund, Order emits a
separate `OpenOrderRefundTaskEvent` with `orderStatus=EXPIRED`.

User Service commits the new user and a `UserCreated` outbox row together, publishes it asynchronously,
and never calls Credit Service during the registration request. Credit validates schema version 1,
the configured subscription, and matching event ID/type/version attributes before initializing the account.

Credit records `eventId` and a payload hash in the same PostgreSQL transaction as reservation,
account, and ledger mutations. It returns HTTP 204 only after that transaction succeeds; any
non-success response is retried by Pub/Sub. After ten unsuccessful deliveries, the subscription
forwards the message to the environment's shared Credit dead-letter topic for inspection/recovery.

## Command compensation operations

The approved Order contract defines `CreditCompensationRequested` version 1 on the environment's
compensation topic. This service implements the Credit consumer and durable result-outbox side.
Order CHANGE-158/ADR-055 now provides opt-in request publishing and a separately authenticated
result receiver; both deployed policies remain unchanged until coordinated rollout.
Credit validates an authenticated push, subscription, envelope, immutable command
binding, generation, and operation-specific amount. A request arriving before the original command
creates an absorbing `COMPENSATED/FENCED_NO_EFFECT` tombstone; a later execute cannot apply even at a
higher generation. Exact request replays reuse the saved result and never repeat a financial change.
Conflicting event or command reuse returns 409 without mutation.

The inbox row, command resolution, reservation/account/ledger changes, result JSON, and result
outbox row commit together. Result events use `CreditCompensationResult` version 1 and a stable ID
derived from compensation ID, outcome, and provider resolution revision. The publisher attempts
delivery after commit. A one-minute recovery sweep claims up to 50 rows with a two-minute lease,
retries with exponential backoff capped at five minutes, and retains `FAILED` after ten attempts.
Cloud deployment currently sets `CREDIT_MESSAGING_MODE=disabled`, leaving committed results pending
until Order's authenticated result subscription is deployed. Change it to `google` only as part of
that coordinated rollout. Local Compose uses `emulator`.

Flyway V10 gives pre-compensation reservations the non-zero baseline revision `1`, then records an
applied legacy RESERVE or ASSIGN_COURIER effect only when the current reservation proves the exact
command binding and effect are still active. Settled, mismatched, superseded, and historical
CLEAR_COURIER commands remain without invented effect/pre-image evidence and therefore resolve only
through reconciliation.

Useful PostgreSQL inspection queries:

```sql
select event_id, command_id, generation, outcome, code, result_event_id, created_at
from credit_compensation_inbox order by created_at desc;

select event_id, compensation_id, state, attempt_count, next_attempt_at,
       lease_until, published_at, last_error
from credit_compensation_result_outbox order by created_at desc;
```

For `RECONCILIATION_REQUIRED`, inspect reservation and command revisions before taking any manual
financial action; never republish with a new compensation ID. For retained `FAILED`, correct the
broker/IAM issue and call the admin redrive endpoint, which preserves the event ID and payload. For
request DLQ recovery, inspect the shared Credit incoming-event DLQ, correct routing/authentication
or the underlying database failure, then republish the original message unchanged. Result delivery
does not use a DLQ because PostgreSQL is its recovery source of truth.

Local end-to-end verification requires `docker`, `curl`, `jq`, `uuidgen`, and `shasum`:

```bash
./scripts/compensation-smoke.sh
```

The smoke test seeds one applied command in local PostgreSQL, publishes its compensation through
the Pub/Sub emulator, pulls the result, redelivers the same request, and verifies one reversal and
the same result event ID.

An infrastructure owner provisions staging after the Cloud Run service exists:

```bash
infra/gcp/configure-order-pubsub.sh staging    # the environment's own Order topics
infra/gcp/configure-credit-pubsub.sh staging
```

Production provisioning remains disabled in `infra/gcp/project.env` until staging verification
passes and the production-promotion change explicitly enables it.

## Data model

Credit Service exclusively owns a PostgreSQL database for each environment. Flyway creates and
validates the schema at application startup:

| Table | Primary key | Purpose |
|---|---|---|
| `credit_accounts` | `user_id` | Authoritative total and reserved balances. Usable balance is derived. |
| `credit_reservations` | `order_id` | One idempotent reservation per order. |
| `credit_idempotency_records` | `(operation, idempotency_key)` | Registration/Pub/Sub source, payload hash, resource, and replay protection. |
| `credit_command_records` | `command_id` | Durable synchronous recovery result and generation fence. |
| `credit_compensation_inbox` | `event_id` | Immutable request binding and saved provider resolution. |
| `credit_compensation_result_outbox` | `event_id` | Durable result publication, lease, retries, and retained failures. |
| `credit_ledger` | `entry_id` | Immutable evidence of every successful balance change. |

The existing idempotency table remains dedicated to registration and Pub/Sub event deduplication.
Refund ledger rows persist `CANCELLATION`, `EXPIRY`, or `COMPENSATION`. Historical rows without a
reason are exposed as a generic refund. Transaction history is ordered by occurrence time, creation
time, then entry ID.

Account, reservation/idempotency, and ledger writes commit in one PostgreSQL transaction.
Account rows are locked during balance mutations so concurrent reservations cannot overdraw an account.

## Test

```bash
./mvnw verify
```

Integration tests use a Testcontainers PostgreSQL instance. The build enforces at least 80%
line and branch coverage and writes `target/openapi.json`. `CreditCommandRecoveryIntegrationTest`
contains a test-only Order-contract harness for response loss, status recovery, same-key replay,
compensation, concurrency, and crash boundaries. It does not enable or modify Order Service's
production HTTP recovery adapter.
