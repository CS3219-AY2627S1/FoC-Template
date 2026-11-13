import express, { type Express } from "express";
import orderRoutes from "./routes/order.route.ts";
import { logger } from "./lib/logger.ts";
import { AppError } from "./errors.ts";
import { createInternalRouter } from "./controllers/internal.controller.ts";
import { OrderModel } from "./models/order.model.ts";

export function createApp(): Express {
    const app = express();

    app.use(express.json());

    // Request logging middleware
    app.use((req, _res, next) => {
        logger.debug({ method: req.method, url: req.url }, "incoming request");
        next();
    });

    // Health check endpoint
    app.get("/health", (_req, res) => {
        res.status(200).json({ status: "healthy", service: "order-service" });
    });

    // Routes
    app.use("/orders", orderRoutes);
    app.use("/internal", createInternalRouter(OrderModel.findById));

    // Global Error Handler (prevents leaking raw error messages in 500 responses)
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (err instanceof AppError) {
            res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
            return;
        }
        if (err?.type === "entity.parse.failed") {
            res.status(400).json({ error: { code: "INVALID_JSON", message: "Malformed JSON body" } });
            return;
        }
        logger.error({ err }, "Unhandled application error");
        res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    });

    return app;
}
