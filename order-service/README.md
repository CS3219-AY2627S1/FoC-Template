<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-11-05
Scope: Documented the team-specified admin user order history endpoint.
No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented the supplied order/chat delivery contract and disclosure index.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Updated system message wording per user instruction.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented team-specified status notifications.
Author review: tng wen xi
Scope (2026-11-08, Codex, model: GPT-6): Documented team-specified order participant endpoint and courier delivery.
Author review: tng wen xi
Scope (2026-11-10, Codex, model: GPT-6): Documented the team-specified order chat archive contract.
Author review: tng wen xi
Scope (2026-11-10, Claude Code, model: claude-opus-5-5): Added the overview, processes, order
       lifecycle, API, real-time, background-work, data, dependencies and configuration
       sections, and updated the Layout tree, all describing the code as it is on main
       (584174e). No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: George Yeo
Scope (2026-11-10, Claude Code, model: claude-opus-5-5): Linked API.md and corrected the
       cancel row of the lifecycle table to match src/domain/order-status.ts. No requirements,
       architecture, schema, or API decisions were made by the AI tool.
Author review: George Yeo
-->

# order-service

FoC order microservice. **Node.js · Express 5 · TypeScript (ESM, strict) · Prisma 7 · PostgreSQL 17**

Owns its own database (`order-db`). No other service reads or writes it directly.

## What it does

order-service holds every errand ("order request") from creation to a final state:

- Requesters post orders (one-off, or recurring through a series). Credits are reserved
  with credit-service when the order is created.
- Couriers browse open orders, accept one, then mark it picked up and delivered.
  The requester (or the system, after a delay) marks it completed, which triggers the
  credit transfer to the courier.
- Open orders past their complete-by time expire, and their credits are released.
- Every change is pushed live to the browser over Socket.IO, and chat-service is told
  about it so the order's conversation stays in step.

## Processes

The same image runs as two processes, sharing `order-db` and `order-redis`:

| Process | Entry point | Runs |
| ------- | ----------- | ---- |
| API (`order-service`) | `src/server.ts` | Express REST API and the Socket.IO server on one HTTP server. Socket.IO uses the Redis adapter so emits reach sockets on every replica. |
| Worker (`order-worker`) | `src/worker.ts` | Maintenance sweep (every 60 s), outbox relay (every 1 s), job worker for `queue:order:credit`, release re-drive (every 60 s), series scheduler (every 1 s), and the optional bull-board dashboard. |

```text
browser ──REST / Socket.IO──▶ API ──Prisma──▶ order-db ◀── worker
                               │                │ outbox rows
                               │                ▼
                               └──pub/sub──  order-redis  ◀─ BullMQ jobs ─▶ credit-service, chat-service
```

A write and the background tasks it causes are committed together: the API writes the
order and its `outbox` rows in one transaction, and the worker's relay moves the rows
into BullMQ.

## Order lifecycle

Statuses (`RequestStatus` in `prisma/schema.prisma`) and who may move an order between
them (`src/domain/order-status.ts`):

| From | To | Who |
| ---- | -- | --- |
| `pending` | `open`, `failed` | system (credit reservation outcome) |
| `open` | `accepted` | any user other than the requester |
| `open` | `expired` | system (complete-by passed) |
| `open` | `cancelled` | requester |
| `accepted`, `picked_up` | `cancelled` | requester, once complete-by has passed |
| `accepted` | `picked_up` | courier |
| `picked_up` | `delivered` | courier |
| `delivered` | `completed` | requester, or system (auto-complete) |

`completed`, `expired`, `cancelled` and `failed` are final. Writes use the order's
`version` column for optimistic concurrency.

## API

Full reference with parameters, bodies and responses: [API.md](API.md).

All `/orders` routes need a user's bearer token. The `authenticate` middleware verifies
the RS256 JWT against user-service's JWKS (`GET /auth/.well-known/jwks.json`, cached).

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/health` | Liveness and database check (no auth) |
| POST | `/orders` | Create an order; reserves credits synchronously with credit-service |
| GET | `/orders` | Open-order listing: filters `status`, `location`, `minCredits`, `maxCredits`, `expiresBefore`, `expiresAfter`; `sort` (`completeBy`, `credits`, `createdAt`), `order`, keyset `cursor`; 50 per page |
| GET | `/orders/active` | The caller's active deliveries (as courier) |
| GET | `/orders/mine` | The caller's own orders, `?as=requester` (default) or `?as=courier` |
| GET | `/orders/admin/users/:userId` | Admin view of a user's orders (see [below](#admin-user-order-history)) |
| GET | `/orders/:id` | One order: its requester, courier or an admin; anyone else only while open |
| PATCH | `/orders/:id/edit` | Edit an open order (requester) |
| POST | `/orders/:id/accept` | `open` → `accepted` |
| POST | `/orders/:id/pickup` | `accepted` → `picked_up` |
| POST | `/orders/:id/deliver` | `picked_up` → `delivered` |
| POST | `/orders/:id/complete` | `delivered` → `completed` |
| POST | `/orders/:id/cancel` | → `cancelled` |
| POST | `/orders/series` | Create a recurring errand (RFC 5545 RRULE) |
| GET | `/orders/series/mine` | The caller's series |
| GET | `/orders/series/:seriesId` | One series |
| PATCH | `/orders/series/:seriesId/edit` | Edit a series |
| DELETE | `/orders/series/:seriesId` | Delete a series |

Errors use the `{ "message": "..." }` envelope; codes and messages live in
`src/constants/errors.ts`. The series router is mounted before `/orders/:id`, so `series`
is never read as an order id.

## Real-time events

Socket.IO shares the API's port and path (`/socket.io`). The handshake carries the same
JWT; the connection is closed when the token expires. On connect the server joins the
socket to `user:{id}` and to the room of each of the user's active orders, then emits
`ready`. Clients opt into the open-order feed with `listing:subscribe` /
`listing:unsubscribe`.

Events (`src/realtime/order-events.ts`): `order:created`, `order:accepted`,
`order:pickedUp`, `order:delivered`, `order:completed`, `order:cancelled`,
`order:expired`, `order:failed`, `order:edited`. Payloads are thin
(`orderId`, `status`, `version`, `occurredAt`, plus listing fields where needed); REST stays
the source of truth.

Events raised in the worker are published on the Redis channel `order-events`; every API
replica subscribes and emits them to its own sockets.

## Background work

| Outbox task | Queue | Handled by | Does |
| ----------- | ----- | ---------- | ---- |
| `credit_release` | `queue:order:credit` | order-worker | `POST /credits/release` on credit-service |
| `credit_transfer` | `queue:credit:transfer` | credit-service's worker | Pays the courier on completion |
| `chat_create` | `queue:order:credit` | order-worker | Creates the order's conversation |
| `chat_notification` | `queue:order:credit` | order-worker | Posts a status system message; archives the chat on completion or cancellation |
| `chat_participant` | `queue:order:credit` | order-worker | Adds the courier to the chat on acceptance |

Jobs on `queue:order:credit` get 5 attempts with exponential backoff. A job that runs out
of attempts, or fails permanently, is written to `dead_letter_jobs`. The release re-drive
moves transient `credit_release` dead letters back into the outbox every minute.

Scheduled work in the worker:

- **Maintenance sweep** (`order-request-maintenance`, every 60 s): expires open orders
  past complete-by (queuing their credit release) and auto-completes delivered orders.
- **Series scheduler** (every 1 s): for each due series, checks the requester
  (user-service), the supplier's opening hours and the delivery location
  (supplier-service), then creates the occurrence order and reserves its credits.
  Failed checks are retried and recorded on the series.

Set `QUEUE_DASHBOARD_PORT` to serve a read-only bull-board over all of these queues.

## Data

`prisma/schema.prisma`, PostgreSQL 17:

| Table | Model | Holds |
| ----- | ----- | ----- |
| `requests` | `OrderRequest` | Orders: requester, courier, supplier and delivery location ids, credits, complete-by, status, timestamps, `version` |
| `order_series` | `OrderSeries` | Recurring errands: RRULE, next fire time, retry state |
| `outbox` | `Outbox` | Tasks committed with an order write, waiting for the relay |
| `dead_letter_jobs` | `DeadLetterJob` | Jobs that exhausted their retries |

Supplier and location ids are supplier-service ids; user ids are user-service UUIDs.
There are no cross-database foreign keys.

## Dependencies on other services

| Service | Called by | For |
| ------- | --------- | --- |
| user-service | API, worker | JWKS; `GET /users/me` (courier username), `GET /users/:id` (admin view); `GET /users/worker/:id` with a service key (series) |
| supplier-service | API, worker | Supplier and delivery-location existence on create/edit; opening hours (series) |
| credit-service | API, worker | `POST /credits/reserve` on create; `POST /credits/release`; transfers through `queue:credit:transfer` |
| chat-service | worker | Conversations, system notifications, participants, archive (service key) |

## Configuration

Validated at start-up by `src/config/env.ts`; the process exits if a value is invalid.

| Variable | Default | Used by |
| -------- | ------- | ------- |
| `NODE_ENV` | `development` | both |
| `PORT` | `3000` | API |
| `DATABASE_URL` | required | both |
| `USER_SERVICE_URL` | `http://localhost:3001` | API |
| `SUPPLIER_SERVICE_URL` | `http://localhost:3004` | both |
| `CREDIT_SERVICE_URL` | `http://localhost:3003` | both |
| `CHAT_SERVICE_URL` | `http://localhost:3005` | worker |
| `CHAT_SERVICE_API_KEY` | none (worker refuses to start without it) | worker |
| `USER_ORDER_SERVICE_URL` | `http://localhost:3001` | worker (series) |
| `USER_ORDER_SERVICE_API_KEY` | none (required by the worker) | worker (series) |
| `SUPPLIER_ORDER_SERVICE_API_KEY` | none (required by the worker) | worker (series) |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | both |
| `REDIS_TLS` | `false` | both |
| `QUEUE_DASHBOARD_PORT` | unset (off) | worker |

On AWS the API and worker run as the ECS services `order-service` and `order-worker`,
deployed by `.github/workflows/deploy.yml`; see `docs/ecs-fargate-run-checklist.md`.

## Quick start

From the **repo root**:

```bash
cp .env.example .env                                   # once
docker compose -f compose.yaml -f compose.dev.yaml up --build --watch
```

- API: http://localhost:3002 (`ORDER_SERVICE_PORT`)
- Health: http://localhost:3002/health → `{"status":"ok","database":"up"}`
- DB from host: `localhost:5433` (`ORDER_DB_PORT`)

Edits under `src/` are synced into the container and `tsx watch` restarts the server.
Changing `package.json` rebuilds the image. Changing `prisma/` restarts the container,
which re-runs `prisma generate` and `prisma migrate deploy`.

Production-like image (compiled JS, non-root): `docker compose up --build order-service`

## Running on the host instead of in Docker

```bash
docker compose up -d order-db           # just the database (from repo root)
cd order-service
cp .env.example .env
npm ci
npm run db:generate
npm run dev
```

## Database workflow (Prisma)

1. Edit `prisma/schema.prisma`.
2. From `order-service/` with `.env` set and `order-db` running:
   `npm run db:migrate -- --name <what_changed>`
   This creates a SQL migration under `prisma/migrations/`, applies it, and regenerates the client.
3. **Commit the migration folder.** Containers apply committed migrations on start (`migrate deploy`).

| Script        | What it does                                                            |
| ------------- | ----------------------------------------------------------------------- |
| `db:generate` | Regenerate the typed client into `src/generated/prisma` (git-ignored)   |
| `db:migrate`  | `prisma migrate dev`: create + apply a migration (dev only)             |
| `db:deploy`   | `prisma migrate deploy`: apply pending migrations (what containers run) |
| `db:reset`    | Drop, recreate, re-apply all migrations (destroys data)                 |
| `db:studio`   | Prisma Studio GUI                                                       |

## Other scripts

| Script                             |                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `dev`                              | `tsx watch src/server.ts`: run TS directly with restart on change             |
| `build` / `start`                  | `tsc` to `dist/`, run compiled output                                         |
| `typecheck`                        | `tsc --noEmit` (tsx does **not** type-check; run this or rely on your editor) |
| `test` / `test:watch` / `test:cov` | Unit tests (Vitest, `src/**/*.spec.ts`)                                       |
| `test:e2e`                         | E2E tests (`test/*.e2e-spec.ts`), **need a running DB**                       |
| `lint` / `format`                  | oxlint (type-aware) / Prettier                                                |

## Layout

```text
order-service/
├── prisma/
│   ├── schema.prisma          # models go here
│   └── migrations/            # created by db:migrate (commit these)
├── prisma.config.ts           # Prisma 7 config (datasource URL from env)
├── src/
│   ├── server.ts              # API entrypoint: HTTP server, Express + Socket.IO, shutdown
│   ├── worker.ts              # worker entrypoint: sweep, relay, job worker, series, dashboard
│   ├── app.ts                 # createApp({ prisma, ... }): middleware + routers (no listen)
│   ├── config/env.ts          # zod-validated env: every var the service reads
│   ├── constants/errors.ts    # error codes and messages
│   ├── routes/                # router factories: health, orders, series
│   ├── controllers/           # HTTP handlers: parse, call services, map results to status codes
│   ├── services/              # orders, order-listing, series business logic
│   ├── domain/                # pure rules: status transitions, access, series RRULE
│   ├── clients/               # HTTP clients: user, supplier, credit, chat
│   ├── db/                    # Prisma client, outbox and dead-letter repositories
│   ├── queue/                 # task names → queues, BullMQ helpers
│   ├── realtime/              # Socket.IO server, event building, Redis relay
│   ├── worker/                # credit/chat jobs, outbox relay, re-drive, series, dashboard
│   ├── middleware/            # JWT authenticate, 404 + error handler
│   └── generated/             # Prisma client (generated, git-ignored)
└── test/                      # e2e specs (need a database)
```

## Conventions / gotchas

- **ESM.** Relative imports need the `.js` extension (`import { x } from './x.js'`).
  `verbatimModuleSyntax` is on, so type-only imports must use `import type`.
- **Dependency injection by factory.** Routers take their deps as arguments
  (`healthRouter(prisma)`), and `createApp` wires them. Tests pass fakes. See `src/app.spec.ts`.
- **Async errors.** Express 5 forwards rejected promises from async handlers to the
  error handler, so no `asyncHandler` wrapper is needed.
- New env var → `src/config/env.ts`, `order-service/.env.example`, root `.env.example`,
  and the `order-service` block in `../compose.yaml`.
- Node: Docker uses Node 24 LTS; Node ≥ 22 works on the host.

<!-- AI-generated -->

## Admin user order history

`GET /orders/admin/users/:userId?page=1`

Requires the admin's bearer token. Only `admin` and `super admin` roles may access it.
`userId` must be a UUID. The endpoint forwards the bearer token to User Service's
`GET /users/:id` to check existence before querying orders.

The optional `page` query parameter defaults to 1 and must be a positive integer.
Page size is 10, configured by `ADMIN_USER_ORDERS_PAGE_SIZE` in
`src/services/order-listing.service.ts`. Search, filters and configurable sorting
are not supported; unknown query parameters return 400.

```json
{
  "totalCount": 23,
  "currentPage": 1,
  "pageSize": 10,
  "totalPages": 3,
  "orders": [
    {
      "order": { "id": "…", "requesterId": "…", "courierId": "…" },
      "role": "requester"
    }
  ]
}
```

The example abbreviates `order`: every persisted order field is returned, including
status and timestamps. Each entry's `role` is `requester` or `courier` relative to
`:userId`. Orders include every status and are sorted by `createdAt` descending,
then ID ascending for equal timestamps. There is no persisted completion timestamp.
No credit-service transactions are fetched by this endpoint.

`totalCount` counts all matching orders, not just the page. An existing user with
no orders receives `orders: []`, `totalCount: 0` and `totalPages: 0`. A page beyond
the last page returns an empty array with the actual count and requested page.

Errors use the existing `{ "message": "..." }` envelope:

| HTTP | Internal ErrorCode         | Condition                                                                               |
| ---- | -------------------------- | --------------------------------------------------------------------------------------- |
| 400  | `MALFORMED_USER_ID`        | User ID is not a UUID                                                                   |
| 400  | `INVALID_QUERY_PARAMETER`  | Invalid page                                                                            |
| 400  | `UNKNOWN_QUERY_PARAMETER`  | Unsupported query parameter                                                             |
| 401  | `UNAUTHENTICATED`          | Missing/invalid authentication, including User Service rejection                        |
| 403  | `FORBIDDEN`                | Actor is not admin/super admin, or User Service rejects access                          |
| 404  | `INVALID_USER_ID`          | User Service reports that the user does not exist                                       |
| 503  | `USER_SERVICE_UNAVAILABLE` | User lookup connection failure or unsuccessful upstream response other than 401/403/404 |

The enum names above are internal; response bodies contain the message, following
existing order-controller conventions.

<!-- AI-generated -->

## Chat delivery after reservation

After successful credit reservation, the `pending` to `open` transaction writes
one `chat_create` task into the existing outbox. Its payload contains `orderId`,
`requesterId`, `orderDescription` and a UUID `messageId` generated once and retained
across delivery retries. The existing order-side BullMQ worker consumes it from
`queue:order:credit`, first calling `POST /chat/conversations`, then
`POST /chat/send-system-notification` with the exact text
`The order has been created`.

The existing five-attempt retry settings apply (1, 2, 4 and 8 second delays).
Network errors and HTTP 5xx are retryable; other unsuccessful HTTP responses are
permanent failures. Final failures enter the existing dead-letter handling. Chat
failures do not change the order status or release its credits. Identical chat
creation and notification retries return success without duplicate records.

The worker requires `CHAT_SERVICE_API_KEY` matching Chat Service's key.
`CHAT_SERVICE_URL` defaults to `http://localhost:3005` for host execution; Compose
sets `http://chat-service:3000`. Set these in the deployed worker environment too.

<!-- AI-generated -->

## Status change notifications

The team specified these messages in the 2026-11-08 implementation conversation:

| Transition                          | System message                                  |
| ----------------------------------- | ----------------------------------------------- |
| Any allowed transition to cancelled | The order has been cancelled                    |
| open → expired                      | The order has expired                           |
| open → accepted                     | The order has been accepted by &lt;username&gt; |
| accepted → picked_up                | The order has been picked up                    |
| picked_up → delivered               | The order has been delivered                    |
| delivered → completed               | The order has been marked as completed          |

Each successful transition writes a `chat_notification` outbox task in the same
transaction as the status change, alongside any existing credit tasks. Its payload
is `{ orderId, messageId, message }`. A UUID `messageId` is generated once and
retained through BullMQ retries. The existing order-side queue, retry settings,
failure classification and dead-letter handling apply. Automatic expiry and
completion use the same transition path. Existing allowed transitions are unchanged.

For acceptance, order-service forwards the courier's Authorization header to
`GET /users/me` using `USER_SERVICE_URL`, and uses the returned `username`.
An unsuccessful lookup, network error, malformed response or missing username
uses `The order has been accepted`. Only the final text is queued; the bearer
token is not stored in the outbox. Delivery uses the existing
`POST /chat/send-system-notification` endpoint.

## Courier chat participation on acceptance

Team decisions supplied on 2026-11-08: accepting an order adds its courier as a
chat participant through `POST /chat/orders/:orderId/participants`, with body
`{ "userId": "<accepting courier UUID>", "role": "COURIER" }` and existing service-key
authentication. The acceptance transaction writes a `chat_participant` outbox task
before its existing notification task. The order remains accepted if delivery fails.
The worker uses the existing order-side queue, five attempts and exponential
backoff for network/5xx failures. A 409 is permanent and stops retries; existing
permanent-error/dead-letter handling applies to other 4xx responses too.

This affects new acceptances; existing accepted orders are not backfilled.
Verification: 691 tests passed; typecheck, build and lint passed. A local Postman
HTTP simulation returned 503 then 409 to the compiled client/worker: the first
error was retryable, the second was final, and neither accessed order or credit
state. No real Redis retry scheduling or live cross-service persistence was tested.

## Chat archiving on completion and cancellation

Team decision supplied in chat (2026-11-10): send the final status message first,
then archive the conversation using `POST /chat/orders/:id/archive`, with no body
and the existing service key. Completed orders (including automatic completion)
and cancelled orders set `archiveAfter: true` in their existing `chat_notification`
outbox payload. The client sends the notification before calling archive.
Transient failures use the existing worker retry policy; retries reuse the message
ID, which chat-service deduplicates even after archiving. Other status
notifications do not archive chats. No database schema change is required.
