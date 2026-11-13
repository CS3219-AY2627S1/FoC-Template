# FoC asynchronous contracts

`asyncapi.yaml` is the canonical, versioned description of messages published
to the durable Kafka domain topics. Producers and consumers must update this
file before adding fields or event types.

Version 1 envelopes always carry `event_id`, `event_type`, `schema_version`,
`occurred_at`, `correlation_id`, and a typed `payload`. Consumers must ignore
unknown optional payload fields within version 1, deduplicate by `event_id`,
and treat a breaking change as a new schema version.

Topic and consumer ownership:

- Order Service publishes `order.events`; Credit Service consumes it as
  `credit-service-order`.
- Notification Service will consume `order.events` for `order.opened`,
  `order.rejected`, `order.accepted`, `order.picked_up`, `order.completed`,
  `order.cancelled`, and `order.expired`.
- Credit Service publishes `credit.events`; Order Service consumes it with its
  own stable group.

Topic creation belongs to `event-broker/create-topics.sh`. Producers wait for
Kafka delivery confirmation; consumers disable automatic commits and commit
their offsets only after durable processing or confirmed DLQ publication.
Credit Service reports credit outcomes, while Order Service owns the resulting
Order state changes.

Credit accounts are UUID-only and initialized lazily from relevant order
events. `order.created` initializes the requester before reservation.
`order.completed`, and `order.cancelled` after pickup, initialize the courier
only after validating the active reservation. User registration and
`order.picked_up` do not initialize Credit accounts.

For `order.cancelled`, Credit Service uses `previous_status` to select the
financial outcome. Before pickup it releases the reservation to the requester.
After `PICKED_UP`, the event must include `courier_id`; Credit Service transfers
the reservation to that courier and records `ORDER_CANCELLED_AFTER_PICKUP` in
its audit trail. Completion, cancellation, and expiry do not publish Credit
outcome events.

`order.events` and `credit.events` records are keyed by `order_id`. Kafka therefore preserves order
for one aggregate within its partition while allowing different aggregates to
be processed in parallel. Records also carry `event_type` and `event_id`
headers matching the JSON envelope.
