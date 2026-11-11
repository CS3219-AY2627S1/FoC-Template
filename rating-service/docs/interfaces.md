# Interfaces

The service listens on `RATING_SERVICE_PORT` (or `PORT`), default 8085. Rating routes sit under `/api/v1/rating`. Health is at `/health` and `/health/db`.

## Caller

The gateway is the identity source. Every `/api/v1/rating` route is a protected route: the gateway checks the session with User Service's authorize endpoint and sets `x-user-id`. There is no JWT check in this service.

| Header | Required | Rule |
| --- | --- | --- |
| x-user-id | for `/me/pending`, `/orders/{orderId}` and `/orders/{orderId}/skip` | UUID. Missing or not a UUID returns 400 `VALIDATION_ERROR` |

The mesh lets the gateway and Order call Rating (`deploy/values/services/rating.yaml`). Order calls `GET /{userId}` directly, without the gateway. Rating makes no outbound HTTP calls.

Errors use `{ "error": "...", "code": "..." }`.

| Status | code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Bad header, path id, score, comment, or extra body field |
| 403 | `RATING_NOT_PERMITTED` | The caller has no grant for this order |
| 404 | `NOT_FOUND` | Unknown route. Same body as the gateway's 404 |
| 409 | `RATING_ALREADY_SUBMITTED` | The caller already rated this order |
| 500 | `INTERNAL_ERROR` | Unexpected failure. Details only in the log |

## REST

| Method | Path | Who | Effect |
| --- | --- | --- | --- |
| GET | `/api/v1/rating/{userId}` | any signed-in user, and Order | `{ userId, average, count }`. `average` is null when `count` is 0 |
| GET | `/api/v1/rating/me/pending` | the caller | `{ pending: [{ orderId, rateeId, rateeRole, grantedAt }] }`, grants not yet used or skipped, oldest first |
| POST | `/api/v1/rating/orders/{orderId}` | a rater with a grant | Body `{ score, comment? }`. Returns 201 with the stored rating |
| POST | `/api/v1/rating/orders/{orderId}/skip` | a rater with a grant | No body. "Skip" in the rating modal: hides the grant from `/me/pending` on every device. Returns 204; skipping again is a no-op. The grant stays valid, so the order can still be rated later. 403 without a grant, 409 if already rated |
| GET | `/health` | probes | `{ "service": "rating-service", "status": "ok" }` |
| GET | `/health/db` | probes | Runs `select 1`. 200 `{ "status": "ok", "db": "up" }`, or 503 `{ "status": "error", "db": "down" }` |

### POST /api/v1/rating/orders/{orderId}

Request:

| Field | Type | Rule |
| --- | --- | --- |
| score | integer | 1 to 5 |
| comment | string | Optional, at most 500 characters. Trimmed; blank is stored as null |

No other fields are allowed.

Response (201):

| Field | Type | Notes |
| --- | --- | --- |
| orderId | UUID | |
| rateeId | UUID | From the grant |
| rateeRole | `COURIER` \| `REQUESTER` | From the grant |
| score | integer | |
| comment | string or null | |
| createdAt | ISO time | |

### GET /api/v1/rating/{userId}

| Field | Type | Notes |
| --- | --- | --- |
| userId | UUID | |
| average | number or null | Sum ÷ count over every rating received in either role, rounded to 2 decimal places |
| count | integer | Ratings received |

## Kafka

Deployed clusters use TLS and SCRAM-SHA-512; with no `KAFKA_USERNAME` the client connects in plaintext, for a local broker. The rating KafkaUser may read `foc.rating.commands`, `foc.user.status` and `foc.rating.dlq`, write `foc.user.rating` and `foc.rating.dlq`, and use consumer groups prefixed `rating` (`deploy/charts/foc-kafka/values.yaml`, ADR-0004).

Payloads use the flat catalog format: `eventId`, `eventType`, `schemaVersion` (1), `occurredAt`, then the fields below, except User's `foc.user.status` events, which use User Service's own envelope: `eventId`, `type`, `occurredAt`, and the fields under `data`.

| Direction | Topic | eventType | Key | Fields |
| --- | --- | --- | --- | --- |
| Consumed | foc.rating.commands | rating.permission.granted | order id | `orderId`, `raterId`, `raterRole`, `rateeId`, `rateeRole`. Roles are `COURIER` or `REQUESTER`. Extra fields are allowed and ignored |
| Consumed | foc.user.status | UserDeleted (`type`) | user id | `data.userId`. Removes what the user received and their grants, and anonymises the ratings they gave. Other `type`s ignored |
| Published | foc.user.rating | user.rating.updated | ratee's user id | `userId`, `newAverage`, `totalRatings`. The whole current average and count, not a change |

The consumer group is `rating-service` (`KAFKA_GROUP_ID`) and reads both topics from the earliest retained offset. Other event types are ignored. A message is handled at most 4 times (`KAFKA_MAX_ATTEMPTS`), waiting 200 ms × attempt between tries, then logged, sent to `foc.rating.dlq`, and skipped. A dead letter's value is the original message; its headers say where it came from:

| Header | Value |
| --- | --- |
| x-original-topic | Topic it was consumed from |
| x-original-partition | Partition, as a number |
| x-original-offset | Offset, as the client reports it |
| x-reason | `failed` (every attempt threw) or `invalid` (doesn't match the contract) |
| x-error | Last error message; absent for `invalid` |
| x-replay-count | Replays that have failed so far; `0` when first skipped |
| x-first-failed-at | When the consumer first skipped it (ISO 8601); kept across re-queues |

The key is `<original topic>:<partition>`, so dead letters from one partition stay in order. The topic keeps them 30 days (`retention.ms` in `deploy/charts/foc-kafka/values.yaml`). If the send fails, the consumer throws instead of skipping, so the message is redelivered rather than lost. `npm run replay:dlq` reads the topic with the consumer group `rating-service-dlq-replay` and runs each dead letter through its handler again, re-queueing the ones that still fail. A dead letter that fails its 5th replay (`DLQ_MAX_REPLAYS`), or is 30 days past `x-first-failed-at`, is expired instead: logged in full to the replay's error output and not re-queued. One with unreadable headers or a topic Rating doesn't handle is dropped and logged the same way.

`user.rating.updated` is delivered at least once. Consumers should deduplicate on `eventId`, or, as Badges does, ignore a message whose `totalRatings` is not higher than the count they hold. Keying by user id keeps one user's updates in order on one partition.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| RATING_SERVICE_PORT / PORT | 8085 | |
| DATABASE_URL | `postgres://rating:rating@localhost:5433/rating_db` | TLS required unless the host is local; `DB_SSL=false` opts out |
| DB_POOL_MAX | 10 | |
| LOG_LEVEL | info | |
| KAFKA_BROKERS | empty | Comma-separated. Empty disables Kafka |
| KAFKA_USERNAME, KAFKA_PASSWORD, KAFKA_CA_CERT | empty | Injected by the deploy chart |
| KAFKA_GROUP_ID | rating-service | |
| KAFKA_MAX_ATTEMPTS | 4 | |
| KAFKA_DLQ_GROUP_ID | rating-service-dlq-replay | Consumer group of `npm run replay:dlq` |
| DLQ_IDLE_MS | 10000 | `npm run replay:dlq` stops after this long with no new dead letter |
| DLQ_MAX_REPLAYS | 5 | Failed replays before a dead letter is expired and logged instead of re-queued |
| OUTBOX_POLL_MS | 1000 | Wait between relay passes once the outbox is empty |
| OUTBOX_RETENTION_HOURS | 168 | Sent outbox rows older than this are deleted. 7 days, Kafka's default retention |
| OUTBOX_PURGE_MS | 3600000 | How often the purge runs (hourly) |
