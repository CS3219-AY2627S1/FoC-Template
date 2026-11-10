import { Router, type ErrorRequestHandler } from "express";
import { AppError } from "../errors/errors.js";
import { authenticateOrderSupplierService } from "../middleware/order-supplier-service-auth.middleware.js";
import { getSupplierById } from "../controllers/internal-supplier.controller.js";

const internalSupplierRouter = Router();

// Authenticate requests from the order-supplier-service using a shared secret token
internalSupplierRouter.use(authenticateOrderSupplierService);

// Error handler for invalid JSON body
const parseJsonError: ErrorRequestHandler = (error, _req, _res, next) => {
    next(
        error?.type === "entity.parse.failed"
            ? new AppError("Invalid JSON body", 400)
            : error,
    );
};
internalSupplierRouter.use(parseJsonError);

// Get one supplier's (full) information by providing its supplier id
internalSupplierRouter.get("/:supplierId", getSupplierById);

export default internalSupplierRouter;