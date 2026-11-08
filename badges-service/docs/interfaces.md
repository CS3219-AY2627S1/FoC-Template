# Interfaces

The service listens on `BADGES_SERVICE_PORT` (or `PORT`), default 8086. Badge routes sit under `/api/v1/badges`. Health is at `/health` and `/health/db`.

## Caller

The gateway is the identity source. It sets `x-user-id` after User Service's authorize call. There is no JWT check in this service.

| Header | Required | Rule |
| --- | --- | --- |
| x-user-id | for badge routes | Must equal the `{userId}` in the path, ignoring case. Missing or different returns 404 `Endpoint not found` |
| x-is-admin | no | Accepted and ignored. An admin cannot read someone else's badges |

The mesh lets only the gateway call Badges (`deploy/values/services/badges.yaml`). The gateway forwards `/api/v1/badges` and blocks `/api/v1/badges/internal`. Badges makes no outbound HTTP calls.

Errors use `{ "error": "...", "code": "..." }`.

| Status | code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `{userId}` is not a UUID |
| 404 | `NOT_FOUND` | Not the owner, or an unknown route. Same body as the gateway's 404 |
| 500 | `INTERNAL_ERROR` | Unexpected failure. Details only in the log |

## REST

| Method | Path | Who | Effect |
| --- | --- | --- | --- |
| GET | `/api/v1/badges/{userId}` | the owner | Every catalog badge for that user, earned or not |
| GET | `/health` | probes | `{ "service": "badges-service", "status": "ok" }` |
| GET | `/health/db` | probes | Runs `select 1`. 200 `{ "status": "ok", "db": "up" }`, or 503 `{ "status": "error", "db": "down" }` |

### GET /api/v1/badges/{userId}

| Field | Type | Notes |
| --- | --- | --- |
| userId | UUID | |
| metricsAsOf | ISO time or null | When the user's metrics last changed. Null when Badges has never seen an event for them |
| earnedCount | integer | Badges currently held |
| totalCount | integer | Badges in the catalog |
| badges | array | Catalog order (`displayOrder`) |

Each badge:

| Field | Type | Notes |
| --- | --- | --- |
| badgeId | string | Stable id, e.g. `first_delivery` |
| title, description | string | From the catalog |
| targetRole | `courier` \| `requester` \| `any` | Which side of an order earns it |
| displayOrder | integer | |
| iconUrl | string | The earned icon when held, otherwise the locked icon |
| earned | boolean | `user_badge.state` is `earned` |
| earnedAt | ISO time or null | Latest earn time. Null when not held, including after a revocation |
| criteria | array of `{ metric, op, value }` | What unlocks it. `op` is `gte` or `lte`; all must hold |
| progress | `{ current, target }` or null | For unearned badges: the progress metric, capped at the target. Null when earned |

A user with no events gets every badge unearned with `current` 0. An unrated user's average counts as 0.

## Catalog

`src/catalog/badges.json`, upserted into `badge_catalog` at startup. A badge on an existing metric needs only a catalog entry. A badge on a new metric also needs it in `MetricName` (`src/types.ts`), in `readMetric` (`src/rules/evaluator.ts`), and as a `user_metrics` column with a handler that keeps it current. Removing an entry from the file does not delete its row.

| badgeId | Title | Role | Conditions |
| --- | --- | --- | --- |
| first_delivery | First run | courier | completedDeliveries ≥ 1 |
| ten_deliveries | Double digits | courier | completedDeliveries ≥ 10 |
| century_courier | Marathon runner | courier | completedDeliveries ≥ 100 |
| first_order | First request | requester | completedOrders ≥ 1 |
| twenty_orders | Regular | requester | completedOrders ≥ 20 |
| hundred_orders | Veteran | requester | completedOrders ≥ 100 |
| trusted_user | Well rated | any | averageRating ≥ 4.5 and ratingCount ≥ 10 |

`completedDeliveries` and `completedOrders` come from order and admin events; `averageRating` and `ratingCount` from rating events.

## Kafka

One consumer group, `badges-service` (`KAFKA_GROUP_ID`), reading three topics from the earliest retained offset. The badges KafkaUser may read only these topics, `foc.badges.dlq`, and groups prefixed `badges`, and may write only `foc.badges.dlq` (`deploy/charts/foc-kafka/values.yaml`, ADR-0004). Deployed clusters use TLS and SCRAM-SHA-512; with no `KAFKA_USERNAME` the client connects in plaintext, for a local broker. Badges publishes nothing but dead letters (below).

Every consumed payload uses the flat catalog format: `eventId`, `eventType`, `schemaVersion` (1), `occurredAt`, then the fields below. Extra fields are allowed and ignored, so publishers can add fields without breaking Badges. Any other `eventType` on these topics is ignored.

| Topic | eventType | Publisher | Fields used | Effect |
| --- | --- | --- | --- | --- |
| foc.order.status | order.status.changed | Order | `orderId`, `requesterId`, `courierId` (null before accept), `fromStatus`, `toStatus` | Counted status: count once per role. `ESCALATED`: uncount until the verdict |
| foc.admin.events | admin.case.resolved | Admin | `orderId`, `caseId`, `faultParty` (`requester` \| `courier` \| `no-fault`) | Count the disputed order for whoever was not at fault. First verdict kept |
| foc.user.rating | user.rating.updated | Rating | `userId`, `newAverage` (0–5 or null), `totalRatings` (≥ 0) | Store the average and count if `totalRatings` is higher than stored |

Deduplication does not use `eventId`. It comes from the data: the `counted_order` key for order events, the first stored verdict for admin events, and the rating count for rating events.

A message is handled at most 4 times (`KAFKA_MAX_ATTEMPTS`), waiting 200 ms × attempt between tries, then logged, sent to `foc.badges.dlq`, and skipped. A dead letter's value is the original message; its headers say where it came from:

| Header | Value |
| --- | --- |
| x-original-topic | Topic it was consumed from |
| x-original-partition | Partition, as a number |
| x-original-offset | Offset, as the client reports it |
| x-reason | `failed` (every attempt threw) or `invalid` (doesn't match the contract) |
| x-error | Last error message; absent for `invalid` |

The key is `<original topic>:<partition>`, so dead letters from one partition stay in order. The topic keeps them 30 days (`retention.ms` in `deploy/charts/foc-kafka/values.yaml`). If the send fails, the consumer throws instead of skipping, so the message is redelivered rather than lost. `npm run replay:dlq` reads the topic with the consumer group `badges-service-dlq-replay` and runs each dead letter through its handler again, re-queueing the ones that still fail.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| BADGES_SERVICE_PORT / PORT | 8086 | |
| DATABASE_URL | `postgres://badges:badges@localhost:5434/badges_db` | TLS required unless the host is local; `DB_SSL=false` opts out |
| DB_POOL_MAX | 10 | |
| LOG_LEVEL | info | |
| BADGES_BATCH_SIZE | 1000 | Users per batch in the catalog re-check. Capped at 1,000 |
| KAFKA_BROKERS | empty | Comma-separated. Empty disables Kafka |
| KAFKA_USERNAME, KAFKA_PASSWORD, KAFKA_CA_CERT | empty | Injected by the deploy chart |
| KAFKA_GROUP_ID | badges-service | |
| KAFKA_MAX_ATTEMPTS | 4 | |
| KAFKA_DLQ_GROUP_ID | badges-service-dlq-replay | Consumer group of `npm run replay:dlq` |
| DLQ_IDLE_MS | 10000 | `npm run replay:dlq` stops after this long with no new dead letter |
