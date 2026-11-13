# Sequence 7: Courier aborts an ACCEPTED order

Effective CHANGE-128/ADR-041, preserving ADR-025 durable reset/attempt behavior
and ADR-040 report funding guard. New penalty replaces accepted-cancellation
publication; stored legacy snapshot dispatch remains.

```mermaid
sequenceDiagram
    actor Courier
    participant API as OrderController
    participant Command as Durable Order command workflow
    participant Credit as Credit Service
    participant Transition as OrderTransitionService
    participant DB as Order PostgreSQL
    participant Dispatcher as After-commit dispatcher
    participant Broker as Google Pub/Sub
    participant User as Future User penalty consumer
    Courier->>API: cancel-accepted with commandId/version
    API->>Command: Submit ABORT with verified courier
    Command->>DB: Persist intent, guard/lease and validation
    Note over Command,DB: Assigned courier, ACCEPTED, version, no report hold
    Command->>Credit: Synchronous assignment reset/hold
    Credit-->>Command: Confirm success (uncertainty stays recoverable)
    Command->>Transition: abortConfirmed
    Transition->>DB: Lock/recheck; capture cancelling courier
    alt Expiry still in future
        Transition->>DB: ABORTED attempt; current OPEN, courier cleared
    else Already expired
        Transition->>DB: ABORTED attempt; current EXPIRED, courier cleared
        Transition->>DB: Existing Credit OpenOrderRefundTaskEvent intent
    end
    Transition->>DB: Bound receipt and PenaltyScoreAdditionEvent intent
    Note over Transition,DB: Amount2, ACCEPTED_TASK_CANCELLATION, captured courier
    DB-->>Transition: Atomic commit
    Transition-->>Dispatcher: Existing post-commit signals
    Dispatcher->>Broker: Stored penalty on addition topic
    Broker-->>User: Apply amount2 once (subscriber pending)
    opt EXPIRED outcome
        Dispatcher->>Broker: Existing Credit refund topic
        Broker-->>Credit: Refund old reservation
    end
```

Unexpired abort queues one penalty; expired abort queues penalty plus Credit
refund. Reset confirmation remains necessary before reopening. No new accepted
cancellation snapshot emitted. Courier identity is retained before clearing it.
Rejected/held/failed reset/rollback/replay queue no additional penalty. Credit
uncertainty uses existing durable recovery, not a distributed transaction.
Each outbox event retries independently; User integration is FEEDBACK-014.
