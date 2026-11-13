import type { Optional } from "sequelize";

export const ORDER_STATUSES = [
    "OPEN",
    "ACCEPTED",
    "PICKED_UP",
    "COMPLETED",
    "CANCELLED",
    "EXPIRED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** A row of the `orders` table (response fields are snake_case, as documented). */
export interface OrderAttributes {
    order_id: string;
    requester_id: string;
    courier_id: string | null;
    status: OrderStatus;
    title: string;
    description: string;
    supplier_id: string;
    delivery_location: string;
    credit_amount: number;
    accept_by: Date;
    created_at: Date;
    accepted_at: Date | null;
    picked_up_at: Date | null;
    completed_at: Date | null;
    cancelled_at: Date | null;
    expired_at: Date | null;
}

export type OrderCreationAttributes = Optional<
    OrderAttributes,
    | "courier_id"
    | "status"
    | "description"
    | "created_at"
    | "accepted_at"
    | "picked_up_at"
    | "completed_at"
    | "cancelled_at"
    | "expired_at"
>;

/** Validated fields of POST /api/orders (after camelCase -> snake_case mapping). */
export interface NewOrderFields {
    title: string;
    description: string;
    supplier_id: string;
    delivery_location: string;
    credit_amount: number;
    accept_by: Date;
}

/** Event types the order service publishes to RabbitMQ. */
export const EVENT_TYPES = {
  ORDER_CREATED: "ORDER_CREATED", // notification service
  ORDER_ACCEPTED: "ORDER_ACCEPTED", // notification service
  ORDER_PICKED_UP: "ORDER_PICKED_UP", // notification service
  ORDER_CANCELLED: "ORDER_CANCELLED", // credit service: release the reservation
  ORDER_COMPLETED: "ORDER_COMPLETED", // credit service: transfer requester -> courier
  ORDER_EXPIRED: "ORDER_EXPIRED", // credit service: release the reservation
} as const;
export type OrderEventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** The fields of an order that go into an event. */
export interface EventOrderFields {
    order_id: string;
    requester_id: string;
    courier_id: string | null;
    credit_amount: number;
    /** for human-readable notifications; absent on compensation events */
    title?: string | null;
}

/** Envelope from the "Example event" in the project doc. */
export interface OrderEvent {
    event_id: string;
    event_type: OrderEventType;
    timestamp: string;
    data: EventOrderFields;
}

export interface OutboxEventAttributes {
    event_id: string;
    event_type: OrderEventType;
    payload: OrderEvent;
    created_at: Date;
    published_at: Date | null;
}

export type OutboxEventCreationAttributes = Optional<
    OutboxEventAttributes,
    "created_at" | "published_at"
>;