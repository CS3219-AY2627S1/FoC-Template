# 3. RabbitMQ carries the asynchronous messages between services

- Status: proposed
- Date: 2026-10-21
- Scope: every service that tells another service about something without waiting for an answer

## Context

Several requirements have the same shape: a change in one service has to reach another service reliably, but not immediately.

- N7: workflows that do not need an immediate response use asynchronous communication. N7.1 names the account announcement of F1.1.7 and the credit requests of F3.4 and gives them 5 seconds.
- F1.1.7: the user-service announces every account that becomes Active to the Credit Service and repeats an unacknowledged announcement with the same identifier. F4.1.1 to F4.1.3: the credit-service creates exactly one credit account with 50 credits and acknowledges a repetition without granting credits again.
- F3.4.1 to F3.4.3: on Completed, Cancelled or Expired the order-service requests a transfer or release and repeats an unacknowledged request under the same errand reference.
- N6.1.2: one service being down or replaced must not stop the others. A registration must not fail because the credit-service is down.

In all of these the sender only needs to know that the message will arrive, at least once. The receiver has to recognise a repetition.

## Decision

RabbitMQ is the message broker, as one container from the official image `rabbitmq:4.3-management-alpine` in the `backend` network.

- There is one durable topic exchange, `relay.events`. Every event is published there with its type as the routing key. Types read `<service>.<object>.<event>`, for example `user.account.activated`.
- Each consuming service owns and declares its durable queues, named `<consumer>.<purpose>` (for example `credit-service.accounts`), and binds them to the event types it needs. Instances of one service share the queue. A new consumer binds its own queue and the producer does not change.
- Every message is JSON in one envelope: `eventId`, `type`, `occurredAt` and `data`. The catalog of events is `docs/events.md`.
- Delivery is at least once. A producer writes the event together with the change it reports, in the same database write (an outbox), publishes it with publisher confirms and the mandatory flag, and marks it sent only once the broker has stored it in a queue. A consumer acknowledges a message only after its own transaction has committed and deduplicates by the event id or a natural key such as the account id.
- A message that cannot be processed goes to the dead-letter exchange `relay.dead` and from there to `<queue>.dead`, so it does not block the queue.
- Synchronous HTTP stays for everything that needs an answer now: authorization (ADR 0001), the reservation when an errand is created (F4.2) and every query.

## Alternatives considered

Synchronous HTTP with retries. The caller would have to keep and repeat failed calls itself, which is an outbox plus a retry scheduler in every service, and it would have to know every receiver: a new receiver means a change in the sender. A registration would wait for the credit-service or fail with it.

Apache Kafka. An ordered, replayable log built for high throughput. For the volume of FoC its operation (partitions, consumer offsets, retention) is more than the problem needs, and acknowledging, redelivering and dead-lettering single messages have to be built on top of it.

Redis Streams. Light, with consumer groups and acknowledgements. Durability depends on how Redis persists, and routing by type and dead-lettering have to be built by hand.

NATS JetStream. Light and capable, but nobody on the team has used it, and there are fewer examples for Node.

RabbitMQ brings per-message acknowledgements and redelivery, durable queues, routing by key, dead-lettering and a management UI, in one container.

## Consequences

Every message may arrive more than once, so every consumer has to be idempotent. The backlog already asks for this (F1.1.7, F3.4.3, F4.1.3, F4.3.2).

Every producer needs an outbox. The user-service keeps it inside the account document, because a single-document update is atomic in MongoDB and transactions over several documents would need a replica set. Services on PostgreSQL use an outbox table written in the same transaction.

Until a consumer has declared its queue, the broker returns the producer's events as unroutable and the producer keeps them. The order in which services start does not matter, and nothing is lost before the first consumer runs.

The broker is one more component that can be down. Producers keep serving while their events wait, consumers reconnect. No service uses `depends_on` on the broker, so it does not stop a service from starting (N6.1.2).

The AMQP port and the management UI are published on `127.0.0.1` only, for services run outside Compose and for debugging. The credentials come from `BROKER_USER` and `BROKER_PASSWORD`, with development defaults in `compose.yaml`.
