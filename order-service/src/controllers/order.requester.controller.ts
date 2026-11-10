import type { Response } from "express";
import { cancelRequestSchema, createRequestSchema, failRequestSchema, receiveRequestSchema, renewExpiredRequestSchema, requesterOrderHistoryQuerySchema, updateRequestSchema, } from "../schemas/order.requester.schema.js";
import { cancelRequestService, createRequestService, failRequestService, getRequesterOrderHistoryService, receiveRequestService, renewExpiredRequestService, updateRequestService } from "../services/order.requester.service.js";
import { AppError } from "../errors/errors.js";
import type { AuthRequest } from "../types/auth.types.js";

export async function getRequesterOrderHistory(
    req: AuthRequest,
    res: Response,
) {
    const requesterId = req.user!.userId;
    if (!requesterId) {
        throw new AppError("Authentication required", 401);
    }

    const query = req.query;

    const parsedQuery = requesterOrderHistoryQuerySchema.safeParse(query);
    if (!parsedQuery.success) {
        throw new AppError(parsedQuery.error.issues.at(0)?.message || "Invalid query", 400);
    }

    const result = await getRequesterOrderHistoryService(requesterId, parsedQuery.data);

    res.status(200).json({
        success: true,
        message: "Requester order history retrieved successfully",
        data: {
            orders: result.orders,
            pagination: result.pagination,
        },
    });
};

export async function updateRequest(
    req: AuthRequest,
    res: Response
) {
    const requesterId = req.user!.userId;
    if (!requesterId) {
        throw new AppError("Authentication required", 401);
    }

    const orderId = req.params.orderId;
    if (typeof orderId !== "string" || !orderId) {
        throw new AppError("Order id is required", 400);
    }

    const parsedBody = updateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
        throw new AppError(parsedBody.error.issues.at(0)?.message || "Invalid request", 400);
    }

    const order = await updateRequestService(
        requesterId, orderId, parsedBody.data
    );

    res.status(200).json({
        success: true,
        message: "Order updated successfully",
        data: order,
    });
};

export async function createRequest(
    req: AuthRequest,
    res: Response,
) {
    const requesterId = req.user!.userId;
    const requestBody = createRequestSchema.safeParse(req.body);
    if (!requestBody.success) {
        throw new AppError(requestBody.error.issues.at(0)?.message || "Invalid request", 400);
    }

    const order = await createRequestService(requesterId, requestBody.data);

    res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: order,
    });
};

export async function receiveRequest(
    req: AuthRequest,
    res: Response
) {
    const requesterId = req.user!.userId;
    if (!requesterId) {
        throw new AppError("Authentication required", 401);
    }

    const orderId = req.params.orderId;
    if (typeof orderId !== "string" || !orderId) {
        throw new AppError("Order id is required", 400);
    }

    const requestBody = receiveRequestSchema.safeParse(req.body);
    if (!requestBody.success) {
        throw new AppError(requestBody.error.issues.at(0)?.message || "Invalid request", 400);
    }

    const order = await receiveRequestService(requesterId, orderId, requestBody.data);

    res.status(200).json({
        success: true,
        message: "Order marked as received successfully",
        data: order,
    });
}

export async function failRequest(
    req: AuthRequest,
    res: Response
) {
    const requesterId = req.user!.userId;
    if (!requesterId) {
        throw new AppError("Authentication required", 401);
    }

    const orderId = req.params.orderId;
    if (typeof orderId !== "string" || !orderId) {
        throw new AppError("Order id is required", 400);
    }

    const requestBody = failRequestSchema.safeParse(req.body);
    if (!requestBody.success) {
        throw new AppError(requestBody.error.issues.at(0)?.message || "Invalid request", 400);
    }

    const order = await failRequestService(requesterId, orderId, requestBody.data);

    res.status(200).json({
        success: true,
        message: "Order marked as failed successfully",
        data: order,
    });
}

export async function cancelRequest(
    req: AuthRequest,
    res: Response
) {
    const requesterId = req.user!.userId;
    if (!requesterId) {
        throw new AppError("Authentication required", 401);
    }

    const orderId = req.params.orderId;
    if (typeof orderId !== "string" || !orderId) {
        throw new AppError("Order id is required", 400);
    }

    const requestBody = cancelRequestSchema.safeParse(req.body);
    if (!requestBody.success) {
        throw new AppError(requestBody.error.issues.at(0)?.message || "Invalid request", 400);
    }

    const order = await cancelRequestService(requesterId, orderId, requestBody.data);

    res.status(200).json({
        success: true,
        message: "Order marked as canceled successfully",
        data: order,
    });
}

export async function renewExpiredRequest(
    req: AuthRequest,
    res: Response
) {
    const requesterId = req.user!.userId;
    if (!requesterId) {
        throw new AppError("Authentication required", 401);
    }

    const orderId = req.params.orderId;
    if (typeof orderId !== "string" || !orderId) {
        throw new AppError("Order id is required", 400);
    }

    const requestBody = renewExpiredRequestSchema.safeParse(req.body);
    if (!requestBody.success) {
        throw new AppError(requestBody.error.issues.at(0)?.message || "Invalid request", 400);
    }

    const order = await renewExpiredRequestService(requesterId, orderId, requestBody.data);

    res.status(200).json({
        success: true,
        message: "Order renewed successfully",
        data: order,
    });
}
