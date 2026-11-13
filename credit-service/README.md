# Credit Service

Infrastructure and business rules for FoC's closed credit economy. The service provides the
database schema, migrations, authenticated read APIs, event contracts,
transactional-outbox plumbing, Kafka consumers/relay, health checks,
container image, Compose services, and tests. Transport-independent balance and
reservation rules live in `app/services/credits.py`; event-to-domain and
domain-to-outbox translation lives in `app/services/event_handlers.py`.
Numbered `AUDIT` comments and `BUSINESS_LOGIC_AUDIT.md` provide a review map.

## Run the infrastructure

Copy `.env.example` to `.env`, replace the example secrets, generate the local
TLS material with `./scripts/generate-dev-tls.ps1` from the repository root,
then run:

```bash
docker compose up --build kafka kafka-topics credit-db credit-migrate credit-service
curl http://127.0.0.1:8083/health
curl http://127.0.0.1:8083/ready
```

The `credit-order-worker` starts after both the database migration and Kafka
topic creation. Order Service consumes the resulting
`credit.events` stream with its own consumer group.

Worker lifecycle, heartbeat, retry, relay, DLQ, and readiness alert guidance is
in [`docs/observability.md`](../docs/observability.md).

## HTTP surface

All public routes forward an opaque bearer token to User Service `/users/me`
over certificate-verified HTTPS. User Service remains authoritative for user
status, which must be active. Admin routes also require `role=admin`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process liveness; no dependency checks |
| `GET` | `/ready` | Database connectivity and migration-head check |
| `GET` | `/credits/me` | Own available, reserved, and total balance |
| `GET` | `/credits/me/transactions` | Own paginated audit history |
| `GET` | `/admin/credits/{user_id}` | Administrator investigation view |
| `GET` | `/admin/credits/{user_id}/transactions` | Administrator audit view |
| `POST` | `/admin/credits/{user_id}/adjust` | Auditable administrator correction |
| `PUT` | `/admin/credit-accounts/{user_id}` | Idempotent administrator recovery |

The recovery route requires a valid User Service bearer token for an active
administrator and accepts `{}` or a matching UUID-only `user_id`. Normal Credit
account creation is lazy and order-driven. Reads never create an account, so a
user who has not participated in a qualifying order receives `404`. The
administrator route remains a manual repair path.

## Event contract

Credit Service uses two durable Kafka topics:

- `order.events`, consumed by group `credit-service-order`, for
  `order.created`, `order.completed`, `order.cancelled`, and `order.expired`;
- `credit.events`, where Credit publishes its financial outcomes.

Every v1 event contains:

```json
{
  "event_id": "uuid",
  "event_type": "order.created",
  "schema_version": 1,
  "occurred_at": "2026-10-16T04:00:00Z",
  "correlation_id": "uuid",
  "payload": {
    "order_id": "uuid",
    "requester_id": "uuid",
    "credit_amount": 8
  }
}
```

Consumed events are `order.created`, `order.completed`, `order.cancelled`, and
`order.expired`. `order.picked_up` is intentionally ignored. A completed event must also carry
`courier_id`. A cancellation whose `previous_status` is `PICKED_UP` must carry
`courier_id` because its reservation is paid to that courier. The outbox
publishes `credit.reserved`,
`credit.reservation_failed` to `credit.events`. Completion, cancellation, and
expiry still update Credit balances, reservations, and audit records atomically,
but they do not publish a follow-up Credit event. Order Service owns its
consumer group and resulting order-state transitions; Credit Service does not
mutate them.

The order stream uses bounded retries and an explicit dead-letter topic.
User registration does not create a Credit account and Credit Service does not
consume `user.created`.

The retry schedule is configured through `CREDIT_RETRY_BACKOFF_SECONDS`; the
default `0.5,1,2,4` means five total attempts, a longest individual wait of
four seconds, and 7.5 seconds of total waiting. Only recognized SQLAlchemy
connection, operational, disconnection, and pool-timeout failures use this
schedule. Failure handling is deliberately narrower:

| Failure category | Worker behavior |
| --- | --- |
| Expected reservation rejection, such as `INSUFFICIENT_CREDIT` | Commit the audit and `credit.reservation_failed` outbox event, then ACK |
| Malformed event or invalid event payload | Roll back, skip retry, and quarantine in the stream DLQ |
| Deterministic Credit-domain or input violation | Roll back, skip retry, and quarantine in the stream DLQ |
| Recognized transient database/infrastructure failure | Roll back and retry on the configured schedule; quarantine if all attempts fail |
| Unexpected or unclassified exception | Roll back, skip blind retry, and quarantine for investigation |

Quarantined records retain their exact original body, key, and existing
headers. Credit Service adds `x-credit-failure-code`, `x-credit-failed-at`,
`x-credit-failed-attempts`, `x-credit-source-topic`,
`x-credit-source-partition`, and `x-credit-source-offset`. The source offset is
committed only after Kafka confirms the DLQ publication. The quarantine topic,
retained for seven days in local Compose, is
`credit-service.order-events.dlq`.

### DLQ investigation runbook

1. An authorized operator uses Kafka tooling from the broker container, for
   example `kafka-console-consumer.sh`, with a new investigation consumer group.
2. Inspect `credit-service.order-events.dlq`. Record the failure code, attempt count,
   failure timestamp, source topic/partition/offset, event type, event ID,
   relevant order/user ID, and correlation ID when available.
3. Correlate those identifiers with Credit worker logs and the relevant
   account, reservation, and transaction-audit records. The existing admin API
   can inspect accounts and transactions, but it does not expose either DLQ.
4. Resolve the underlying cause before considering an explicitly authorized
   manual replay or administrator adjustment. Never automatically replay a
   permanent business-rule violation.
5. Record the disposition: corrected and replayed, manually compensated, or
   retained and escalated.

A DLQ is quarantine and diagnostic evidence. It is not an administrator UI or
an automatic repair mechanism.

### Order Service integration requirement

Order Service must consume `credit.reserved` and `credit.reservation_failed`
from `credit.events` and apply the corresponding order-state changes. Credit
Service filters valid unrelated `order.events` records before its strict domain
parser; malformed records and header/envelope mismatches are quarantined.

## Persistence model

- `credit_accounts`: one row per User Service UUID, with non-negative available
  and reserved balances. No User Service student identifier or account status
  is duplicated.
- `credit_reservations`: one unique reservation per order and an explicit
  ACTIVE/TRANSFERRED/RELEASED state.
- `credit_transactions`: immutable successful/rejected audit records with
  signed available/reserved deltas, retained independently of account state.
- `processed_events`: durable inbox deduplication by event UUID.
- `outbox_events`: events committed in the same transaction as credit changes.

## Saga participant behavior

- `order.created` conflict-safely creates and grants the requester's initial
  allocation exactly once, then reserves credit and emits `credit.reserved`, or
  commits the allocation plus a rejected audit row and emits
  `credit.reservation_failed`.
- `order.completed` validates the active reservation, conflict-safely creates
  and grants the courier's initial allocation exactly once, then atomically
  settles to the courier without publishing another Credit event.
- `order.cancelled` before pickup and `order.expired` return an active
  reservation to the requester without publishing another Credit event.
- `order.cancelled` after pickup follows the same validation-first courier
  initialization and settlement path and records
  `ORDER_CANCELLED_AFTER_PICKUP` in the audit trail without publishing another
  Credit event.
- Pre-pickup cancellation and expiry never initialize an account. Invalid
  settlement never initializes or grants the proposed courier.
- Existing accounts are never reset or re-minted. The allocation marker, not a
  Credit-owned lifecycle status, determines whether initial credit was granted.
- Duplicate event UUIDs are ignored by the inbox. A second event for the same
  order cannot repeat a balance mutation because the reservation state is also
  checked.
- Contradictory lifecycle events raise without committing and are quarantined
  immediately for investigation rather than retried or silently changing
  credit state.

Schema changes must be added as Alembic migrations; the application never runs
`create_all` at startup. PR-introduced Credit migrations are forward-only and
do not define `downgrade()`. Rolling back an image does not undo schema changes;
database recovery requires a separately planned migration or backup restore.

## Internal HTTPS configuration

`USER_SERVICE_URL` must use `https://`, and `USER_SERVICE_CA_FILE` must identify
the trusted CA bundle. The User Service certificate is verified for both chain
and hostname. Local Compose mounts the CA generated by
`scripts/generate-dev-tls.ps1`; production deployments should inject and rotate
certificates through their platform PKI. Kafka traffic is unaffected because it
does not use HTTP. See `docs/internal-https.md` at the repository root.

## Tests

```bash
python -m pip install -r requirements-dev.txt
pytest
```

The SQLite suite covers transaction shape and business outcomes. The optional
PostgreSQL concurrency tests exercise the production `ON CONFLICT` and row-lock
paths across independent sessions:

```bash
TEST_DATABASE_URL=postgresql+psycopg://... pytest tests/test_concurrency_postgres.py
```
