# notification-service

Delivers user-visible notifications in response to **order-lifecycle events**.
This is the primary **event-driven** consumer in the system (project M6).
Order Service publishes facts about its own state; notification-service turns each fact into a notification per recipient and serves them back over a small read API that the frontend bell polls.

## Responsibilities (from backlog)

- **F1** subscribe to Order Service events (`OrderAccepted`, `OrderPickedUp`, `OrderDelivered`, `OrderApproved`, `OrderCompleted`, `OrderCancelled`, `CourierWithdrawn`, `OrderExpired`); consume asynchronously; persist one notification per recipient.
- **F2** notify the **requester** of progress on their orders.
- **F3** notify the **courier** of changes to assigned orders.
- **F4** notify **both** parties on a supplier-deactivation cancellation.

## Reliability (NFRs)

- No duplicate user-visible notifications on redelivery (N1.1), enforced by a unique `(event_id, recipient_id)` constraint plus a savepoint insert.
- Delivery delay or failure must not block the underlying order or credit operation (N2.1); events are consumed asynchronously and a reconnect loop keeps the HTTP service up through a broker outage.

## Layout

The service follows the monorepo layering `api/routes` (HTTP) -> `services` (business logic) -> `repositories` (persistence), plus the event-side consumer and delivery channel.

```text
app/
├── main.py                              # app + lifespan (starts the consumer)
├── config.py                            # env-driven settings
├── db.py
├── api/
│   ├── routes/notifications.py          # list, mark-read, mark-all-read
│   └── deps.py                          # identity headers + self-or-admin
├── services/
│   ├── consumer.py                      # RabbitMQ consumer, ack/nack, idempotency
│   ├── rules.py                         # build_notifications: event -> drafts
│   ├── channels.py                      # DeliveryChannel / InAppChannel (NTH2 hook)
│   └── notification_service.py          # read-side use cases
├── repositories/notifications.py        # idempotent insert; list; mark read
├── models/notification.py               # Notification ORM model
└── schemas/                             # event + API DTOs
```

## Configuration

All configuration comes from environment variables (see `.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+asyncpg://foc:foc@notification-db:5432/notification_db` | The service-owned PostgreSQL database. |
| `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672/` | The broker the consumer connects to. |
| `ORDER_EVENTS_EXCHANGE` | `foc.order.events` | The topic exchange order events are published to. |
| `ORDER_EVENTS_QUEUE` | `notification-service.order-events` | The durable queue this service binds and consumes. |

## Run

With the full stack over Docker Compose:

```bash
make up
```

The service listens on port `8000` in its container and exposes `GET /health` returning `{"status": "ok"}`.

Locally against a venv:

```bash
cd notification-service
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

A local run still needs a reachable PostgreSQL and RabbitMQ; point `DATABASE_URL` and `RABBITMQ_URL` at them.

## Test

```bash
make test-notification-service
```

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) purpose, F1-F4 responsibilities, and the C4 component diagram.
- [`docs/event-flow.md`](./docs/event-flow.md) the order-event-to-bell sequence and duplicate-redelivery drop.
- [`docs/api-contract.md`](./docs/api-contract.md) the read API endpoints, headers, and errors.
- [`docs/data-model.md`](./docs/data-model.md) the `notifications` table.
- [`docs/requirements-traceability.md`](./docs/requirements-traceability.md) the D1 requirement to code to test map.

Owner: John Gao Jiahao.
