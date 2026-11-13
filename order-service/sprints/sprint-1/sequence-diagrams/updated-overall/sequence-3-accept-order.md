# Sequence 3: Accept an order after Credit records the courier

> CHANGE-068 / ADR-017. The Credit route shown is proposed in FEEDBACK-004. Only the Order-side mock and HTTP contract stub exist; the Credit provider endpoint is not implemented or verified.

```mermaid
sequenceDiagram
    actor Courier
    participant API as OrderController
    participant User as UserServicePort
    participant Assignment as OrderAssignmentService
    participant Orders as OrderRepository
    participant Credit as CreditServicePort
    participant Checkpoints as OrderCheckpointRepository
    participant Receipts as CommandReceiptRepository

    Courier->>API: accept(commandId, orderId, courierId, expectedVersion)
    API->>User: verifyCourier(courierId, authorization)
    User-->>API: verified courierId
    API->>Assignment: accept(...)
    Assignment->>Receipts: findExisting(ACCEPT, commandId)
    alt command already completed
        Receipts-->>Assignment: prior receipt
        Assignment->>Orders: get(prior orderId)
        Orders-->>Assignment: existing Order
        Assignment-->>API: existing result
        API-->>Courier: accepted Order response
    else new command
        Assignment->>Orders: getForUpdate(orderId)
        Orders-->>Assignment: locked OPEN Order
        Assignment->>Assignment: validate version, OPEN, unassigned, not requester, not expired
        Assignment->>Credit: assignCourier(orderId, courierId)
        Note over Credit: Proposed PUT /api/credits/orders/{orderId}/courier-assignment
        alt Credit confirms assignment and Order is still unexpired
            Credit-->>Assignment: 200 OK; assignment recorded
            Assignment->>Assignment: recheck expiry and validate acceptance
            Assignment->>Assignment: transition Order to ACCEPTED
            Assignment->>Checkpoints: save ACCEPTED checkpoint
            Assignment->>Orders: save Order
            Assignment->>Receipts: save command receipt
            Assignment-->>API: accepted Order
            API-->>Courier: accepted Order response
        else Credit rejects/unavailable/mismatched response or expiry passed during call
            Credit-->>Assignment: error, invalid response, or late success
            Note over Assignment,Orders: Transaction fails; no ACCEPTED status, checkpoint, or receipt is saved.
            Assignment-->>API: dependency/conflict error
            API-->>Courier: error; Order remains OPEN
        end
    end
```

The local mock requires an active reservation, prevents conflicting courier assignments, and treats an identical command retry as idempotent. The proposed HTTP response must match Order ID, requester ID, courier ID, amount, and `RESERVED` status. Credit and Order do not share a database transaction: the real provider must define safe retry/reconciliation if Credit records the courier but Order later fails to commit. Trusted service authentication remains open.
