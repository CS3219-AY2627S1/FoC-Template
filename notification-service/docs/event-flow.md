# Notification event flow

Two sequences.
The first follows a single lifecycle action from the requester through to the frontend bell.
The second shows why a redelivered event cannot produce a duplicate notification.

## End-to-end: order event to notification to bell

The publish path uses Order Service's transactional outbox, so the event is written in the same transaction as the order status change and relayed afterwards by a background worker.
Notification Service consumes the event, builds drafts, commits them, and acknowledges only after the commit.
The frontend then reads the notifications back on its next poll.

```mermaid
sequenceDiagram
    autonumber
    actor R as Requester / courier
    participant ORD as order-service
    participant OUT as order_event_outbox
    participant W as order event worker
    participant MQ as foc.order.events (topic)
    participant Q as notification-service.order-events (queue)
    participant C as notification consumer
    participant RL as build_notifications
    participant DB as notification-db
    actor U as Frontend bell
    participant GW as api-gateway

    R->>ORD: lifecycle action (accept / pickup / deliver / approve / cancel)
    ORD->>OUT: write status change + event row (same txn)
    ORD-->>R: 200 / 202 (does not wait on notification)
    W->>OUT: read committed pending event
    W->>MQ: publish, routing key = event_type (confirmed, persistent)
    MQ->>Q: route by bound routing key
    Q->>C: deliver message (prefetch 10)
    C->>C: validate payload, routing key matches event_type
    C->>RL: build_notifications(event, message_id)
    RL-->>C: drafts, one per recipient
    C->>DB: insert drafts (savepoint per row)
    DB-->>C: committed
    C->>MQ: ack (only after commit)
    U->>GW: GET /api/notifications/{user_id} (poll every 15 s)
    GW->>DB: via routes -> service -> repository
    DB-->>U: {items, unread_count, total}
```

The requester's HTTP response returns as soon as Order Service commits its own transaction.
Notification delivery happens entirely downstream of that response, so a slow or down notification-service never blocks the order or credit operation (N2.1).

## Duplicate redelivery is dropped

An at-least-once broker can redeliver the same message, for example after a consumer restart before the ack was recorded.
Both deliveries carry the same `message_id`, so the consumer derives the same `event_id` and the unique constraint keeps exactly one row per recipient.

```mermaid
sequenceDiagram
    autonumber
    participant MQ as foc.order.events
    participant C as notification consumer
    participant DB as notification-db

    MQ->>C: OrderApproved (message_id = evt-7)
    C->>DB: insert (event_id=evt-7, recipient=requester-1)
    DB-->>C: inserted (1 row)
    C->>MQ: ack
    Note over MQ,C: redelivery of the same message
    MQ->>C: OrderApproved (message_id = evt-7)
    C->>DB: insert (event_id=evt-7, recipient=requester-1)
    DB-->>C: IntegrityError, savepoint rolled back, row skipped
    C->>MQ: ack (still one row in the table)
```

The second insert hits the unique `(event_id, recipient_id)` index, raises `IntegrityError`, and is swallowed by the per-row savepoint.
The message is still acknowledged, so it leaves the queue cleanly, and the table still holds a single notification for that recipient.
