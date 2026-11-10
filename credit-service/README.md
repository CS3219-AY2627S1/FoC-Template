# FoC Credit Service

Credit owns FoC's closed credit economy: one wallet per user, the initial allocation,
atomic reserve/release/transfer for errands, and an append-only transaction ledger.

## Stack and boundaries

Python 3.13, FastAPI/Pydantic, SQLAlchemy async/asyncpg and a separate Supabase
PostgreSQL 17 project, following Order Service's runtime conventions. Credit never
reads another service's database and is never read by one; other services reach it
only through its versioned HTTP API and `foc.events` messages.

The application factory owns a connection pool and closes it on shutdown. Startup
does not connect, migrate or seed the database. Readiness runs a bounded read-only
check that the `credit_service` schema is reachable; liveness is independent of it.

## Local setup

Run from `credit-service/`. Docker Desktop must already be running.

1. Create an isolated Python 3.13 environment and install dependencies.

   Windows Git Bash:

   ```bash
   py -3.13 -m venv .venv
   .venv/Scripts/python.exe -m pip install -e '.[dev]'
   ```

   On macOS/Linux use `python3.13` and `.venv/bin/python`. PowerShell can use
   `py -3.13` and `.\.venv\Scripts\python.exe`.

2. Install the team-pinned Supabase CLI and start **this service's** database:

   ```bash
   npm ci
   npx supabase start
   ```

   The project ID is `credit-service`. Auth, Data API, storage, realtime, analytics,
   SMTP and edge functions are disabled. Studio is an operator UI, never a browser
   dependency of FoC.

3. Copy `.env.example` to an ignored `.env` only if `.env` does not already exist.
   Set `DATABASE_URL` to the connection URL from this project's `npx supabase status`.
   Host applications use `127.0.0.1:16522`. Do not reuse a User, Supplier or Order URL.

   The migration creates a `credit_service_app` NOLOGIN role with schema USAGE and
   table-specific grants. A deployment operator provisions a dedicated login that
   inherits this role; no login/password is embedded in migrations.

4. Start the API:

   ```bash
   .venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8003
   ```

| Purpose | Address |
| --- | --- |
| Credit API / Swagger | `http://localhost:8003/docs` |
| Process liveness | `http://localhost:8003/health/live` |
| Database readiness | `http://localhost:8003/health/ready` |
| Credit Studio | `http://localhost:16523` (select `credit_service`) |
| Credit PostgreSQL | `127.0.0.1:16522` (not a webpage) |

Reserved local ports are in `1652x`, separate from User's `1542x`, Supplier's `5532x`
and Order's `1642x`.

## Migrations and preserved data

`supabase/migrations/` is the sole schema history. Never use SQLAlchemy `create_all`,
an additional migration framework or startup DDL.

```bash
npx supabase migration new <description>
npx supabase migration up --local
```

Reconstruct migrations with `npx supabase db reset --local` **only in an explicitly
disposable Credit database**. The reset deletes local application data. Ordinary
`npx supabase stop` / `npx supabase start` retains it.

## Tests

```bash
.venv/Scripts/python.exe -m pytest -q -m "not integration"
.venv/Scripts/python.exe -m ruff check app tests
```

Integration tests **write and truncate data**. Set `CREDIT_TEST_DATABASE_URL` in your
terminal to your own disposable, migrated Credit database (for example the local
administrative URL from `npx supabase status`). The broker tests also need
`CREDIT_TEST_RABBITMQ_URL`; they use a throwaway exchange and queues, never `foc.events`.

```bash
export CREDIT_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:16522/postgres'
export CREDIT_TEST_RABBITMQ_URL='amqp://<user>:<password>@127.0.0.1:5672/'
.venv/Scripts/python.exe -m pytest -q -m integration
```

CI runs lint, the unit/ASGI tests and an image build. Tests marked `integration` are
explicitly deselected there, not counted as passing.

## Event consumer

`credit-consumer` is a separate process from the same image. It binds
`credit-service.events` to `foc.events` for `user.registered.v1` and the four
`order.*.v1` terminal events, plus a `.retry` queue (TTL, dead-letters back) and a
`.dlq` queue. It refuses to start without `INITIAL_CREDIT_ALLOCATION` or `RABBITMQ_URL`.

```bash
.venv/Scripts/credit-consumer
```

Changing `CONSUMER_RETRY_DELAY_SECONDS` changes the retry queue's arguments: delete
`credit-service.events.retry` in the RabbitMQ UI before restarting, or RabbitMQ rejects
the redeclaration. Contracts, states and retry rules are in [API.md](API.md).

## Integrity check and recovery

`credit-verify` is a read-only check for use after a restart or recovery (M4NFR5.2). It
prints PASS/FAIL for each invariant and exits 1 if any fails: no negative balances, one
initial allocation per wallet, reserved balance equal to the wallet's active reservations,
every balance rebuilt exactly from the ledger, and credits held equal to credits allocated.
It also reports dead-lettered events that were never applied.

```bash
.venv/Scripts/credit-verify
docker compose --env-file user-service/.env --profile credit exec credit-service credit-verify
```

Compose restarts `credit-service` and `credit-consumer` automatically if their process
exits (`restart: unless-stopped`, M4NFR5.1); stopping them through Docker is treated as
intentional. Confirmed balance changes live only in PostgreSQL, so nothing is lost. Drill:

```bash
docker compose --env-file user-service/.env --profile credit exec credit-service sh -c 'kill 1'
curl http://localhost:8003/health/ready      # ready again within seconds (RESTARTS = 1)
docker compose --env-file user-service/.env --profile credit exec credit-service credit-verify
```
### Resolving dead-lettered events

While Credit's database is unreachable, events keep being retried every
`CONSUMER_RETRY_DELAY_SECONDS` until it is back, so an outage resolves itself. Events that
cannot be applied for another reason (invalid data, an unknown reservation, a conflict, or
a database error that persists) end in `credit-service.events.dlq` and in
`credit_service.event_failures`. After fixing the cause, inspect and replay them:

```bash
.venv/Scripts/credit-replay-dlq --list        # show what is waiting; moves nothing
.venv/Scripts/credit-replay-dlq               # replay all (or --limit N)
```

Each message returns to `credit-service.events` as a first attempt. Replaying is safe to
repeat: events already applied are ignored by the `processed_events` inbox. In Docker:
`docker compose --env-file user-service/.env --profile credit exec credit-consumer credit-replay-dlq --list`.

## Running with the whole stack

From the repository root, after User's setup (its `.env`) and with Credit's database
running:

1. Copy `credit-service/.env.docker.example` to `credit-service/.env.docker` and fill in
   `DATABASE_URL` (host `host.docker.internal:16522`) and a random `ORDER_SERVICE_SECRET`.
2. Put the same secret in `order-service/.env.docker` as `CREDIT_SERVICE_SECRET`.
3. Start everything:

   ```bash
   docker compose --env-file user-service/.env --profile order --profile credit up --build -d
   ```

Compose starts `credit-service` (port `127.0.0.1:8003`) and `credit-consumer`, and gives
Order the internal origin `http://credit-service:8003`. The web client reaches
`/v1/wallets...` and `/v1/admin/wallets...` through nginx; `/v1/internal/*` is not routed
to Credit. Start the consumer before users register: RabbitMQ drops events published
while no Credit queue is bound. Users who registered earlier still receive their wallet
and allocation on first use (wallet view, first errand, or first payout).

## D3 demo

1. Register two users (requester and courier). Each `GET /v1/wallets/me` (the Wallet
   page) shows `available 20, reserved 0, total 20`.
2. The requester creates an errand with reward 5: `15 / 5 / 20`, recent activity shows
   *Reserved −5*.
3. The courier accepts, picks up and delivers; the requester completes. Requester
   `15 / 0 / 15` with *Paid −5*; courier `25 / 0 / 25` with *Earned +5*.
4. The requester creates and cancels another errand: the reserve and its release both
   appear in history and the balance returns.
5. Redelivery: in the RabbitMQ UI (`http://localhost:15672`) publish the completion
   payload again to `foc.events` with routing key and `type` `order.completed.v1`.
   Balances do not change; the consumer logs `outcome=DUPLICATE`.
6. Consumer outage: `docker compose stop credit-consumer`, cancel an errand, then
   `docker compose start credit-consumer`. The release is applied after restart.
7. Durability: `docker compose restart credit-service credit-consumer`; balances are
   unchanged.

## Observability

- Consumer log lines: `event processed event_id=… type=… entity_id=… outcome=…
  attempt=… duration_ms=…`, `event scheduled for retry …` and `event dead-lettered …`
  (`docker compose logs -f credit-consumer`). Logs never contain tokens or secrets.
- Every HTTP response carries `X-Correlation-ID` (echoed from the request when safe).
- Queue depth: RabbitMQ UI → Queues → `credit-service.events`, `.retry`, `.dlq`.
- Processing records (Credit Studio `http://localhost:16523` or `psql`):

  ```sql
  SELECT event_type, outcome, count(*) FROM credit_service.processed_events GROUP BY 1, 2;
  SELECT * FROM credit_service.event_failures ORDER BY failed_at DESC LIMIT 20;
  ```

- Invariant check (credits held always equal credits allocated):

  ```sql
  SELECT (SELECT sum(available + reserved) FROM credit_service.wallets) AS held,
         (SELECT sum(amount) FROM credit_service.credit_transactions
           WHERE type = 'ALLOCATION') AS allocated;
  ```
