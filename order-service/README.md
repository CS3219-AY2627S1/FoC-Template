# Order Service

Errand requests for Friend on Campus: create an order, hold it until credit is reserved, then run it through accept, pickup, completion, cancellation, and one-hour expiry.

The API never talks to Kafka. Each state change and its event are committed together. `order-worker` publishes those events, applies credit messages, and expires orders that are past due. A broker outage cannot fail an API call, and a committed event is not lost. Publishing is at least once: the same `event_id` can be delivered again, and a consumer should ignore an `event_id` it has already applied.

## Run with Compose

`docker compose up` requires two values in `.env`. Copy them from `.env.example` if they are missing:

- `ORDER_DB_USER`
- `ORDER_DB_PASSWORD`

The password is not put in the database URL. Postgres reads `PGPASSWORD`. Kafka is reached at `kafka:9092` with no credentials.

```bash
docker compose up --build order-db order-migrate order-service order-worker kafka kafka-topics
curl -sS http://127.0.0.1:8082/ready
```

The worker log line `worker_started` means it is publishing and consuming. Topics are created by `kafka-topics` before the worker starts. See `event-broker/README.md` for the commands that read a topic. A credit message that still fails after retries is copied to `order-service.credit-events.dlq`.

Worker lifecycle, heartbeat, retry, relay, DLQ, and readiness alert guidance is in [`docs/observability.md`](../docs/observability.md).

Creating an order through this stack still needs Supplier Service's `GET /suppliers/{id}` and a Credit Service. Neither is available from `main` yet, so this smoke check stops at readiness, the worker log, and the topics.

## API

Every route except `/health` and `/ready` requires `Authorization: Bearer <session>`. The token is forwarded to User Service `GET /users/me`. A 401 from User Service stays a 401. A timeout or any other failure is a 503.

| Method | Path | Who | Result |
| --- | --- | --- | --- |
| `POST` | `/orders` | requester | `201`, or `200` when the same `Idempotency-Key` and body are retried |
| `GET` | `/orders/open?limit&offset` | any active user | open errands except the caller's, newest first |
| `GET` | `/orders?role=requester\|courier&status&limit&offset` | caller | that caller's own orders; `status` is optional and repeatable, as on `/admin/orders` |
| `GET` | `/orders/{id}` | requester, assigned courier, or admin | one order; anyone else gets `404` |
| `PATCH` | `/orders/{id}/delivery` | requester, before pickup | replaces the destination |
| `POST` | `/orders/{id}/accept` | anyone except the requester | first committed accept wins; the others get `409` |
| `POST` | `/orders/{id}/pickup` | assigned courier | |
| `POST` | `/orders/{id}/complete` | requester | does not touch credit balances |
| `POST` | `/orders/{id}/cancel` | requester before pickup, or an admin until the order is closed | |
| `GET` | `/admin/orders?status&limit&offset` | admin | every order, newest first; see [Admin routes](#admin-routes) |
| `GET` | `/admin/orders/activity?hours` | admin | hourly creation, acceptance, and completion counts |

`POST /orders` requires `Idempotency-Key` (max 128 characters). `X-Correlation-ID` is optional and must be a UUID. Pages are `{items, total, limit, offset}`. Errors are `{"detail": ...}`. A database outage is `503`.

Repeating an action that the same person already completed returns `200` and does not write another event. An illegal transition returns `409`, leaves the row unchanged, and logs `illegal_order_transition`.

Pickup must be an active supplier (`GET {SUPPLIER_SERVICE_URL}/suppliers/{id}`). `404` with code `SUPPLIER_NOT_FOUND` is `422`. Any other response, including a `404` from an unmounted route, is `503`. Delivery coordinates must fall inside latitude 1.288–1.310 and longitude 103.750–103.788, which covers the seeded stores and University Town.

### Admin routes

Both routes return `403 {"detail": "Administrator access required"}` unless User Service reports the caller as an active `admin`. The role is read from User Service on every request, so revoking admin rights or suspending the account takes effect at once.

`GET /admin/orders` lists every order in any status, newest first, as a normal page. `status` is optional and can be repeated to match any of several statuses, e.g. `?status=PENDING_CREDIT&status=OPEN&status=ACCEPTED&status=PICKED_UP` for orders that are still active. An unknown status, `limit` outside 1–100, or a negative `offset` is `422`.

`GET /admin/orders/activity` counts lifecycle events in rolling one-hour buckets that end at the time of the request. `hours` is 1–168 and defaults to `24`. Buckets are oldest first, so the last one is exactly the past hour:

```json
{"window_start": "2026-11-09T09:00:00Z", "window_end": "2026-11-10T09:00:00Z",
 "bucket_minutes": 60,
 "buckets": [{"start": "2026-11-09T09:00:00Z", "end": "2026-11-09T10:00:00Z",
              "created": 3, "accepted": 2, "completed": 1}]}
```

`created`, `accepted`, and `completed` count orders whose `created_at`, `accepted_at`, or `completed_at` falls in the bucket, whatever the order's status is now. An order accepted and later cancelled still counts as accepted.

## States

`PENDING_CREDIT` → `OPEN` when Credit publishes `credit.reserved`, or → `REJECTED` when it publishes `credit.reservation_failed`. `OPEN` → `ACCEPTED` → `PICKED_UP` → `COMPLETED`. The requester can cancel before pickup. An admin can cancel until the order is closed, including after pickup. A worker sweep expires `PENDING_CREDIT` and `OPEN` one hour after creation. `COMPLETED`, `CANCELLED`, `EXPIRED`, and `REJECTED` do not change again.

## Event contract (v1)

Order events are Kafka records on `order.events`. The record key is `order_id`. Headers are `event_type` and `event_id`. The value is JSON:

```json
{"event_id": "uuid", "event_type": "order.accepted", "schema_version": 1,
 "occurred_at": "2026-10-05T07:12:03.000000Z", "correlation_id": "uuid",
 "payload": {"order_id": "uuid", "requester_id": "uuid", "courier_id": "uuid",
  "credit_amount": 8, "pickup_supplier_id": "uuid", "delivery_label": "COM1 Level 2",
  "created_at": "2026-10-05T06:12:03.000000Z"}}
```

Published events, in the life of an order: `order.created` (adds `expires_at`), `order.opened`, `order.rejected` (adds `reason`), `order.accepted`, `order.picked_up`, `order.completed`, `order.cancelled` (adds `cancelled_by` and `previous_status`), `order.expired`. Every payload carries the ids above, the credit amount, the store id, the drop-off label, and `created_at`. Names and contact details stay out. `order.cancelled` with `previous_status` of `PICKED_UP` is the signal for Credit to compensate the courier.

Consumed events, which Credit Service must publish to `credit.events` with the same JSON value: `credit.reserved` and `credit.reservation_failed` (payload `reason`, and `order_id`). A repeated `event_id`, or a message for an order that has already moved on, changes nothing. Credit should release a reservation when it sees `order.cancelled` or `order.expired`, including when that event arrives before `credit.reserved` is published.

| Topic | This service | Notes |
| --- | --- | --- |
| `order.events` | produces, keyed by `order_id` | retained with no time limit, so a new consumer can read from offset 0 |
| `credit.events` | consumes as group `order-service` | offsets are committed after the message is applied or dead-lettered |
| `order-service.credit-events.dlq` | produces | a credit message that still fails after retries at 0.5s, 1s, 2s, and 4s; if the DLQ is unavailable it is parked in `parked_messages` and relayed later |

Topics are created by `event-broker`, not by this service. One order's events stay in order because they share a key. The worker also sweeps the database every 10 seconds and expires pending or open orders whose `expires_at` has passed.

## Develop

Python 3.12. Schema changes go in `alembic/versions/` as `YYYYMMDD_NNNN_snake.py`. Do not call `create_all` at startup. Tunables such as the one-hour TTL, the HTTP timeout, the relay batch, the retry delays, and the expiry sweep interval are constants in `app/messaging.py`, not environment variables.
