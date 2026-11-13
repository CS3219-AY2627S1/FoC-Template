// src/rabbitmq/events.ts
// The wire contract with the credit service. It matches what credit-service actually
// consumes and publishes (src/queue/impl/*.ts there), so do not rename anything here
// without changing the credit service too.

export const EXCHANGE = "app.events"; // durable topic exchange, declared by both services

export const ROUTING = {
    // Order -> Credit
    orderCreated: "order.created", // ask Credit to hold the bounty
    orderAccepted: "order.accepted", // a courier accepted: tell Credit who will be paid
    orderReleased: "order.completed", // delivered: Credit pays the courier from the hold
    orderRefunded: "order.cancelled", // cancelled / expired / rejected: Credit gives the hold back
    // Credit -> Order
    creditsHeld: "credits.held",
    creditsHoldRejected: "credits.hold.rejected",
    creditsAccepted: "credits.accepted",
    creditsAcceptedRejected: "credits.accepted.rejected",
    creditsReleased: "credits.released",
    creditsReleasedRejected: "credits.released.rejected",
    creditsRefunded: "credits.refunded",
    creditsRefundedRejected: "credits.refunded.rejected",
} as const;

/** One row of the outbox table: what gets published to `topic` once the transaction commits. */
export interface OutboxEvent {
    topic: string;
    type: string;
    payload: Record<string, string | number | null>;
}

interface OrderRef {
    id: string;
    requesterId: number;
    courierId: number | null;
    creditBounty: number;
}

// "requestor" (with an o) is how the contract spells it
export const orderCreatedEvent = (o: OrderRef): OutboxEvent => ({
    topic: ROUTING.orderCreated,
    type: "orderCreated",
    payload: { errandId: o.id, requestorId: o.requesterId, courierId: o.courierId, amount: o.creditBounty },
});

// sent when a courier accepts, so Credit records who to pay when the errand is delivered
export const orderAcceptedEvent = (o: OrderRef): OutboxEvent => ({
    topic: ROUTING.orderAccepted,
    type: "orderAccepted",
    payload: { errandId: o.id, courierId: o.courierId },
});

// courierId and amount are extra for now: Credit only reads errandId today
export const orderReleasedEvent = (o: OrderRef): OutboxEvent => ({
    topic: ROUTING.orderReleased,
    type: "orderCompleted",
    payload: { errandId: o.id, courierId: o.courierId, amount: o.creditBounty },
});

export const orderRefundedEvent = (o: OrderRef): OutboxEvent => ({
    topic: ROUTING.orderRefunded,
    type: "orderCancelled",
    payload: { errandId: o.id },
});

// Credit -> Order
export interface CreditsHeldEvent { errandId: string; occurredAt: string }
export interface CreditsRejectionEvent { errandId: string; reason: string; occurredAt: string }