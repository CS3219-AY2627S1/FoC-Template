import type { NextFunction, Request, Response } from "express";
import { createOrderService } from "../services/order.service.ts";
import { OrderModel } from "../models/order.model.ts";
import { createServiceClients } from "../services/clients.ts";
import { StatusBody } from "../schemas/order.schema.ts";
import { fieldErrorsOf, validationError } from "../util/validation.ts";
import { AppError } from "../errors.ts";
import { config } from "../config.ts";

const OrderService = createOrderService(OrderModel, createServiceClients(config.SUPPLIER_SERVICE_URL, config.CREDIT_SERVICE_URL));


// Express 4 does not pass a rejected promise to the error handler by itself.
type Handler = (req: Request, res: Response) => Promise<void>;
const handle = (handler: Handler) => (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
};

function orderIdOf(req: Request): number {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) {
        throw new AppError(404, "ORDER_NOT_FOUND", "No errand with this id");
    }
    return id;
}

// The auth middleware in front of these routes always sets res.locals.accountId.
export const OrderController = {
    // POST /orders
    createOrder: handle(async (req, res) => {
        const order = await OrderService.createOrder(res.locals.accountId, req.body, req.headers.cookie ?? "");
        res.status(201).json({ data: order });
    }),

    // GET /orders/admin
    getAllOrders: handle(async (req, res) => {
        const page = Number(req.query.page ?? 1)
        const pageSize = Number(req.query.pageSize ?? 10)
        const q = String(req.query.q ?? '')
        const status = String(req.query.status ?? '')

        const result = await OrderService.getAllOrders(
            page,
            pageSize,
            q,
            status,
        )

        res.status(200).json({ data: result })
    }),

    // GET /orders/open
    getOpenRequests: handle(async (_req, res) => {
        res.status(200).json({ data: await OrderService.getOpenRequests(res.locals.accountId) });
    }),

    // GET /orders/mine
    getMyOrders: handle(async (_req, res) => {
        const accountId: string = res.locals.accountId;
        res.status(200).json({ data: await OrderService.getMyOrders(accountId), accountId });
    }),

    // GET /orders/:id
    getOrderById: handle(async (req, res) => {
        res.status(200).json({ data: await OrderService.getOrderById(orderIdOf(req), res.locals.accountId) });
    }),

    // POST /orders/:id/accept
    acceptOrder: handle(async (req, res) => {
        res.status(200).json({ data: await OrderService.acceptOrder(orderIdOf(req), res.locals.accountId) });
    }),

    // PATCH /orders/:id/status
    updateStatus: handle(async (req, res) => {
        const orderId = orderIdOf(req);
        const parsed = StatusBody.safeParse(req.body);
        if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
        res.status(200).json({ data: await OrderService.updateOrderStatus(orderId, res.locals.accountId, parsed.data.status) });
    }),

    // GET /admin/:id
    getOrderForAdmin: handle(async (req, res) => {
        res.status(200).json({ data: await OrderService.getOrderForAdmin(orderIdOf(req))})
    }),

    // PATCH /admin/:id/cancel
    adminCancelOrder: handle(async (req, res) => {
    const order = await OrderService.adminCancelOrder(
        orderIdOf(req),
        res.locals.accountId as string,
    );
    res.status(200).json({ data: order });
}),
};
