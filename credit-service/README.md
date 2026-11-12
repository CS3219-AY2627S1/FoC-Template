<!---
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-09 to 2026-11-10
 * Scope (AI-63): Generated README for Credit service
 * Author review: Changes made were checked and reviewed
--->



# Credit Service

Spring Boot service for user credit wallets, credit reservations for errands, and transaction history. It uses PostgreSQL, validates JWT access tokens issued by User Service, consumes user registration events from Kafka, and publishes credit change events through a transactional outbox.

All Docker Compose commands below run from the repository root, where `compose.yaml` and `.env` are located.

## Prerequisites

- Java 17 and Maven 3.9+ (or the included Maven wrapper) for running the service or tests directly
- A running Docker environment with Docker Compose:
  - Windows/macOS: Docker Desktop (includes Docker Compose)
  - Linux: Docker Desktop, or Docker Engine with the Docker Compose plugin

## Configuration

Copy `.env.example` to `.env` if `.env` does not exist:

```powershell
cp .env.example .env
```

Set the Credit Service values in `.env`:

| Variable | Purpose |
| --- | --- |
| `CREDIT_DB_NAME` / `CREDIT_DB_USERNAME` / `CREDIT_DB_PASSWORD` | Credit PostgreSQL database and credentials |
| `CREDIT_DB_PORT` | Host port for PostgreSQL (default `5431`) |
| `CREDIT_SERVICE_PORT` | Host port for the API (default `8001`) |
| `CREDIT_CORS_ALLOWED_ORIGINS` | Comma-separated origins allowed to call the wallet endpoints from a browser (default `http://localhost:5173`). **Note:** `compose.yaml` does not currently pass this variable to the `credit-service` container, so under Docker Compose the default is always used. |
| `JWT_ISSUER` | Expected issuer of access tokens (default `campuscouriers-user-service`) |
| `ORDER_CREDIT_SERVICE_KEY` | Shared backend-only key required for reservation endpoints. Must be the same value in Order Service. |

New wallets start with 30 credits. This is set by `credit.wallet.default-credits` in `src/main/resources/application.properties`, not by an environment variable.

## Build and start with Docker Compose

From the repository root, start the broker, User Service, and Credit Service:

```powershell
docker compose up -d --build kafka user-service credit-service
docker compose logs -f credit-service
```

Compose also starts the Credit PostgreSQL database and the User Service database as dependencies. Credit Service is available at `http://localhost:8001` by default. It connects to Kafka using the internal Compose address and retrieves JWT signing keys from User Service.

To start only the database while developing, run:

```powershell
docker compose up -d credit-db
```

Stop the service and its database with:

```powershell
docker compose stop credit-service credit-db
```

The named Docker volume preserves database data. Do not run `docker compose down --volumes` unless you intend to delete the development data.

## Run Spring Boot locally

The application needs a reachable PostgreSQL database, Kafka broker, and User Service JWKS endpoint. The root Compose Kafka broker is internal to Docker, so a host process needs a separately reachable broker or an appropriate host-accessible Kafka configuration.

Set the database and integration variables in the same terminal used to start Maven. The database values below match the defaults in `.env.example`. For Windows PowerShell:

```powershell
$env:DB_HOST = "localhost"
$env:DB_PORT = "5431"
$env:DB_NAME = "campuscouriers_credit"
$env:DB_USERNAME = "credit_service"
$env:DB_PASSWORD = "password"
$env:USER_SERVICE_URL = "http://localhost:8081"
$env:KAFKA_BOOTSTRAP_SERVERS = "<your-kafka-host>:9092"
$env:JWT_ISSUER = "campuscouriers-user-service"
$env:ORDER_CREDIT_SERVICE_KEY = "<same-backend-secret-as-order-service>"
```

From the repository root:

```powershell
cd credit-service
.\mvnw.cmd spring-boot:run
```

## API

All endpoints require a valid JWT access token (`Authorization: Bearer <token>`). The user ID is taken from the token subject; a subject that is not a UUID returns `401`.

### Wallet endpoints (called by the frontend)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/wallets/availableBalance` | Return the caller's available balance: `{"availableBalance": 30}` |
| `GET` | `/api/wallets/transactionHistory` | Return the caller's credit transaction history, newest first |

`transactionHistory` is paginated with the `page` (0-based, default `0`) and `size` (default `20`) query parameters, for example `/api/wallets/transactionHistory?page=1&size=10`. The response is a Spring Data page: a `content` array plus page metadata (`number`, `size`, `totalElements`, `totalPages`). Each entry has:

| Field | Meaning |
| --- | --- |
| `transactionId` | Credit record ID |
| `orderId` | Errand the change belongs to |
| `type` | `RESERVED`, `RELEASED`, `TRANSFERRED` or `RECEIVED` (see below) |
| `description` | Short user-facing text, e.g. "Credits held for errand" |
| `amount` | Signed change to the available balance |
| `balanceAfter` | Available balance after the change |
| `occurredAt` | ISO-8601 timestamp |

| Type | When | `amount` |
| --- | --- | --- |
| `RESERVED` | Credits are held for a new errand | negative |
| `RELEASED` | Held credits are refunded (errand cancelled or failed) | positive |
| `TRANSFERRED` | Held credits are paid to the courier (requester's record) | `0`, because the credits leave the reserved balance, not the available one |
| `RECEIVED` | Credits are earned for a completed errand (courier's record) | positive |

Adjusting a reservation's amount (`PUT /api/reservations/{reservationId}`) changes the balances but does not currently write a history record.

### Reservation endpoints (called by Order Service only)

These change balances, so they also require the `X-Order-Service-Key` header (see [Integration](#integration)). The token must belong to the errand's requester. Each returns `reservationId`, `orderId`, `amount` and `status`, where `status` is `HELD`, `RELEASED` or `TRANSFERRED`.

| Method | Endpoint | Body | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/reservations` | `userId`, `orderId`, `amount` | Hold credits for an errand. Retrying with the same details returns the existing reservation. |
| `PUT` | `/api/reservations/{reservationId}` | `newAmount` | Change the held amount |
| `POST` | `/api/reservations/{reservationId}/release` | none | Refund held credits. Releasing again is a safe no-op. |
| `POST` | `/api/reservations/{reservationId}/complete` | `courierUserId`, `orderId` | Pay the held credits to the courier. Retrying for the same courier is a safe no-op. |

### Error responses

Errors are returned as `application/problem+json` with a `detail` message.

| Status | Cause |
| --- | --- |
| `400` | Invalid request body (e.g. non-positive amount, missing ID) |
| `401` | Missing or invalid token, or token subject is not a UUID |
| `403` | Missing or wrong `X-Order-Service-Key`, reserving another user's credits, or the reservation is not the caller's |
| `404` | The user has no wallet, or the reservation does not exist |
| `409` | Insufficient credits, suspended wallet, reservation in the wrong state, the same order reserved with different details, `orderId` not matching the reservation, or a courier completing their own errand |
| `503` | `ORDER_CREDIT_SERVICE_KEY` is not configured in Credit Service |

## Wallet provisioning and events

Credit Service consumes `user.registered` Kafka events and creates a wallet with the default credit amount (30 credits). Receiving the same event twice does not create a second wallet. Wallet creation is asynchronous, so a new account may not have a wallet until its registration event has been consumed. Accounts registered before this consumer was running have no wallet, and one is not created automatically.

Every credit change is written to the `outbox` table in the same transaction as the change, and relayed to Kafka by Debezium in the repository Compose environment. Each event goes to the topic for its type and is keyed by order ID:

| Topic | Published when |
| --- | --- |
| `credit.reserved` | Credits are held for an errand |
| `credit.released` | Held credits are refunded |
| `credit.transferred` | Held credits leave the requester's wallet on completion |
| `credit.received` | The courier is paid on completion |

The payload fields are `creditRecordId` (use it to skip duplicates), `changeType`, `orderId`, `userId`, `counterpartyUserId` (the other user in a transfer, otherwise `null`), `amount` (signed change to available balance), `reserveAmount` (signed change to reserved balance), `availableBalanceAfter` and `occurredAt`.

## Run the tests

Run the unit tests (no Docker, database or Kafka needed):

```powershell
cd credit-service
.\mvnw.cmd test "-Dtest=!CreditApplicationTests"
```

Run everything, including the Spring context test, which starts PostgreSQL with Testcontainers and needs a running Docker daemon:

```powershell
cd credit-service
.\mvnw.cmd test
```

| Test class | Covers |
| --- | --- |
| `WalletServiceTests` | Wallet creation and the hold, release, deduct and transfer balance rules |
| `ReservationServiceTests` | Reserve, adjust, release and complete: balances, history records, safe retries, invalid states, and wallet lock order |
| `CreditRecordsServiceTests` | History records and events written for each change type |
| `CreditEventTests` | Event topics, outbox rows, and the `user.registered` listener |
| `CreditRecordsResponseTests` | Transaction history entries returned to the frontend |
| `ReservationControllerTests` / `WalletControllerTests` | Service key, token subject and ownership checks |
| `CreditApplicationTests` | The application starts against a real PostgreSQL database |

## Troubleshooting

### Wallet endpoint returns `404`

The authenticated user may not have a wallet yet. Check that Kafka is running and that the `user.registered` event has been consumed. Logging in does not create a missing wallet.

### Reservation endpoint returns `403` or `503`

Confirm that the request includes the correct `X-Order-Service-Key` and that the same non-empty `ORDER_CREDIT_SERVICE_KEY` is configured for both Order Service and Credit Service. A `503` means the key is not configured in Credit Service.

### Browser requests are blocked by CORS

The frontend's origin must be in `CREDIT_CORS_ALLOWED_ORIGINS`. Under Docker Compose this variable is not passed to the container (see [Configuration](#configuration)), so only `http://localhost:5173` is allowed.

### Access token is rejected

Check that `USER_SERVICE_URL` points to the service serving `/.well-known/jwks.json` and that `JWT_ISSUER` matches the issuer in the token.

### Tests cannot find Docker

Only `CreditApplicationTests` needs Docker. Start Docker Desktop or the Docker Engine and wait until it is ready, or run the unit tests only (see [Run the tests](#run-the-tests)).

## Integration
Order Service integration and setup are documented in
[Order/Credit integration](../order-service/CREDIT_INTEGRATION.md).

`GET /api/wallets/availableBalance` uses the authenticated user's JWT subject.
All `/api/reservations` mutations additionally require the backend-only
`X-Order-Service-Key`, configured using `ORDER_CREDIT_SERVICE_KEY` in both services.
No browser client should receive this secret. These endpoints are intended for trusted backend callers, not direct browser use. Reservation ownership is checked
against the authenticated subject, and completion validates its orderId.


See [Order/Credit integration](../order-service/CREDIT_INTEGRATION.md) for request examples, retry behavior, authorization details, and error handling.

Run focused Java contract tests without a local Java/Maven installation:

```powershell
docker build --target contract-tests -t foc-order-credit-test-contracts:local ./credit-service
``` 
