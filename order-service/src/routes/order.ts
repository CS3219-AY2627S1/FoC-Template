import { Router } from "@oak/oak";
import { createOrder, fetchOrder, fetchOrders, updateOrderStatus } from "../controller/order.ts";
import { authenticationMiddleware } from "../middleware/auth.ts";
import { validateBody, validateQuery } from "../middleware/schema.ts";
import { createOrderSchema, listOrdersQuerySchema, updateOrderStatusSchema } from "../schema/order.ts";
import { recordOrderId } from "../telemetry/tracing.ts";

const router = new Router({ prefix: "/orders" });

// get a page of orders for a scope (open / requested / delivering / all), optionally filtered by status
router.get(
    "/",
    authenticationMiddleware(new Set()),
    validateQuery(listOrdersQuerySchema),
    fetchOrders
);

// get one order; visibility rules are in the controller
router.get(
    "/:id",
    authenticationMiddleware(new Set()),
    async (ctx, next) => {
        recordOrderId(ctx.params.id);
        await next();
    },
    async ctx => {
        await fetchOrder(ctx);
    }
);

// create an errand as the signed-in user
router.post(
    "/",
    authenticationMiddleware(new Set()),
    validateBody(createOrderSchema),
    createOrder
);

// move an order to another status; who may do what is checked in the controller
router.patch(
    "/:id/status",
    authenticationMiddleware(new Set()),
    async (ctx, next) => {
        recordOrderId(ctx.params.id);
        await next();
    },
    validateBody(updateOrderStatusSchema),
    async ctx => {
        await updateOrderStatus(ctx);
    }
);

export default router;
