import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../utils/httpError.ts";

export const notFoundHandler: RequestHandler = (_req, res) => {
    res.status(404).json({ status: 404, message: "Route not found" });
};

const errorHandling: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
        const body: Record<string, unknown> = { status: err.status, message: err.message };
        if (err.code) body.code = err.code;
        if (err.errors) body.errors = err.errors;
        res.status(err.status).json(body);
        return;
    }

    // Malformed JSON bodies etc. (raised by express.json) carry a 4xx status
    const status = (err as { status?: number }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
        res.status(status).json({ status, message: (err as Error).message });
        return;
    }

    console.error(err);
    res.status(500).json({ status: 500, message: "Internal server error" });
};

export default errorHandling;
