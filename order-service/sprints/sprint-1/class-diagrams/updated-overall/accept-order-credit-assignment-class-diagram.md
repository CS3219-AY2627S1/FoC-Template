# Accept Order with Credit courier assignment

> CHANGE-069 / ADR-018 refine CHANGE-068 / ADR-017. Credit has not implemented or verified the HTTP operation.

```mermaid
classDiagram
    class OrderAssignmentService {
        -OrderRepository orders
        -OrderCheckpointRepository checkpoints
        -CommandReceiptRepository receipts
        -UserServicePort users
        -CreditServicePort credits
        -OrderAuditLogger audit
        +accept(commandId, orderId, courierId, version, authorization) Order
    }

    class Order {
        +validateAcceptance(courierId, expectedVersion, now)
        +accept(courierId, expectedVersion, now)
    }

    class CreditServicePort {
        <<interface>>
        +assignCourier(orderId, courierId, authorization)
    }

    class MockPeerAdapters {
        +assignCourier(orderId, courierId, authorization)
        +reservationCourier(orderId) String
    }

    class HttpPeerAdapters {
        +assignCourier(orderId, courierId, authorization)
    }

    class CreditCourierAssignmentRequest {
        +String courierId
    }

    OrderAssignmentService --> OrderRepository : lock/read/save
    OrderAssignmentService --> OrderCheckpointRepository : save after confirmation
    OrderAssignmentService --> CommandReceiptRepository : save after confirmation
    OrderAssignmentService --> UserServicePort : verify courier
    OrderAssignmentService --> CreditServicePort : wait for assignment
    OrderAssignmentService --> Order : validate before and after call; mutate after success
    CreditServicePort <|.. MockPeerAdapters
    CreditServicePort <|.. HttpPeerAdapters
    HttpPeerAdapters ..> CreditCourierAssignmentRequest : sends
```

The request sends `orderId` in the path and only `courierId` in its body; synchronous success requires `200 OK`. The local adapter is selected by the mock-peer configuration. The HTTP adapter uses the proposed FEEDBACK-004 route. Trusted service authentication requires Credit-owner agreement.
