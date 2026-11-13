import { Router } from "express";
import type { Order } from "../models/order.model.ts";
import { isErrand } from "../services/order.service.ts";

type FindOrder = (id: number) => Promise<Order | null>;

// Reads for the other services. The web-client gateway only forwards /orders, so these paths
// are reachable inside compose and the cluster but not from the browser.
export function createInternalRouter(findOrder: FindOrder): Router {
    const router = Router();

    router.get("/orders/:id", async (req, res, next) => {
        try {
            // Postgres integer ids end at 2^31 - 1; anything else cannot name an errand.
            const id = /^\d{1,10}$/.test(req.params.id) ? Number(req.params.id) : NaN;
            const order = id <= 2_147_483_647 ? await findOrder(id) : null;
            if (!order || !isErrand(order)) {
                res.status(404).json({ error: "ORDER_NOT_FOUND" });
                return;
            }
            res.status(200).json({
                id: String(order.id),
                requesterId: order.requester_id,
                courierId: order.courier_id,
                status: order.status,
            });
        } catch (err) {
            next(err);
        }
    });

    return router;
}