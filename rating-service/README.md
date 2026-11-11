# Rating Service

Stores the ratings couriers and requesters give each other after an order, and
keeps one average per user. Order Service decides who may rate whom; this
service only accepts a rating it has been told to expect.

Sequence diagrams are in [docs/README.md](docs/README.md), routes and message
fields in [docs/interfaces.md](docs/interfaces.md), and tables in
[docs/schema.md](docs/schema.md).

## How a rating happens

1. Order Service publishes `rating.permission.granted` on `foc.rating.commands`
   when an order is delivered (the courier may rate the requester) and when it
   is acknowledged or unacknowledged (the requester may rate the courier). When
   Admin resolves a dispute, the requester may rate the courier, and the
   courier may rate the requester if the courier was paid (`requester` at
   fault or `no-fault`).
2. This service stores that as a grant (`rating_grant`). A redelivered message
   is a no-op.
3. The rating modal in the frontend calls `GET /api/v1/rating/me/pending`, then
   `POST /api/v1/rating/orders/{orderId}` with a score of 1 to 5.
4. In one transaction the service stores the rating, adds it to the user's
   running total, and writes `user.rating.updated` to an outbox. A relay
   publishes outbox rows to `foc.user.rating` after the transaction commits.

## Endpoints

All under `/api/v1/rating`. The caller's identity is the `x-user-id` header the
gateway sets after User Service's authorize call.

- `GET /{userId}`: returns `{ userId, average, count }`. `average` is the
  unified average over every rating the user has received, in either role,
  rounded to 2 decimal places. It is `null` when `count` is 0.
- `GET /me/pending`: returns `{ pending: [{ orderId, rateeId, rateeRole, grantedAt }] }`,
  the caller's grants that have not been used or skipped yet.
- `POST /orders/{orderId}`: body `{ score, comment? }`. `score` is an integer
  from 1 to 5; `comment` is optional, at most 500 characters. Returns 201 with
  the stored rating.
  - 403 `RATING_NOT_PERMITTED`: the caller has no grant for this order.
  - 409 `RATING_ALREADY_SUBMITTED`: the caller already rated this order.
  - 400 `VALIDATION_ERROR`: bad score, comment, ids, or missing header.
- `POST /orders/{orderId}/skip`: no body. "Skip" in the rating modal (UI
  FR14.1.3): hides the grant from `/me/pending` on every device. Returns 204;
  skipping again is a no-op. The grant stays valid, so the order can still be
  rated later.
  - 403 `RATING_NOT_PERMITTED`: the caller has no grant for this order.
  - 409 `RATING_ALREADY_SUBMITTED`: the caller already rated this order.
- `GET /health`, `GET /health/db`.

Errors use the team's shape: `{ error, code }`, where `error` is a readable
message. Unknown routes return 404 `NOT_FOUND`; unexpected failures return 500
`INTERNAL_ERROR` with details only in the log.

## Messages

Flat catalog format: `{ eventId, eventType, schemaVersion, occurredAt, ...fields }`.

- Consumes `rating.permission.granted` from `foc.rating.commands`:
  `orderId, raterId, raterRole, rateeId, rateeRole`. Roles are `COURIER` or
  `REQUESTER`. Other event types are ignored.
- Consumes `UserDeleted` from `foc.user.status` (User's own envelope: `type`
  and `data.userId`), once an account's deletion period ends (User F5). In one
  transaction it removes the user's grants (as rater or ratee), the ratings they
  received and their total, and sets `rater_id` to null on the ratings they
  gave, so other users' averages don't change. The user is recorded in
  `deleted_user`, so a late or replayed grant involving them is ignored. Other
  `type`s, such as `UserVerified`, are ignored. Nothing is published: Badges
  removes the user on the same event.
- A consumed message that fails 4 times in a row (for example, the database is
  down), or doesn't match the contract, is logged, sent to the dead-letter topic
  `foc.rating.dlq`, and skipped (NFR3.1.1). The dead letter is the original
  message, with its original topic, partition, offset, reason, error, replay
  count and first failure time in headers; the topic keeps it 30 days. If Kafka
  refuses the dead letter, the consumer retries the message instead of losing
  it. Replay them once the cause is fixed:

  ```bash
  kubectl -n <namespace> exec deploy/rating -- npm run replay:dlq
  ```

  It reads the topic with the consumer group `rating-service-dlq-replay` from
  where the last replay stopped and prints `{ replayed, requeued, expired,
  dropped }`. Grants are idempotent, so replaying one that got through after all
  changes nothing. A message that still fails is re-queued, counting the replay;
  after 5 failed replays (`DLQ_MAX_REPLAYS`) or 30 days it is expired instead,
  and one with unreadable headers or an unknown topic is dropped. Both are
  written to the replay's error output in full, so they can be applied by hand.
- Publishes `user.rating.updated` to `foc.user.rating`, keyed by user id:
  `userId, newAverage, totalRatings`. Delivery is at least once; deduplicate on
  `eventId`.

## Data

- `rating_grant`: one row per (order, rater), from Order's message.
  `skipped_at` is set when the rater skips it.
- `rating`: every submitted rating, unique per (order, rater). `rater_id` is
  null once the rater has deleted their account.
- `deleted_user`: users whose account was deleted; their later grants are ignored.
- `user_rating`: running `rating_sum` and `rating_count` per user, updated with
  one atomic upsert so concurrent ratings never lose an update.
- `outbox`: messages waiting to be published. Rows sent more than
  `OUTBOX_RETENTION_HOURS` ago are deleted every `OUTBOX_PURGE_MS`, so the
  table doesn't grow forever; unsent rows are never deleted.

## Stack and layout

Fastify, TypeBox, Drizzle ORM on PostgreSQL, `@confluentinc/kafka-javascript`
(KafkaJS-style API), Vitest. Same layout as credit-service:

```
src/
  server.ts               boot, Kafka start, graceful shutdown
  app.ts                  Fastify instance + routes
  config.ts               environment settings
  database/               Drizzle schema and client
  routes/                 HTTP endpoints
  schemas/                TypeBox request/response schemas
  services/               rating logic (transactions)
  messaging/              grant and UserDeleted handlers, outbox relay, retries,
                          dead letters, Kafka wiring
  scripts/                replay-dlq.ts (npm run replay:dlq)
drizzle/                  generated SQL migrations
```

## Running locally

```bash
docker compose up --build        # Postgres (host port 5433) + app on :8085
```

Or run Postgres in Docker and the app on the host:

```bash
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

Without `KAFKA_BROKERS` the app serves HTTP only: no grants arrive and outbox
rows wait. To try the flow without Kafka, insert a `rating_grant` row by hand.

## Tests

```bash
docker compose up -d postgres    # tests create and migrate rating_test on it
npm test
npm run test:coverage            # 90% floor on lines, branches, functions, statements
```

## Configuration

- `PORT` / `RATING_SERVICE_PORT`: default 8085.
- `DATABASE_URL`: default `postgres://rating:rating@localhost:5433/rating_db`.
- `DB_SSL`, `DB_POOL_MAX`, `LOG_LEVEL`: as in credit-service.
- `KAFKA_BROKERS`: comma-separated. Empty disables Kafka.
- `KAFKA_USERNAME`, `KAFKA_PASSWORD`, `KAFKA_CA_CERT`: injected by the deploy
  chart (TLS + SCRAM-SHA-512, ADR-0004). With no username the client connects in
  plaintext, for a local broker.
- `KAFKA_GROUP_ID`: default `rating-service`.
- `KAFKA_MAX_ATTEMPTS`: default 4. `OUTBOX_POLL_MS`: default 1000.
- `KAFKA_DLQ_GROUP_ID`: default `rating-service-dlq-replay`. `DLQ_IDLE_MS`:
  default 10000, how long `npm run replay:dlq` waits for more before stopping.
  `DLQ_MAX_REPLAYS`: default 5.
- `OUTBOX_RETENTION_HOURS`: default 168 (7 days, Kafka's default retention).
  `OUTBOX_PURGE_MS`: default 3600000 (hourly).

## Schema changes

Edit `src/database/schema.ts`, then `npm run db:generate` and commit the new
file under `drizzle/`.
