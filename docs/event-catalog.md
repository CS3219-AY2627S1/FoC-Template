# Event Catalog

Canonical list of asynchronous events (project M6). The fanout and order
notification envelopes live in `shared/foc_shared/events.py`; the task-request
schemas live in the Order Service (`order-service/app/schemas/`) and the
credit-reply schemas in the Credit Service
(`credit-service/app/schemas/interop.py`). Consumers must handle redelivery
**idempotently**.

Broker: RabbitMQ. The exchanges:

- `foc.user.events` (**fanout**) - published by User Service.
- `foc.order.events` (**topic**, routing key = event type) - published by
  Order Service.
- `foc.credit.events` (**topic**, routing key = event type) - published by
  Credit Service (the task replies below).
- `foc.supplier.events` (**topic**) - published by Supplier Service
  (the `SupplierDeactivated` cascade, consumed by Order Service).
- `foc.chat.events` (**topic**) - published by Chat Service (N2H), see below.
- `foc.chat.fanout` (**fanout**) - Chat Service internal: delivers socket frames
  to whichever chat-service replica holds the recipient's WebSocket.

## User events - `foc.user.events` (fanout)

| Event | Published when | Publisher | Consumed by | Payload (`foc_shared.events`) | Effect |
| ----- | -------------- | --------- | ----------- | ----------------------------- | ------ |
| `UserRegistered` | Email OTP verified (register → verify) | User Service, via a transactional outbox + background relay (`user-service/app/services/events.py`) | Credit Service (`credit-service/app/services/consumer.py`) | `event_type` (`"UserRegistered"`), `user_id`, `email`, `timestamp` (`UserRegisteredEvent`) | Provision the new account's initial balance (`INITIAL_CREDIT_ALLOCATION`, Credit F1.1). |

This is the one async flow already implemented on `main`: verification writes an
`event_outbox` row in the same transaction that sets `email_verified`, and the
relay publishes it to the fanout exchange (see
`user-service/docs/flowchart.md` §5).

## Order events - `foc.order.events` (topic)

Publisher = Order Service. Routing key = event type.
Each consumer binds only the keys it needs: Credit Service
(`credit-service/app/services/consumer.py`) and Notification Service
(`notification-service/app/services/consumer.py`).

### Lifecycle events (consumed)

| Event | Published when | Consumed by | Effect |
| ----- | -------------- | ----------- | ------ |
| `OrderAccepted` | Courier accepts (F2.6.1) | Notification | Notify requester |
| `OrderPickedUp` | Courier picks up (F3.4.1) | Notification | Notify requester |
| `OrderDelivered` | Courier marks delivered (F3.1.1) | Notification | Notify requester |
| `OrderApproved` | Approval transfer confirmed by Credit (F3.5.1) | Notification | Notify requester + courier; this is the live completion event |
| `OrderCompleted` | Legacy direct-completion key (F3.5.1) | Credit, Notification | Transfer credits; notify both |
| `OrderCancelled` | Requester cancels / supplier deactivation (F3.3.1, F4.1.3) | Credit, Notification | Release credits; notify |
| `CourierWithdrawn` | Courier withdraws (F3.2.2) | Credit, Notification | Keep credits reserved; notify requester |
| `OrderExpired` | Sweeper finds expired (F6.1.1) | Credit, Notification | Release credits; notify requester |

The live approve flow emits `OrderApprovalRequested` (below) and then
`OrderApproved`.
`OrderCompleted` is a legacy key that Credit and Notification still bind but the
current Order flow does not emit; both consumers treat `OrderApproved` and
`OrderCompleted` identically.

### Task-request events (Order -> Credit)

Each carries a `task_id`; Credit replies on `foc.credit.events` (see below).

| Event | Published when | Consumed by | Effect |
| ----- | -------------- | ----------- | ------ |
| `OrderDeletionRequested` | Requester deletes a pending order (F3.3) | Credit | Release the reservation; reply `CreditReleased` / `CreditReleaseFailed` |
| `OrderCancellationRequested` | Requester/supplier cancels (F3.3.1, F4.1.3) | Credit | Release the reservation; reply `CreditReleased` / `CreditReleaseFailed` |
| `OrderUpdateRequested` | Requester edits a pending order (reward may change) | Credit | Amend the reservation; reply `CreditAmended` / `CreditAmendRejected` |
| `OrderApprovalRequested` | Requester approves / auto-approval (F3.5.1) | Credit | Transfer the reservation to `courier_id`; reply `CreditTransferSucceeded` / `CreditTransferFailed` |

### Outcome events (emitted best-effort, no current consumer)

These are published after a task resolves, for audit and future consumers.
They go out with `mandatory=False` (`order-service/app/services/events.py`), so
no bound queue is required: `OrderUpdated`, `OrderUpdateFailed`, `OrderDeleted`,
`OrderDeletionFailed`, `OrderCancellationFailed`, `OrderApprovalFailed`.

`OrderExpiryRequested` exists in the schema but is dead code: expiry is
signalled by `OrderExpired`, and no service binds it
(`credit-service/app/schemas/interop.py`).

## Credit replies - `foc.credit.events` (topic)

Publisher = Credit Service (`credit-service/app/services/publisher.py`).
Consumer = Order Service (its release, update, and approval consumers).
Routing key = event type; each reply echoes the request's `task_id`.

| Event | Replies to | Payload (`credit-service/app/schemas/interop.py`) | Effect on Order |
| ----- | ---------- | ------------------------------------------------- | --------------- |
| `CreditReleased` / `CreditReleaseFailed` | `OrderDeletionRequested`, `OrderCancellationRequested` | `event_type`, `task_id`, `order_id?`, `reservation_id`, `timestamp`, `reason?` | Finish the delete/cancel task |
| `CreditAmended` / `CreditAmendRejected` | `OrderUpdateRequested` | `event_type`, `task_id`, `order_id?`, `reservation_id`, `requester_id`, `amount`, `reason?` | Apply or reject the reward change |
| `CreditTransferSucceeded` / `CreditTransferFailed` | `OrderApprovalRequested` | `event_type`, `task_id`, `order_id`, `reservation_id`, `timestamp`, `reason?` (no requester/amount) | Complete or fail the approval |

## Supplier events - `foc.supplier.events` (topic)

Publisher = Supplier Service, via a transactional outbox + relay
(`supplier-service/app/services/event_worker.py`).
Consumer = Order Service (`order-service/app/services/supplier_consumer.py`).

| Event | Published when | Consumed by | Payload (`supplier-service/app/schemas/supplier_events.py`) | Effect |
| ----- | -------------- | ----------- | ----------------------------------------------------------- | ------ |
| `SupplierDeactivated` | Admin deactivates a supplier (F4.1.3) | Order Service | `event_type`, `event_id`, `supplier_id`, `timestamp` | Cancel the supplier's `OPEN` orders, each of which emits `OrderCancelled` |

### Order events consumed by Chat Service (N2H)

| Event (routing key) | Effect in Chat Service |
| --- | --- |
| `OrderAccepted` | Create the chat with requester + courier (labels `requester`/`courier`); after a withdrawal, add the new courier without earlier history. System message `order.accepted`. |
| `OrderPickedUp` | System message `order.picked_up` (creates the chat if it is missing). |
| `OrderDelivered` | System message `order.delivered` (creates the chat if it is missing). |
| `CourierWithdrawn` | System message `order.courier_withdrawn`; the courier is removed and loses access. |
| `OrderApproved` | The order-service's completion fact: system message `order.completed`, chat closed (read-only); kept, or deleted after `CHAT_CLOSED_RETENTION_DAYS` if set (default `0` = keep). |
| `OrderCancelled` | System message `order.cancelled` (with `reason`); chat closed (purge scheduled if retention is set). |
| `OrderExpired` | Chat closed if one exists (an expired order never had a courier). |
| `OrderCompleted` | Handled like `OrderApproved` if it is ever published (declared in `foc_shared`, not published today). |


## Chat events — `foc.chat.events` (topic)

| Routing key | Payload |
| --- | --- |
| `conversation.created`, `conversation.updated`, `conversation.closed` | conversation view (id, `unique_key`, `metadata`, members, ...) |
| `conversation.purged` | `conversation_id` |
| `member.added`, `member.removed` | `conversation_id`, `user_id` |
| `message.created`, `message.updated` | `message`, `member_ids` (recipients) |

## Task request/reply contract

The deletion, cancellation, update, and approval workflows are coordinated by
the Order Service as tasks.
Credit handles each request idempotently per `task_id` and always replies,
including for business rejections and for transient failures that exceed its
retry budget, so the Order Service saga never waits forever.

## Order event envelope

See `OrderEvent` in `foc_shared.events`:

- `event_type`, `order_id`, `requester_id`, `courier_id?`, `timestamp`,
  `reason?`, `order_name?`

Consumers that need more than these fields (for example a new status or the
reward amount) refetch from the owning service rather than widening the
envelope. Handlers are idempotent, so redelivery is safe: the Credit Service
keys on `task_id`, and the Notification Service keys on
`(event_id, recipient_id)`.
