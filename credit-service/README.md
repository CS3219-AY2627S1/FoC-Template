<!--
  AI Assistance Disclosure:
  Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
   2026-09-26: Recess iteration - documents how to run the service and what was built.
     No requirements, architecture, schema, or API decisions were made by the AI tool.
     Author review: Wee Jean
   2026-10-16: Week 7/8 catch-up - transfer, release, balance read, append-only
     enforcement and the dedicated test database.
     No requirements, architecture, schema, or API decisions were made by the AI tool.
     Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
   2026-11-10: Documentation only - rewrote this file as a service-level README
     (purpose, stack, folder structure, env vars, setup, schema bootstrap, the
     credit_app role, tests, Docker, deployment pointer). Describes the code as it
     stands; the stale "Authentication is blocked" section was removed because the
     JWKS middleware is now mounted. The requirement-status table was restored at the
     author's direction, with NFR8.2.1 and NFR8.2.2 marked complete on her
     instruction: the "Where" column states the implementation each row points at, and
     no requirement was assessed by the AI tool. No source code was changed, and no
     requirements, architecture, schema, or API decisions were made by the AI tool.
     Author review:
-->

# Credit Service

Owns credit balances and the transaction log for FoC.

- **F19 — closed credit economy.** Credits enter only through allocation (20 per new
  user), move only between existing balances, and leave no other way. Reserve holds
  credits against an order, transfer moves them to the courier on completion, release
  returns them on cancellation or expiry.
- **F20 — transaction logging.** Every credit operation appends one row to
  `transaction_log`. Users read their own history; administrators read everyone's.

Standing context — the requirements this implements and the team's schema decisions — is
in [`credit-service-context.md`](./credit-service-context.md). The HTTP and queue
contract is in [API.md](./API.md).

## Requirement status

| Requirement | State | Where |
|---|---|---|
| F19.1.1 — allocate 20 credits on registration | Complete | `POST /credits/allocate`, `INITIAL_ALLOCATION_CREDITS` |
| F19.2.1–F19.2.3 — reserve, hold, reject an over-offer | Complete | `POST /credits/reserve`; over-offer is `422 INSUFFICIENT_UNRESERVED_CREDITS` |
| F19.3.1 — transfer reserved credits to the courier | Complete | `POST /credits/transfer`, and the `credit_transfer` queue job |
| F19.3.2 — at most one transfer per request | Complete | `transaction_log_one_transfer_per_request` partial unique index |
| F19.4.1 — release on cancellation or expiry | Complete | `POST /credits/release` |
| F19.5.1 — view total, reserved and unreserved | Complete | `GET /credits/balance/:userId`, own-scope or rank >= `admin` |
| F19.5.2 — a user's own transaction history | Complete | `GET /credits/transactions`, scoped to the token's `sub` |
| F20.1.1 — log every credit operation | Complete | one `transaction_log` row on all four write paths |
| F20.2, F20.2.1 — administrator view of all transactions | Complete | `GET /credits/transactions/all`, rank >= `admin`, with `?userId=` and `?requestId=` |
| NFR8.1.1 — atomic concurrent balance updates | Complete | `withTransaction` + `SELECT … FOR UPDATE`, deterministic lock order |
| NFR8.1.2 — complete rollback on a failed transfer | Complete | single transaction per operation; `tests/concurrency/transfer-rollback.test.ts` |
| NFR8.2.1 — logging adds no more than 500 ms | Complete | the log row is one `INSERT` in the same transaction as the balance write, with no extra round trip |
| NFR8.2.2 — retain each record for at least 2 years | Complete | `credit_app` holds no `DELETE` or `TRUNCATE` on `transaction_log`, so records are never removed |
| NFR8.2.3 — append-only transaction log | Complete | enforced by database privilege; `tests/db/append-only.test.ts` |

## Tech stack

| | |
|---|---|
| Runtime | Node.js 24, ES modules, TypeScript 5.4 |
| HTTP | Express 4 |
| Database | PostgreSQL, accessed with `pg` (raw SQL, no ORM) |
| Validation | zod 3 |
| Auth | `jose` — RS256 access tokens verified against User Service's JWKS |
| Queue | BullMQ 6.3.13 on Redis, with `ioredis` 5.11.1 |
| Tests | vitest 1.6 with supertest |
| Deployment | Docker, ECS Fargate |

## Folder structure

```
src/
  app.ts                      Express app (exported without listening, so tests mount it)
  server.ts                   HTTP entrypoint
  config.ts                   zod-validated environment schema
  auth/
    roleRank.ts               ROLE_RANK, ELEVATED_ROLE, canReadBalance
    verifyAccessToken.ts      createJwksVerifier — RS256 against the JWKS
  middleware/
    auth.ts                   requireAuth, requireElevated, requireSelfOrElevated
    requireBalanceAccess.ts   requireAuth + requireSelfOrElevated, as one handler pair
    errorHandler.ts           AppError → envelope; CHECK violations; 404 fallback
  routes/credits.routes.ts    route table
  controllers/                request validation and response shaping
  services/credits.service.ts transaction boundaries and business rules
  db/
    pool.ts                   pg Pool
    transaction.ts            withTransaction helper
    init.sql                  schema (applied on an empty volume)
    grants.sql                credit_app privileges
    grant-app-role.sh         creates credit_app, then applies grants.sql
    queries/                  SQL for balances, transaction_log, dead_letter_jobs
  queue/
    transferQueue.ts          queue/task names, payload guard, backoff strategy
    redisConnection.ts        ioredis client and reconnect behaviour
  worker/
    main.ts                   BullMQ Worker process entrypoint
    transferJobProcessor.ts   per-job handling and dead-lettering
    classifyTransferError.ts  success / permanent / retry classification
  domain/constants.ts         INITIAL_ALLOCATION_CREDITS = 20
tests/                        vitest suites (http, services, db, worker, concurrency)
```

Two processes run from this one image: the API (`src/server.ts`) and the transfer worker
(`src/worker/main.ts`).

## Environment variables

Validated by `src/config.ts` at startup; the process exits if any required value is
missing or malformed. See [.env.example](./.env.example).

| Name | Required | Purpose |
|---|---|---|
| `PORT` | yes | Port the API listens on (3003 in compose) |
| `NODE_ENV` | yes | One of `development`, `production`, `test` |
| `DB_HOST` | yes | PostgreSQL host |
| `DB_PORT` | yes | PostgreSQL port |
| `DB_NAME` | yes | Database name |
| `DB_USER` | yes | Role the service connects as — `credit_app` in compose and deployment |
| `DB_PASSWORD` | yes | Password for `DB_USER` |
| `DB_SSL` | no, default `false` | `true` requires TLS with a verified server certificate |
| `USER_SERVICE_URL` | yes | User Service origin; the JWKS URL is built from it |
| `REDIS_HOST` | yes | Redis host for the transfer queue (`order-redis` in compose) |
| `REDIS_PORT` | yes | Redis port |
| `REDIS_TLS` | no, default `false` | `true` connects to Redis over TLS |

`REDIS_HOST` and `REDIS_PORT` are validated by the API process as well as the worker, so
a misconfigured broker fails at startup rather than at the first job.

Deployment also sets `NODE_EXTRA_CA_CERTS=/etc/ssl/rds-ap-southeast-1-bundle.pem` in the
task definition. The image carries that bundle; nothing trusts it without the variable.

Test settings live in [.env.test](./.env.test), which is committed. It adds
`DB_OWNER_USER` and `DB_OWNER_PASSWORD` (the database owner, used only by the test
bootstrap) and must match `CREDIT_DB_USER` / `CREDIT_DB_PASSWORD` in the root `.env`.

## Local setup

`credit-db`, `credit-service` and `credit-worker` are defined in the root
`compose.yaml`. Set the `CREDIT_*` variables in the root `.env` (copy the root
`.env.example`), then from the repo root:

```bash
docker compose up --build credit-service credit-worker
```

That publishes the API on `${CREDIT_SERVICE_PORT:-3003}` and the database on
`${CREDIT_DB_PORT:-5435}`.

To run on the host against the containerised database:

```bash
docker compose up -d credit-db
cd credit-service
cp .env.example .env      # then set DB_HOST=localhost and DB_PORT=5435
npm install
npm run dev               # API
npm run worker:dev        # transfer worker, in a second shell
```

### Scripts

| Script | Does |
|---|---|
| `npm start` | API via `tsx` |
| `npm run dev` | API under `nodemon`, restarts on changes in `src/` |
| `npm run worker` | Transfer worker via `tsx` |
| `npm run worker:dev` | Worker under `nodemon`, forwarding `SIGTERM` |
| `npm run build` | `tsc` to `dist/` |
| `npm test` | vitest, single run |
| `npm run test:watch` | vitest in watch mode |

## Schema bootstrap

There is no migration tool. `src/db/init.sql` is applied by the Postgres image on the
**first start of an empty data volume**, mounted into `docker-entrypoint-initdb.d` by the
root `compose.yaml`. It is idempotent — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF
NOT EXISTS`, and the enum guarded against `duplicate_object`.

Because it only runs on an empty volume, **pulling a schema change does nothing to a
database you already have.** Recreate the volume:

```bash
docker compose down -v credit-db
docker compose up -d credit-db
```

Recreate `user-db` at the same time if user rows matter: balances are keyed to user
UUIDs, so recreating one and not the other leaves orphaned rows.

`init.sql` creates three tables — `balances`, `transaction_log` and `dead_letter_jobs` —
described in [API.md](./API.md).

## The `credit_app` role

The tables are owned by the bootstrap superuser. The service and the worker connect as
`credit_app`, created by `src/db/grant-app-role.sh` (run from
`docker-entrypoint-initdb.d` after `init.sql`), which then applies `src/db/grants.sql`:

```sql
GRANT USAGE ON SCHEMA public TO credit_app;
GRANT SELECT, INSERT, UPDATE ON balances TO credit_app;
GRANT SELECT, INSERT ON transaction_log TO credit_app;
REVOKE UPDATE, DELETE, TRUNCATE ON transaction_log FROM credit_app;
REVOKE DELETE, TRUNCATE ON balances FROM credit_app;
GRANT SELECT, INSERT, UPDATE ON dead_letter_jobs TO credit_app;
REVOKE DELETE, TRUNCATE ON dead_letter_jobs FROM credit_app;
```

`credit_app` holds no `UPDATE` or `DELETE` on `transaction_log`, so an attempt to modify
a logged row fails with `42501 insufficient_privilege` (NFR8.2.3). `grant-app-role.sh`
refuses to run if `CREDIT_APP_USER` is anything other than `credit_app`, since
`grants.sql` names that role literally.

## Tests

```bash
npm test
```

`tests/setup/globalSetup.ts` drops and recreates a dedicated database, `credit_db_test`,
on every run from `src/db/init.sql` and `src/db/grants.sql` — the same two files the
container bootstrap applies. It refuses to run if `DB_NAME` does not end in `_test`, and
refuses if `DB_USER` is `credit_app`, requiring a test-only role such as
`credit_app_test` with identical grants.

That role has no `DELETE` anywhere, so tests do not tidy up after themselves; isolation
comes from the rebuilt database plus a fresh UUID per case.

Suites: `tests/http/` (routes and auth through supertest), `tests/services/`,
`tests/db/` (constraints, append-only privilege, TLS options), `tests/worker/` (job
processing, classification, queue wiring), `tests/concurrency/` (interleaved reserve and
rollback).

## Docker

```bash
docker build --target prod -t credit-service:prod .
```

Targets: `base` (dependencies and source), `dev` (`npm run dev`), `prod` (`npm run
build`, then `node dist/server.js`, plus the RDS CA bundle at
`/etc/ssl/rds-ap-southeast-1-bundle.pem`). The image exposes 3003. The worker runs from
the same image with its command overridden to `node dist/worker/main.js`.

## Deployment

ECS Fargate, cluster `foc`, region `ap-southeast-1`. `credit-service` and
`credit-worker` are two ECS services from one ECR repository, `foc/credit-service`,
deployed on every merge to `main` by
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). Start, stop and
teardown steps are in
[`docs/ecs-fargate-run-checklist.md`](../docs/ecs-fargate-run-checklist.md).

## API

[API.md](./API.md) documents every endpoint — method, path, auth, parameters, request
and response bodies, every status code, and a `curl` example — plus the asynchronous
queue interface and an explicit list of what was invented where no requirement or team
decision covered it.

## Design decisions

<!-- Written by the author -->
