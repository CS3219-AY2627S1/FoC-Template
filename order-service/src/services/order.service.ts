import type { OrderModel, Order, OrderStatus, AdminOrders } from "../models/order.model.ts";
import { CreateOrderSchema } from "../schemas/order.schema.ts";
import { fieldErrorsOf, validationError, type FieldErrors } from "../util/validation.ts";
import { AppError } from "../errors.ts";
import type { createServiceClients } from "./clients.ts";

export const SYSTEM_ACTOR = "system";

export type Role = "requester" | "courier" | "admin";

// The transitions a participant may instruct, by current state. Open to Accepted goes through
// acceptOrder because it also assigns the courier; Open to Expired is only done by the system.
const USER_TRANSITIONS: Partial<Record<OrderStatus, { to: OrderStatus; by: Role }[]>> = {
    Open: [{ to: "Cancelled", by: "requester" }],
    Accepted: [{ to: "PickedUp", by: "courier" }, { to: "Cancelled", by: "requester" }],
    PickedUp: [{ to: "Delivered", by: "courier" }],
    Delivered: [{ to: "Completed", by: "requester" }],
};

function participantOf(order: Order, role: Role): string | null {
    return role === "requester" ? order.requester_id : order.courier_id;
}

export function allowedTransitions(order: Order, accountId: string): OrderStatus[] {
    return (USER_TRANSITIONS[order.status] ?? [])
        .filter((rule) => participantOf(order, rule.by) === accountId)
        .map((rule) => rule.to);
}

// Pending waits for its credit reservation and Rejected never got one, so neither is an errand.
export function isErrand(order: Order): boolean {
    return order.status !== "Pending" && order.status !== "Rejected";
}

function notFound(): AppError {
    return new AppError(404, "ORDER_NOT_FOUND", "No errand with this id");
}

function notOpen(): AppError {
    return new AppError(409, "ORDER_NOT_AVAILABLE", "This errand is no longer open");
}

const ADMIN_CANCELLABLE: OrderStatus[] = ["Open", "Accepted", "PickedUp", "Delivered"];

export function createOrderService(model: typeof OrderModel, clients: ReturnType<typeof createServiceClients>) {
    async function findErrand(orderId: number): Promise<Order> {
        const order = await model.findById(orderId);
        if (!order || !isErrand(order)) throw notFound();
        return order;
    }

    return {
        async createOrder(requesterId: string, body: unknown, cookie: string): Promise<Order> {
            const raw = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
            const parsed = CreateOrderSchema.safeParse(raw);
            const fields: FieldErrors = parsed.success ? {} : fieldErrorsOf(parsed.error);

            // The supplier is only asked once both values it needs are valid, so a refusal
            // still names every field that is wrong.
            if (!fields.neededByTime && new Date(String(raw.neededByTime)) <= new Date()) {
                fields.neededByTime = ["must be in the future"];
            }
            if (!fields.supplierId && !fields.neededByTime) {
                const supplier = await clients.supplierAvailability(String(raw.supplierId).trim(), String(raw.neededByTime), cookie);
                if (!supplier) fields.supplierId = ["does not exist"];
                else if (!supplier.active) fields.supplierId = ["is inactive"];
                else if (!supplier.open) fields.supplierId = ["is closed at the needed-by time"];
            }
            if (!parsed.success || Object.keys(fields).length > 0) throw validationError(fields);

            const input = parsed.data;
            // The browser showed this walk before posting, but the stored one is measured here, so a
            // client cannot send a distance of its own.
            const route = await clients.walkingRoute(
                input.supplierId,
                { latitude: input.deliveryLatitude, longitude: input.deliveryLongitude },
                cookie,
            );
            const newOrder = await model.create({ requesterId, ...input, route });
            try {
                await clients.reserve(requesterId, String(newOrder.id), input.creditReward, cookie);
            } catch (error) {
                // A timed-out reservation may still succeed remotely. Rejected queues a release under
                // the same errand reference, which credit-service applies even if it arrives first.
                await model.updateStatus(newOrder.id, "Rejected", "Pending", SYSTEM_ACTOR);
                throw error;
            }
            const opened = await model.updateStatus(newOrder.id, "Open", "Pending", requesterId);
            if (!opened) throw new AppError(409, "ORDER_CREATION_FAILED", "The errand could not be opened, try again");
            return opened;
        },

        async getOpenRequests(accountId: string): Promise<Order[]> {
            return await model.findOpenRequests(accountId);
        },

        // Anyone may look at an Open errand, since couriers browse them. Once it is taken, only
        // its requester and courier see it, and everyone else is told it does not exist.
        async getOrderById(orderId: number, accountId: string) {
            const order = await findErrand(orderId);
            const participant = order.requester_id === accountId || order.courier_id === accountId;
            if (!participant && order.status !== "Open") throw notFound();
            return { ...order, allowed_transitions: allowedTransitions(order, accountId) };
        },

        // no isErrand filter so that failed orders are visible too
        async getOrderForAdmin(orderId: number) {
            const order = await model.findById(orderId);        
            if (!order) throw notFound();
            return order;                                      
        },


        async acceptOrder(orderId: number, courierId: string): Promise<Order> {
            const order = await findErrand(orderId);
            if (order.requester_id === courierId) {
                throw new AppError(403, "OWN_ERRAND", "You cannot accept your own errand");
            }
            if (order.status !== "Open" || new Date(order.needed_by_time) <= new Date()) throw notOpen();

            // Of simultaneous acceptances only one matches the conditional update.
            const updatedOrder = await model.acceptOrder(orderId, courierId);
            if (!updatedOrder) throw notOpen();
            return updatedOrder;
        },

        async getMyOrders(accountId: string) {
            const orders = await model.findByParticipant(accountId);
            return orders.map((order) => ({
                ...order,
                role: (order.requester_id === accountId ? "requester" : "courier") as Role,
                allowed_transitions: allowedTransitions(order, accountId),
            }));
        },

        async getAllOrders(page=1, pageSize=10, q='', status=''): Promise<AdminOrders> {
            // default to page 1/pageSize 10 if value not valid
            const validPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1
            const validSize = Number.isFinite(pageSize) ? Math.min(100, Math.floor(pageSize)) : 10

            const {orders, total} = await model.findAllOrders(validPage, validSize, q, status)

            return { orders, page: validPage, pageSize: validSize, total }
        },

        async updateOrderStatus(orderId: number, userId: string, newStatus: OrderStatus): Promise<Order> {
            const order = await findErrand(orderId);

            // A repeated confirmation or cancellation answers with the unchanged errand.
            if (order.status === newStatus && ["Completed", "Cancelled"].includes(newStatus) && order.requester_id === userId) {
                return order;
            }

            const current = order.status;
            const rule = USER_TRANSITIONS[current]?.find((candidate) => candidate.to === newStatus);
            if (!rule) {
                throw new AppError(409, "INVALID_STATE_TRANSITION", `An errand that is ${current} cannot become ${newStatus}`);
            }
            if (participantOf(order, rule.by) !== userId) {
                throw new AppError(403, "NOT_ALLOWED", `Only the ${rule.by} can make this errand ${newStatus}`);
            }

            const updated = await model.updateStatus(orderId, newStatus, current, userId);
            if (!updated) throw new AppError(409, "STATE_CHANGED", "The errand changed in the meantime, reload it");
            return updated;
        },


        async adminCancelOrder(orderId: number, adminId: string): Promise<Order> {
            const order = await model.findById(orderId);
            if (!order) throw notFound();
            if (order.status === "Cancelled") return order;     // repeating it is safe
            if (!ADMIN_CANCELLABLE.includes(order.status)) {
                // Completed has already paid the courier, so it cannot be undone from here
                throw new AppError(409, "INVALID_STATE_TRANSITION", `An errand that is ${order.status} cannot be cancelled`);
            }
            const updated = await model.updateStatus(orderId, "Cancelled", order.status, adminId);
            if (!updated) throw new AppError(409, "STATE_CHANGED", "The errand changed in the meantime, reload it");
            return updated;
        },
    };
}
