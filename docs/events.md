# Events

How services tell each other about changes without waiting for an answer, and which events exist. The decision and its reasons are in [ADR 0003](decisions/0003-message-broker.md).

## The broker

RabbitMQ runs as the `broker` service in `compose.yaml`, in the `backend` network.

| | |
| --- | --- |
| Address inside Compose | `amqp://<BROKER_USER>:<BROKER_PASSWORD>@broker:5672` |
| Address from your machine | `amqp://relay:change-me@localhost:5672` |
| Management UI | http://localhost:15672, user `relay`, password `change-me` |

Every service that publishes or consumes reads `BROKER_URL`. Do not add `depends_on` on the broker: your service has to start and serve while it is down.

## Conventions

- **Exchange:** `relay.events`, type `topic`, durable. Every event goes there with its type as the routing key.
- **Event type:** `<service>.<object>.<event in the past tense>`, for example `user.account.activated` or `order.errand.completed`.
- **Queue:** `<consumer>.<purpose>`, durable, declared by the consuming service, for example `credit-service.accounts`.
- **Dead letters:** exchange `relay.dead` (topic). Each queue dead-letters with its own name as the routing key into `<queue>.dead`.

Every message is JSON in this envelope, and the AMQP properties repeat what a consumer needs without parsing:

```json
{
  "eventId": "0f8e2b7c-3c1d-4a8e-9f57-2d1c6a3b9e40",
  "type": "user.account.activated",
  "occurredAt": "2026-10-21T10:15:00.000Z",
  "data": { "accountId": "671f3a9e-8c2b-4d0e-a1f5-9b7c3e2d4a61" }
}
```

| Property | Value |
| --- | --- |
| `messageId` | `eventId` |
| `type` | the event type |
| `appId` | the producing service |
| `contentType` | `application/json` |
| `deliveryMode` | persistent |

Adding a field to `data` is fine. Renaming or removing one is a new event type.

## Producing an event

1. Write the event in the same database write or transaction as the change it reports (outbox). Never publish first and save after, and never save and publish as two separate steps.
2. Publish on a confirm channel with `persistent: true` and `mandatory: true`. Mark the event sent only after the broker confirmed it and did not return it as unroutable.
3. Repeat unsent events with the same `eventId`.

The user-service is the reference: `user-service/src/broker.ts` (connection, publish with confirms) and `user-service/src/services/announcement.service.ts` (outbox relay).

## Consuming an event

1. At start-up, declare your queue and bind it to the event types you need. Declarations are idempotent, so this runs on every start.
2. Acknowledge a message only after your transaction has committed.
3. Be idempotent: the same event can arrive more than once. Deduplicate by `eventId` or by a natural key (one credit account per `accountId`).
4. A malformed message is rejected without requeue and lands in `<queue>.dead`. A temporary problem, such as your database being down, puts the message back after a pause.
5. Log the `eventId` with everything you do for a message.
6. When the connection closes, reconnect after a delay and declare and consume again.

A sketch for the credit-service, with amqplib (`npm install amqplib`):

```ts
import { connect, type ConsumeMessage } from "amqplib";

const QUEUE = "credit-service.accounts";

export async function consumeAccountAnnouncements(
  createAccount: (accountId: string, eventId: string) => Promise<void>,
) {
  const connection = await connect(process.env.BROKER_URL!);
  const channel = await connection.createChannel();

  await channel.assertExchange("relay.events", "topic", { durable: true });
  await channel.assertExchange("relay.dead", "topic", { durable: true });
  await channel.assertQueue(QUEUE, { durable: true, deadLetterExchange: "relay.dead", deadLetterRoutingKey: QUEUE });
  await channel.assertQueue(`${QUEUE}.dead`, { durable: true });
  await channel.bindQueue(`${QUEUE}.dead`, "relay.dead", QUEUE);
  await channel.bindQueue(QUEUE, "relay.events", "user.account.activated");
  await channel.prefetch(10);

  await channel.consume(QUEUE, async (message: ConsumeMessage | null) => {
    if (!message) return;
    let accountId: string;
    let eventId: string;
    try {
      const event = JSON.parse(message.content.toString());
      accountId = event.data.accountId;
      eventId = event.eventId;
      if (typeof accountId !== "string" || typeof eventId !== "string") throw new Error("missing ids");
    } catch {
      channel.nack(message, false, false); // malformed: to credit-service.accounts.dead
      return;
    }
    try {
      await createAccount(accountId, eventId);
      channel.ack(message);
    } catch {
      setTimeout(() => channel.nack(message, false, true), 5000); // temporary: back to the queue
    }
  });
}
```

`createAccount` makes the event idempotent through the primary key, for example in PostgreSQL:

```sql
INSERT INTO credit_accounts (account_id, available, reserved)
VALUES ($1, 50, 0)
ON CONFLICT (account_id) DO NOTHING;
```

Run it in one transaction with the record of the 50 starter credits, and write that record only when a row was inserted.

To try a consumer by hand, open the management UI, pick the queue under "Queues and Streams" and use "Get messages" to look at what is waiting.

## Catalog

### `user.account.activated`

| | |
| --- | --- |
| Producer | user-service |
| When | An account becomes Active by verifying its email (F1.1.5), or the first administrator is created (F1.5.6). Accounts that were already Active before announcements existed are announced once at start-up. |
| `data` | `accountId`: the account's id in the user-service (UUID) |
| Consumers | credit-service, queue `credit-service.accounts`: creates the credit account with 50 credits (F4.1.1 to F4.1.3). message-service, queue `message-service.messages`: sends the account its welcome message. |
| Repetition | Repeated with the same `eventId` until the broker has stored it in a queue (F1.1.7). Until `credit-service.accounts` exists, announcements wait in the user-service. |
| Duplicates | Possible. Consumers deduplicate by `accountId`: one credit account and one welcome message per account. |
| Order | Does not matter. There is exactly one such event per account. |
| Requirements | F1.1.7, F4.1.1 to F4.1.3, N7.1 |

### `order.errand.completed`, `order.errand.cancelled`, `order.errand.expired`

| | |
| --- | --- |
| Producer | order-service |
| When | An errand enters Completed, Cancelled or Expired (F3.4.1 to F3.4.3). A failed or interrupted creation becomes Rejected, which also sends `order.errand.cancelled`, so any reservation is released. |
| `data` | `errandRef`: the order id as a string. Completed also carries `courierId`: the courier's user-service account id, plus `supplierId`, `deliverySupplierId`, `creditReward`, `itemCount`, `distance` (the chosen supplier's measured walk to the drop-off, in metres, null when no route was measured). |
| Consumers | credit-service, queue `credit-service.orders`: transfers the reserved reward on Completed, releases it on Cancelled or Expired. recommendation-service, queue `recommendation-service.orders`: folds each Completed errand's reward, items and distance into the chosen supplier's running averages for credit recommendations. |
| Delivery | The order status and outbox event are written in one PostgreSQL statement. The relay retries every second with the same event id until RabbitMQ confirms routing. |
| Duplicates | Credit-service's existing transfer/release transactions claim an active reservation once, by `errandRef`. Repeated terminal status requests produce no new event. |
| Failed creation | Pending and Rejected orders are no errands and never appear in any list. Pending orders left by a crash are rejected after one minute. Credit-service closes the reference even when release arrives before reservation, so a late reserve cannot lock credits for a cancelled order. |
| Order | Each order has one terminal event. |
