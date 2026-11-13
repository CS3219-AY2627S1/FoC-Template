<!-- AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
Scope: Document the human-confirmed deletion policy, subscription and processing; review pending; see ../usage-log.md. -->
# Order User deletion handling

Order uses `@foc/messaging`'s existing RabbitMQClient and the durable
`QUEUES.orderUser` queue, `order.user-events`. The consumer is
`../grpc/src/events/userDeleted.ts`; the processor is
`../grpc/src/services/userDeletion.ts`.

## Before deletion: synchronous eligibility

The internal RPC `order.OrderService/CheckDeletionEligibility` takes `user_id`
and returns `eligible` and `blocked_order_count` (number of blocking orders). Shared
TypeScript clients use camelCase `userId` and `blockedOrderCount`:

```js
const { createOrderClient } = require('@foc/grpc');
const client = createOrderClient('localhost:50053');
client.checkDeletionEligibility({ userId: 'the-user-id' })
  .then(console.log)
  .catch(console.error)
  .finally(() => client.close());
```

The existing internal gRPC convention and network configuration are retained;
no endpoint-specific service token was added. Blank IDs return INVALID_ARGUMENT.
Unavailable Order/database lookups return UNAVAILABLE, never an eligible result.
User Service must reject deletion when this check fails or returns eligible=false.
This change provides the RPC; User's deletion endpoint must actually call it.

The check includes both requester and courier relationships. UNASSIGNED,
ASSIGNED and PICKED_UP block deletion, as do RESERVED, SETTLEMENT_PENDING and
REFUND_PENDING credit states. Terminal orders also block when their durable
credit operations are unfinished/failed, an edit needs recovery/reconciliation,
or the recorded terminal status and financial outcome are inconsistent. Pending
or compensating creations can already hold funds before an Order row exists;
their preallocated Order UUIDs are also returned as blockers. Confirmed failed
creations with no unresolved funds do not block deletion.

## After deletion: notification, not approval

A `user.deleted` event says deletion already happened. Order does not reject
that deletion, invent a restoration workflow, or publish an unagreed notification.
User's existing outbox sends **directly to queues**: its owner must send a copy
to `order.user-events`; delivery only to `credit.user-events` does not reach Order.
No new exchange binding is set up here and User's publisher was not changed.

```json
{
  "type": "user.deleted",
  "eventId": "unique-event-id",
  "occurredAt": "2026-11-02T00:00:00.000Z",
  "userId": "old-user-id",
  "deletedAt": "2026-11-02T00:00:00.000Z"
}
```

IDs must be nonblank and timestamps must be offset-bearing ISO datetimes. No
purgeAfter is required. Broker messageId, if supplied, must match eventId.

Order records a durable UserDeletionEvent before processing. Event IDs deduplicate
concurrent deliveries and restart/replay. A reused ID with conflicting data is
rejected into the DLQ. The processor locks the event row and affected Order rows
in a transaction, using the same Order locks as lifecycle operations.

UserDeletionEvent outcomes:

| State | Meaning |
| --- | --- |
| RECEIVED | Receipt committed; processing has not committed yet. |
| PROCESSED | Safe historical data scrubbed; no blocking orders found. |
| MANUAL_REVIEW_REQUIRED | Deletion occurred with active or unresolved work; blockingOrderIds and lastError record the failure. |

For unexpected active orders, Order preserves the order, IDs, personal fields
and credit state for the pending recovery agreement. It makes no cancellation,
assignment, completion, transfer or refund call as a result of deletion. The
failure is saved with `active-or-unresolved-orders-after-user-deletion` and logged
at error level with event/user/order IDs. This recorded outcome is ACKed and
excluded from automatic event replay; it is not endlessly retried. Existing
ordinary lifecycle/recovery workers are unchanged. There is no assumed account
restoration, JWT reactivation, or active-order recovery workflow.

For confirmed DELIVERED/SETTLED or CANCELLED/REFUNDED history without unresolved
operations, Order:

- Replaces only the deleted participant's name with `DeletedUser`, retaining the other participant's name.
- Replaces destination and request details with `DeletedUser` and clears destinationLocationId so the original destination cannot be recovered from the catalogue reference.
- Scrubs nested free text in OrderCreation.payload, OrderEditOperation.proposedChanges and CreditOperation.payload, including destination references and copies of the deleted participant's name. Stored error text on these resolved operations is also cleared to the placeholder.
- Preserves public Supplier pickup snapshots, original requesterId/courierId, order/operation IDs, amounts, timestamps and financial/status audit fields. Rows are not cascade-deleted or reassigned.

Confirmed failed creations without orders/funds are also scrubbed. Blocking
creations/edits are preserved for manual recovery. If one user has safe history
and active work, safe history is scrubbed and only blockers remain untouched.

The scrub transaction and outcome commit together. A failed write rolls back
scrubbing and leaves the receipt RECEIVED; shared broker retries/DLQ handle the
failure. At startup Order processes receipts ACKed by the earlier receipt-only
consumer. Manual-review records are not automatically reprocessed. Created and
restored events have no Order action and do not attach old orders to a new ID.

## Remaining cross-service coordination

CheckDeletionEligibility is a point-in-time safeguard. A new creation can pass
User lookup before deletion and persist afterward; a pending creation can publish
later; acceptance can observe an existing user before the User deletion commits.
Order row locks serialize operations on an existing order but cannot atomically
lock a separate User database or prevent all new orders. User and Order owners
must agree how to prevent new activity while deletion is in progress. That
coordination and active-order recovery are pending; no event, queue, RPC or
account-restoration protocol has been invented for them. Courier existence
validation is already enforced on acceptance but does not close this entire race.

## Run and inspect

Set RABBITMQ_URL to enable subscription. The lifecycle Compose override defaults
to `amqp://guest:guest@host.docker.internal:5672`; host development uses
`amqp://guest:guest@localhost:5672`. Start RabbitMQ first. An initial broker
connection failure fails startup; subsequent reconnects use the shared client.
If RABBITMQ_URL is omitted, subscription is disabled and logged.

From the repository root, with the configured Credit token:

```sh
docker compose -f shared/messaging/compose.yaml up -d --wait
docker compose -f order-service/compose.yaml -f order-service/compose.lifecycle.yaml up --build -d --wait
docker compose -f order-service/compose.yaml logs --tail=50 order-service
```

Docker startup applies migrations, including
`20261102020000_user_deletion_processing`. For host startup apply migrations
explicitly and rebuild the shared gRPC and Order packages. Order closes the
broker on shutdown.

Read-only inspection:

```sh
docker compose -f order-service/compose.yaml exec postgres \
  psql -U order_service -d order_service \
  -c 'SELECT "eventId", "userId", state, "blockingOrderIds", "lastError", "processedAt" FROM "UserDeletionEvent" ORDER BY "receivedAt" DESC LIMIT 20;'
docker exec local-rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
```

Manual-review rows and DLQ messages require operator attention. Do not change
balances, discard holds or restore accounts based solely on these records; no
recovery contract has been agreed.

Automated tests use a disposable broker on 127.0.0.1:5679 and a migrated dedicated
`order_service_test*` database. Never point these tests at demo data:

```sh
TEST_DATABASE_URL=postgresql://order_service:order_service@127.0.0.1:55450/order_service_test_deletion \
TEST_RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5679 \
npm run test:integration --workspace @foc/order-grpc
```

Integration files run sequentially because inbox startup processing scans the
shared test database. Without TEST_RABBITMQ_URL the live-broker test is skipped.
