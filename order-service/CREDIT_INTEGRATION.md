# Order/Credit integration

`main/credit_client.py` implements balance, reserve, release and complete calls.
The user's verified bearer token is forwarded; mutation calls additionally carry
`X-Order-Service-Key`, a backend-only shared secret. Never put this key in a VITE
variable, browser request, committed configuration, or log. Both services must use
the same long random `ORDER_CREDIT_SERVICE_KEY`. Empty configuration fails closed.
Use TLS or appropriately protected transport outside trusted local development.

## Setup

Copy the missing CREDIT_DB settings from the root `.env.example` to your local
`.env`, and generate the service key from the repository root:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
```

Paste the result into `ORDER_CREDIT_SERVICE_KEY` in `.env` (do not commit it).
Compose already sets `CREDIT_SERVICE_URL=http://credit-service:8080`; host Python
defaults to `http://localhost:8001`. `CREDIT_SERVICE_TIMEOUT` defaults to 5 seconds.
For host Python, also set `ORDER_CREDIT_SERVICE_KEY` in the process environment.

Rebuild both services after configuring the key:

```powershell
docker compose up -d --build credit-service order-service
```

The Order image runs Alembic on startup, including `0005_credit_integration`.
It adds nullable `credit_reservation_id` (unique), `pending_credit_action`, and
`credit_operations`, a durable intent/retry journal. Existing errands are retained
without invented reservations. Legacy errands remain readable to participants/admins
but cannot be accepted, cancelled, completed or failed through credit operations
until explicitly reconciled. Do not delete databases or create fake reservation IDs.

## API calls

| Action | Credit endpoint | Body |
| --- | --- | --- |
| Balance | GET /api/wallets/availableBalance | None; user from JWT |
| Reserve | POST /api/reservations | userId, orderId, amount |
| Release | POST /api/reservations/{reservationId}/release | None |
| Complete | POST /api/reservations/{reservationId}/complete | courierUserId, orderId |

The errand UUID is orderId; reservationId is the distinct UUID returned by Credit
Service and saved internally. Completion's courier comes from the persisted errand.
Balance checking is preliminary; reservation locks the wallet and authoritatively
checks funds. No credit call is needed for acceptance or GET /errands.

## Idempotency and recovery

For creation, send a stable `Idempotency-Key` header (1–120 characters) and reuse
the same body and key for retries, including after refreshing an expired token.
The key is scoped to the authenticated requester. A changed body with the same key
returns 409. Successful retries return the same errand without another reservation
or creation event. CORS permits/exposes this header. The backend accepts omitted
keys for compatibility and returns a generated key on success, but clients must
provide a key themselves to recover safely when the initial response is lost.
The existing frontend has not yet been updated to supply a stable key.

Creation commits its intent before reserving. If reservation times out, retrying
the same request/key recovers the HELD reservation by its unchanged orderId. If
insertion fails or the deadline passes after reserving, cleanup releases the
reservation and marks the intent ABORTED. Failed cleanup stays COMPENSATING and
the same request/key retries cleanup, not creation. After ABORTED, credits have
been released and a new creation attempt needs a new key.

Cancel/complete/fail also commit an intent before the external credit call. The
errand's pending marker prevents acceptance or a conflicting terminal action.
Repeat the same endpoint/body with a valid requester token after a transient
failure; Credit Service's idempotent release/complete operations avoid a second
balance mutation. Retries may finish after expiry because the intent was authorized
before the deadline. Timestamps record that authorization time. Once committed,
a repeated terminal request still returns 409 as before. A fail retry must retain
its original reason. The final state and domain event commit together.

There is no automatic recovery/expiry worker yet. Pending/compensating operations
need the original request retried; the journal survives process restarts and stores
no tokens. Operators can inspect `credit_operations` for unfinished work. Never clear
pending markers manually without reconciling Credit Service first. A future expiry
worker must skip errands with pending credit actions. This is not a distributed
transaction or a promise that a PostgreSQL rollback reverses external credit effects.

Wallets are created asynchronously from `user.registered` Kafka events; this patch
configures the Credit consumer's broker/JSON deserializer. Existing users or users
whose events have not been consumed may have no wallet. Provision/backfill them via
the approved Credit Service workflow; Order Service never creates wallets by SQL.

## Errors and authorization

Missing wallets/reservations, suspended wallets and insufficient funds are reported
as credit conflicts (409), not errand-not-found errors. Do not blindly retry 409s.
Network/unavailable errors return 503; invalid upstream success responses return
502; rejected credentials return 401/403. A timeout does not prove the operation
failed: keep the same operation/body/key. If a final database commit fails, retry
the same operation rather than attempting a conflicting one.

Credit reservation mutations require both the shared backend key and a valid
requester token. Reserve verifies userId equals the token subject; release, adjust
and complete check reservation ownership. Complete also verifies orderId matches.
The shared key is not a replacement for ownership or JWT validation. JWT issuer is
validated against `JWT_ISSUER` (default campuscouriers-user-service).

## Repeatable isolated integration tests

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File order-service/integration/run-tests.ps1
docker build --target contract-tests -t foc-order-credit-test-contracts:local ./credit-service
```

The script builds separate images and runs real Order/Credit HTTP calls with real
PostgreSQL databases, plus the entire Order test suite with PostgreSQL concurrency
tests enabled. The test JWT issuer and supplier validation endpoint are test doubles;
wallets are explicitly seeded only in disposable test databases. The Kafka/user
registration and real Supplier Service workflows are not covered by this suite.
All test containers/networks and tmpfs database data are removed at the end; normal
development containers and volumes are untouched. Test images remain cached.
The second command runs six focused Credit Service Java contract tests, not its
environment-dependent Spring context smoke test.
