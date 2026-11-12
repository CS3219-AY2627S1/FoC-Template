<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-11-08
Scope: Added Chat Service outbox event documentation and connector integration.
-->

<!--
AI Assistance Disclosure :
Tool: Claude, date: 2026-11-08
Scope (AI-63): Added Credit Service outbox event documentation and connector integration.
Author review: Changes made were checked and reviewed
-->

# Events: transactional outbox + Debezium

Services never publish to Kafka directly. Each one writes its domain events into an `outbox` table **in the same
database transaction** as the change they describe, and Debezium (on Kafka Connect) streams those rows to Kafka.
An event therefore reaches Kafka if and only if its change commits, even when Kafka is down at the time.

```text
service ──(one DB transaction)──▶ business tables + outbox row
                                          │  WAL (logical decoding)
                                          ▼
                               kafka-connect (Debezium) ──▶ Kafka topic = event type
```

## Outbox table (identical in every service database)

| Column | Type | Becomes |
| --- | --- | --- |
| `id` | uuid | `eventId` header (use it to deduplicate: delivery is at-least-once) |
| `aggregatetype` | varchar | — (`user`, `errand`, `supplier`) |
| `aggregateid` | varchar | Kafka message **key**, so one entity's events stay ordered on one partition |
| `type` | varchar | Kafka **topic**, and the `eventType` header |
| `payload` | jsonb | Message **value**: plain JSON, no schema envelope or Java type headers |
| `created_at` | timestamptz | — |

The column names are the defaults of Debezium's Outbox Event Router, so they must not change.
Rows are never deleted by the pipeline; Debezium reads the WAL, so old rows can be cleaned up at any time.

## Event catalogue

| Topic | Producer | Key | Payload fields |
| --- | --- | --- | --- |
| `user.registered` | user-service | user id | `userId`, `type`, `name`, `email`, `registeredAt` |
| `errand.created` | order-service | errand id | `errandId`, `requesterId`, `creditValue`, `supplierId`, `expiresAt`, `createdAt` |
| `errand.accepted` | order-service | errand id | `errandId`, `requesterId`, `creditValue`, `courierId`, `acceptedAt` |
| `errand.delivered` | order-service | errand id | `errandId`, `requesterId`, `creditValue`, `courierId`, `deliveredAt` |
| `errand.cancelled` | order-service | errand id | `errandId`, `requesterId`, `creditValue`, `cancelledAt` |
| `errand.completed` | order-service | errand id | `errandId`, `requesterId`, `creditValue`, `courierId`, `completedAt` |
| `errand.failed` | order-service | errand id | `errandId`, `requesterId`, `creditValue`, `courierId`, `failureReason`, `failedAt` |
| `supplier.created` / `supplier.updated` | supplier-service | supplier id | `supplierId`, `name`, `categoryId`, `categoryName`, `buildingId`, `buildingName`, `floor`, `description`, `openingTime`, `closingTime`, `imageUrl`, `status` |

| `credit.reserved` / `credit.released` / `credit.transferred`/ `credit.received`| credit-service | order id |  `creditRecordId`, `changeType`, `orderId`, `userId`, `counterpartyUserId`, `amount`, `reserveAmount`, `availableBalanceAfter`, `occurredAt` |

| `chat.message.created` | chat-service | conversation id | `messageId`, `conversationId`, `errandId`, `senderId`, `recipientId`, `sequenceNumber`, `createdAt` |


Timestamps are ISO-8601 strings. Fields whose value is `null` are **omitted** from the message (Debezium drops them
when expanding the JSON payload), so consumers must treat a missing field as `null`. Topics are created on first use
with 3 partitions.

## Adding an event

1. Write the outbox row inside the transaction that makes the change:
   - Spring services: a method on the service's `*EventPublisher` (`@Transactional(propagation = MANDATORY)`, so calling
     it outside a transaction fails loudly).
   - Python services: append the event from `main/outbox.py` inside the same `SessionLocal.begin()` block as the business change.
2. Add the topic to the catalogue above. No Debezium change is needed: the topic is taken from `type`.

## Adding a service (e.g. credit-service)

1. Create the `outbox` table with the columns above.
2. Start its Postgres with `command: ["postgres", "-c", "wal_level=logical"]` in `compose.yaml`.
3. Copy a file in `connectors/`, changing the host, `${env:...}` credentials, `topic.prefix`, `slot.name` and
   `publication.name`; pass the credentials to `kafka-connect` in `compose.yaml`.

## Running and inspecting

`docker compose up` starts `kafka-connect`, and the one-off `connect-init` job registers every file in `connectors/`
(idempotent; it restarts a connector that failed because its service had not yet created the `outbox` table).

```bash
curl -s "localhost:8083/connectors?expand=status"     # every connector and task should be RUNNING
docker compose run --rm connect-init                    # re-register after editing a connector file
```

Messages, keys and headers are visible in kafka-ui at <http://localhost:8085>.

Each connector holds a replication slot in its database; while Kafka Connect is stopped, that database retains WAL
until the connector catches up. To remove a connector for good, `curl -X DELETE localhost:8083/connectors/<name>`
and drop its slot (`select pg_drop_replication_slot('<service>_outbox_slot');`).
