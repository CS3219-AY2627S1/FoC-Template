<!--
AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).
Scope: Documented the human-requested shared-client readiness getter; original broker authorship retained.
Author review: I edited for conciseness and structure.
Prompts/key responses: ../../credit-service/ai/usage-log.md, entry 047.
-->
<!-- AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
Scope: supplier publishing example now uses publishToExchange on supplier.events.
Author review: Pending. -->
## Upstream attribution for the Credit PR

This package was copied from `origin/events/data-validation` at commit
`0b48f5f85be01d148176a6410c9ca22c2b8e672e`, authored by **@sunpterodactyl and the
shared messaging contributors**. The broker implementation and contracts belong
to those authors; this Credit PR does not claim their authorship. Their source
and existing AI declarations are preserved. This README adds provenance; package
source/configuration files are copied unchanged. Credit-specific work consists of
consumer integration, workspace/build wiring and listener tests.

The upstream README follows.

## RabbitMQ Broker

Shared `@foc/messaging` workspace. One `RabbitMQClient` plus typed contracts; each microservice only plugs in its own producer/consumer.

### Structure of the folder

```text
shared/messaging/
├── src/
│   ├── contracts/
│   │   ├── credit.ts      # credit command / result payloads
│   │   ├── order.ts       # order event payloads
│   │   └── supplier.ts    # supplier event payloads
│   ├── index.ts           # RabbitMQClient singleton (connect, publish, consume, DLQ)
│   ├── queueLog.ts        # broker.log plus one file per queue
│   └── topology.ts        # queues, exchanges, retry / DLQ / DLX names
├── compose.yaml           # local RabbitMQ broker — start from here
├── package.json           # @foc/messaging dependencies
├── README.md
└── tsconfig.json
```

### How to define a consumer in your own microservice

Connect once, then `consumeFromQueue<T>` with a contract type. The client asserts the queue + DLQ, acks on success, and retries / dead-letters on failure.

**Credit service** — payment commands:

```ts
import { RabbitMQClient, QUEUES, type CreditCommand } from '@foc/messaging';

const broker = new RabbitMQClient({ queues: [QUEUES.creditPayments] });
await broker.connect();

await broker.consumeFromQueue<CreditCommand>(QUEUES.creditPayments, async (msg) => {
  // msg.payload is CreditCommand (reserve / release / settle)
});
```

**Order service** — supplier cache updates:

```ts
import { RabbitMQClient, QUEUES, type SupplierEvent } from '@foc/messaging';

const broker = new RabbitMQClient({ queues: [QUEUES.orderSupplier] });
await broker.connect();

await broker.consumeFromQueue<SupplierEvent>(QUEUES.orderSupplier, async (msg) => {
  // msg.payload is SupplierUpdated | SupplierDeleted
});
```

### How to define a producer in your own microservice

`publishToQueue` JSON-serializes the payload, sets `messageId` from `eventId` (or a UUID), and asserts the queue first so the publisher can start before the consumer.

**Order service** — cancel / refund (credit release):

```ts
import { RabbitMQClient, QUEUES, type CreditReleaseCommand } from '@foc/messaging';

const broker = new RabbitMQClient();
await broker.connect();

const command: CreditReleaseCommand = {
  type: 'payment.release',
  eventId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  orderId: 'ord-1',
};

await broker.publishToQueue(QUEUES.creditPayments, command, command.eventId);
```

**Supplier service** — notify order-service of a catalogue change. Supplier events go to the `supplier.events` topic exchange with the event `type` as the routing key; the `order.supplier-events` queue receives them through its `supplier.updated` and `supplier.deleted` bindings, so the publisher never names the order queue:

```ts
import { RabbitMQClient, EXCHANGES, type SupplierUpdated } from '@foc/messaging';

const broker = new RabbitMQClient({ prefetch: 10 });
await broker.connect();

const event: SupplierUpdated = {
  type: 'supplier.updated',
  eventId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  supplierId: '42',
  name: 'Fine Food',
  supplierType: 'canteen',
  buildingName: 'YIH',
  locationDescription: 'Level 1',
  floor: 1,
  latitude: '1.29',
  longitude: '103.77',
};

await broker.publishToExchange(EXCHANGES.supplier, event.type, event, event.eventId);
```

### Idempotent consumers

The client will deliver the same `eventId` more than once. A retry republishes the original body with the same `messageId`, and RabbitMQ can redeliver after a crash before `ack`. The handler has to treat a second delivery as a no-op.

This is not an outbox or an inbox. The publisher still sends by calling `publishToQueue`. The consumer does not keep a copy of the payload. It only remembers which ids it has already applied.

Use `msg.eventId` as that id. It is the AMQP `messageId`, which `publishToQueue` sets from the payload's `eventId` or a UUID.

```ts
await broker.consumeFromQueue<CreditCommand>(QUEUES.creditPayments, async (msg) => {
  const alreadyApplied = await hasProcessed(msg.eventId);
  if (alreadyApplied) return;

  await apply(msg.payload);
  await remember(msg.eventId);
});
```

`remember` must survive a process restart (a database row or a Redis key, not an in-memory `Set`). Check and write in the same transaction as the business change when the store allows it. If `apply` succeeds and `remember` fails, the retry runs `apply` again, so `apply` itself must be safe to run twice for that same id.

Returning normally acks the message. Throwing asks the client to retry, then dead-letter after `maxRetries`.

### Publisher confirms

`connect()` opens a confirm channel with `createConfirmChannel()`. `publishToQueue` waits for the broker ack and returns `true` only after that ack. `false` means the broker rejected the publish (`publish-rejected` in the log). Retry that call with the same `eventId`.

`publish-blocked` means the socket buffer filled. The publish is still in flight, and the return value is still the later broker ack. A lost confirm response can make the publisher try again after the broker already stored the message, which is why the consumer must be idempotent on `eventId`.

Retries wait for a confirm before acking the original delivery. A rejected retry confirm requeues that delivery instead of dropping it.

### RabbitMQ Package

`@foc/messaging` is an internal npm workspace (`amqplib`). Build with `npm run build --workspace @foc/messaging`. Pass the broker URL from the environment (`RABBITMQ_URL`); do not hard-code credentials in service code.

After a successful `connect()`, the client retries a lost RabbitMQ connection with capped exponential backoff. Consumers registered with `consumeFromQueue()` are retained and re-registered on the replacement channel, so application code does not need to call `consumeFromQueue()` again after a broker restart. `close()` cancels pending reconnect attempts. A connection failure during initial startup still rejects `connect()`; the service should retry startup or restart according to its process policy.

**Start the broker** from this folder:

```bash
docker compose -f shared/messaging/compose.yaml up -d
```

**Create a client** in a service (connect at startup, close on shutdown):

```ts
import { RabbitMQClient, QUEUES } from '@foc/messaging';

const broker = new RabbitMQClient({
  url: process.env.RABBITMQ_URL,
  serviceName: 'order-service',
  queues: [QUEUES.orderSupplier, QUEUES.orderCredits],
  maxRetries: 3,
});

await broker.connect();
// ... publish / consume ...
await broker.close();
```

### RabbitMQ Testing - Mock Events

What does this do you may ask? Basically it creates a new message broker at our localhost 5672, and under the name of order service. The queue reads from an enum of fixed types of queues and assumes the order supplier queue. 

Now the broker is publishing (a producer action) a supplier.updated event to the queue and giving the relevant supplierId. The order event now chooses what to do with this message in its own consumer.

```
docker compose up -d

npx tsx <<'EOF'
import { RabbitMQClient} from './src/index.ts';
import {QUEUES } from './src/topology.ts';

async function main() {
  const broker = new RabbitMQClient({
    url: 'amqp://guest:guest@localhost:5672',
    serviceName: 'order-service',
    queues: [QUEUES.orderSupplier],
    logDir: 'logs/rabbitmq',
  });
  await broker.connect();
  await broker.publishToQueue(
    QUEUES.orderSupplier,
    { type: 'supplier.updated', eventId: 'evt-log-demo', supplierId: '42' },
    'evt-log-demo',
  );
  await broker.close();
}
main();
EOF
```

>To read the output we can run the following commands saved as their own log files

```
cat logs/rabbitmq/broker.log
cat logs/rabbitmq/order.supplier-events.log
```

Each line is JSON. `logs/rabbitmq/broker.log` is the centralized log. Each queue also gets its own file, for example `logs/rabbitmq/credit.payment-events.log`. Dead-lettered messages are written to the queue file and to `<queue>.dlq.log`. `logDir` defaults to `logs/rabbitmq` under the process working directory.

Logs record `eventId`, action, and retry count — not the message payload or the broker URL.

**IMPORTANT** - Idempotency checks belong in a service's consumer logic

**IMPORTANT** - The broker is not yet published as an npm package, and does not yet exist as a single source of truth (on the cloud).

### CLI test for connection

Run these from `shared/messaging/` against the compose broker. There is no automated test suite.

Start (or confirm) the broker first:

```bash
docker compose up -d
```

#### 1. Connection

```bash
docker compose ps
docker exec local-rabbitmq rabbitmq-diagnostics ping
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:15672
```

Expected:

```text
NAME             IMAGE                   COMMAND                  SERVICE    CREATED         STATUS                   PORTS
local-rabbitmq   rabbitmq:3-management   "docker-entrypoint.s…"   rabbitmq   ...             Up ... (healthy)         0.0.0.0:5672->5672/tcp, 0.0.0.0:15672->15672/tcp
```

```text
Will ping rabbit@.... This only checks if the OS process is running and registered with epmd. Timeout: 60000 ms.
Ping succeeded
```

```text
200
```

Management UI: [http://localhost:15672](http://localhost:15672) — user `guest` / password `guest`. AMQP is `amqp://guest:guest@localhost:5672`.

If ping fails or `curl` is not `200`, the container is not healthy yet — wait and retry. `ECONNREFUSED` on `5672` means the AMQP port is not published.

**AI Declaration** — Helped with formatting, and expansion on unclear definitions written by @sunpterodactyl. All thoughts/explanations are my own.

## Credit Service Additions
Credit-specific work includes consumer integration, workspace/build
wiring, listener tests, and the human-requested `isConnected` getter in exchange
047. The existing broker recovery logic was not generated or replaced in that
exchange.

`RabbitMQClient.isConnected` is a read-only boolean getter. It is false before
connection, while recovering, after connection/channel closure and during explicit
shutdown. It becomes true when the connection/channel are available and any
registered consumers have finished restoring. Credit uses it for informational
listener health. The getter does not actively probe the broker or detect consumer
cancellation on an otherwise open channel.
