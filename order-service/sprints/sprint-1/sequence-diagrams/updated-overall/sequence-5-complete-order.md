# Sequence 5: Complete an order

Effective CHANGE-128/ADR-041 and CHANGE-127/ADR-040. Credit compact completion
remains unchanged; User receives a separate explicit penalty decision.

```mermaid
sequenceDiagram
    actor Requester
    participant API as OrderController
    participant Lifecycle as Lifecycle scheduler
    participant Transition as OrderTransitionService
    participant DB as Order PostgreSQL
    participant Dispatcher as After-commit dispatcher
    participant Broker as Google Pub/Sub
    participant Credit as Credit completion consumer
    participant User as Future User penalty consumer
    alt Requester confirms
        Requester->>API: Complete delivered Order with command/version
        API->>Transition: complete with verified requester
        Transition->>DB: Replay receipt or lock Order
        Transition->>Transition: Validate owner, hold, version, DELIVERED
    else At least 48 hours since latest delivery
        Lifecycle->>DB: SQL due DELIVERED IDs excluding holds
        loop Each candidate independently
            Lifecycle->>Transition: autoComplete(id, now)
            Transition->>DB: NOWAIT lock and recheck status/time/hold
        end
    end
    Transition->>DB: Read ACCEPTED and DELIVERED checkpoints
    Transition->>Transition: Compare delivery with acceptance plus limit
    alt Delivery strictly overdue
        Transition->>Transition: Addition amount1, OVERDUE_DELIVERY
    else Delivery on or before deadline
        Transition->>Transition: Deduction amount1, SUCCESSFUL_DELIVERY
    end
    Note over Transition: Penalty targets assigned courier, not requester/lifecycle
    Transition->>DB: COMPLETED, checkpoint, receipt, Credit and penalty intents
    DB-->>Transition: Atomic commit
    Transition-->>Dispatcher: Existing post-commit signals
    Dispatcher->>Broker: Stored Credit completion on completion topic
    Dispatcher->>Broker: Stored penalty on add/deduct topic
    Note over Dispatcher,DB: Failed publish retries original payload/ID independently
    Broker-->>Credit: Settle reservation asynchronously
    Broker-->>User: Apply supplied amount (subscriber pending)
```

Exactly one Credit and one penalty event per successful completion. Penalty has
eventId/eventType/orderId/courierId/penaltyAmount/occurredAt/appliedReason;
versions stay in outbox/attributes. The48-hour confirmation delay is not overdue
delivery. Held requester completion rejects409; held automatic work skips.
Rollback/receipt replay create no new penalty. At-least-once transport requires
atomic User deduplication/score update. Subscriber/cutover/clamp ordering are
FEEDBACK-014, not verified. Class/sequence responsibilities: ADR-041.
