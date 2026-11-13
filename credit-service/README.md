# Credit Service

Manages credit accounts, reservations, payments, and refunds. Consumes User and Order events through SQS and publishes payment and refund facts through SNS.

Production requires `AWS_REGION`, `EVENTS_MESSAGING_TOPIC_ARN`, and `EVENTS_MESSAGING_QUEUE_NAME`. Production SNS/SQS provisioning, permissions, and runtime wiring are added separately in [deployment PR #42](https://github.com/AY2627S1-CS3219-P24/FoC/pull/42).

## Event flow

| Input | Application operation | Published event |
| --- | --- | --- |
| `UserCreatedEvent` | `CreditAccountService.initializeAccount` | None |
| `ErrandCompletedEvent` | `CreditPaymentService.transferReservedCredits` | `CreditPaidEvent` or `CreditPaymentDeclinedEvent` |
| `ErrandCancelledEvent` / `ErrandExpiredEvent` | `CreditRefundService.releaseReservedCredits` | `CreditRefundedEvent` or `CreditRefundDeclinedEvent` |

Each integration contract and SNS publisher has its own file. Payment and refund share the existing Credit SNS topic and Order SQS queue. Order Service handles each event through a dedicated operation.

Success is represented by the event type. Declined events carry the existing reason: `RESERVATION_MISMATCH`, `NO_RESERVATION`, or `TERMINAL_CONFLICT`. Database and transport failures still retry rather than emitting a declined event.

`CreditReservedEvent`, `CreditPaymentAppliedEvent`, and `CreditRefundAppliedEvent` are local audit facts. They run synchronously inside the credit transaction. Replayed Order events publish another confirmation without repeating the balance update or audit insert. SNS publication remains durable and runs after commit.

This replaces the former `CreditSettlementResultEvent` wire contract. Deploy Order Service, Credit Service, and the updated SNS subscription filter together. Drain pending old-format messages and publications before upgrading; this refactor does not migrate stored messages.

## Tests

With Docker running, from the repository root:

```bash
./gradlew :credit-service:test
```

Cross-service tests: [e2e-tests](../e2e-tests/README.md).
