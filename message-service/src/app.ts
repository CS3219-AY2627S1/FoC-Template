import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";

import cookieParser from "cookie-parser";
import { logger } from "./lib/logger.ts";
import { cookieHttpMiddleware } from "./middleware/auth.ts";
import { healthRouter } from "./routes/health.routes.ts";
import messagesRouter from "./routes/messages.routes.ts";

export function createApp() {
    const app = express();

    app.use(helmet());
    app.use(express.json({ limit: "10kb" }));
    app.use(cookieParser());


    app.use(healthRouter);
    app.use("/messages", cookieHttpMiddleware("member"), messagesRouter);

    // Every answer is JSON in the shared error shape, also for a body that is not JSON or too large
    // and for a database error, instead of Express's HTML error page.
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const status = (err as { status?: number }).status;
        if (status === 400 || status === 413) {
            res.status(status).json({ error: { code: status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON", message: "The request body could not be read" } });
            return;
        }
        logger.error({ err }, "request failed");
        res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong, try again later" } });
    });

    return app;
}
