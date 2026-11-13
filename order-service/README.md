# order-service

REST API for orders (Express 5, Sequelize, PostgreSQL).

## Run with Docker

```bash
cp .env.example .env        # then set DB_PASSWORD
docker compose up --build
```

API: http://localhost:3003 · Postgres (for a DB client): localhost:5434

## Try it

```bash
curl http://localhost:3003/health

curl -X POST http://localhost:3003/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "requester_id": "user-1",
    "title": "Two coffees",
    "supplier_id": "supplier-1",
    "delivery_location": "Block 12, Level 3",
    "credit_amount": 10,
    "accept_by": "2026-12-31T12:00:00Z"
  }'
```

## Useful commands

```bash
docker compose logs -f api   # follow API logs
docker compose down          # stop (data kept)
docker compose down -v       # stop and DELETE the database volume
```

## Events

Status changes are written to an outbox table in the same transaction as the
order, then published to the `orders` topic exchange (routing key = event type
lower-cased with dots, e.g. `ORDER_PICKED_UP` -> `order.picked.up`).

| Event | Consumers |
| ---- | ---- |
| `ORDER_CREATED`, `ORDER_ACCEPTED`, `ORDER_PICKED_UP` | notification service |
| `ORDER_COMPLETED`, `ORDER_CANCELLED`, `ORDER_EXPIRED` | credit service, notification service |

Event `data`: `order_id`, `requester_id`, `courier_id`, `credit_amount`, `title`.

Publishing uses `mandatory`, so an event nobody is bound to stays in the
outbox and is retried. The three notification-only events are the exception:
if no queue is bound they are dropped with a warning, so they can never hold
up the credit events behind them.

## Notes

- Schema is created by `sequelize.sync()` on startup. Replace with
  migrations before this holds real data.
- Config is read from environment variables only (`app/config/db.config.ts`).
