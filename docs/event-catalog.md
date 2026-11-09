# Event Catalog

Canonical list of asynchronous events (project M6). Schemas live in
`shared/foc_shared/events.py` so all parties share one contract. Consumers must
handle redelivery **idempotently**.

Broker: RabbitMQ. The exchanges:

- `foc.user.events` (**fanout**) — published by User Service.
- `foc.order.events` (**topic**, routing key = event type) — published by
  Order Service (PR #5).
- `foc.credit.events` (**topic**) — Credit Service replies to order tasks.
- `foc.chat.events` (**topic**) — published by Chat Service (N2H), see below.
- `foc.chat.fanout` (**fanout**) — Chat Service internal: delivers socket frames
  to whichever chat-service replica holds the recipient's WebSocket.

## User events — `foc.user.events` (fanout)

| Event | Published when | Publisher | Consumed by | Payload (`foc_shared.events`) | Effect |
| ----- | -------------- | --------- | ----------- | ----------------------------- | ------ |
| `UserRegistered` | Email OTP verified (register → verify) | User Service, via a transactional outbox + background relay (`user-service/app/services/events.py`) | Credit Service (`credit-service/app/services/consumer.py`) | `event_type` (`"UserRegistered"`), `user_id`, `email`, `timestamp` (`UserRegisteredEvent`) | Provision the new account's initial balance (`INITIAL_CREDIT_ALLOCATION`, Credit F1.1). |

This is the one async flow already implemented on `main`: verification writes an
`event_outbox` row in the same transaction that sets `email_verified`, and the
relay publishes it to the fanout exchange (see
`user-service/docs/flowchart.md` §5).

## Order events — `foc.order.events` (topic)

Publisher = Order Service (**planned, PR #5**); consumers = Credit Service and
Notification Service. Routing key = event type.

| Event | Published when (backlog) | Consumed by | Effect |
| ----- | ------------------------ | ----------- | ------ |
| `OrderAccepted` | Courier accepts (F2.6.1) | Notification | Notify requester |
| `OrderPickedUp` | Courier picks up (F3.4.1) | Notification | Notify requester |
| `OrderDelivered` | Courier marks delivered (F3.1.1) | Notification | Notify requester |
| `OrderCompleted` | Requester approves / auto (F3.5.1) | Credit, Notification | Transfer credits; notify both |
| `OrderCancelled` | Requester cancels / supplier deactivation (F3.3.1, F4.1.3) | Credit, Notification | Release credits; notify |
| `CourierWithdrawn` | Courier withdraws (F3.2.2) | Credit, Notification | Keep credits reserved; notify requester |
| `OrderExpired` | Sweeper finds expired (F6.1.1) | Credit, Notification | Release credits; notify requester |
| `OrderDeletionRequested` | Requester deletes a pending order (F3.3) | Credit | Release credits; reply `CreditReleased` / `CreditReleaseFailed` |
| `OrderCancellationRequested` | Requester/supplier cancels (F3.3.1, F4.1.3) | Credit | Release credits; reply `CreditReleased` / `CreditReleaseFailed` |
| `OrderUpdateRequested` | Requester edits a pending order (reward may change) | Credit | Amend the reservation; reply `CreditAmended` / `CreditAmendRejected` |
| `OrderApprovalRequested` | Requester approves / auto-approval (F3.5.1) | Credit | Transfer the reservation to `courier_id`; reply `CreditTransferSucceeded` / `CreditTransferFailed` |

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

The deletion, cancellation, update and approval workflows are coordinated by the
Order Service as tasks. Each request carries a `task_id` that Credit echoes on the
definitive reply published to `foc.credit.events` (topic, routing key = event
type):

- `OrderDeletionRequested` / `OrderCancellationRequested` →
  `CreditReleased` or `CreditReleaseFailed`
- `OrderUpdateRequested` → `CreditAmended` or `CreditAmendRejected`
- `OrderApprovalRequested` → `CreditTransferSucceeded` or `CreditTransferFailed`
  (payload: `event_type`, `task_id`, `order_id`, `reservation_id`, `timestamp`,
  `reason?` — no requester/amount fields)

Credit handles requests idempotently per `task_id` and always replies —
including for business rejections and for transient failures that exceed its
retry budget — so the Order Service saga never waits forever.

## Order event envelope (scaffold)

See `OrderEvent` in `foc_shared.events`:

- `event_type`, `order_id`, `requester_id`, `courier_id?`, `timestamp`,
  `reason?`

TODO (team): finalize per-event payload fields (order name, new status, reward
amount) and whether ordering matters for each flow.
