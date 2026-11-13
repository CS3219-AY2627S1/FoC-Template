import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../errors.ts";
import { logger } from "../lib/logger.ts";

export const notFound: RequestHandler = (_req, _res, next) => {
    next(new AppError(404, "NOT_FOUND", "Route not found"));
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
        res.status(err.status).json({
            error: {
                code: err.code,
                message: err.message,
                details: err.details
            }
        });
        return;
    }

    // malformed json in request-body
    if (err?.type === "entity.parse.failed") {
        res.status(400).json({
            error: {
                code: "INVALID_JSON",
                message: "Malformed JSON body"
            }
        });
        return;
    }

    logger.error({ err }, "unhandled error");
    res.status(500).json({
        error: {
            code: "INTERNAL",
            message: "Internal server error"
        }
    });
};