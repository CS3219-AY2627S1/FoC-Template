type CreditOperations = {
    transfer(errandRef: string, courierId: string): Promise<void>;
    release(errandRef: string): Promise<void>;
};

export async function handleOrderEvent(value: unknown, operations: CreditOperations): Promise<void> {
    const event = value as { eventId?: unknown; type?: unknown; data?: { errandRef?: unknown; courierId?: unknown } } | null;
    if (typeof event?.eventId !== "string" || !event.eventId ||
        typeof event.data?.errandRef !== "string" || !event.data.errandRef ||
        !["order.errand.completed", "order.errand.cancelled", "order.errand.expired"].includes(String(event.type)) ||
        (event.type === "order.errand.completed" && (typeof event.data.courierId !== "string" || !event.data.courierId))) {
        throw new Error("MALFORMED_ORDER_EVENT");
    }
    if (event.type === "order.errand.completed") {
        await operations.transfer(event.data.errandRef, event.data.courierId as string);
    } else {
        await operations.release(event.data.errandRef);
    }
}
