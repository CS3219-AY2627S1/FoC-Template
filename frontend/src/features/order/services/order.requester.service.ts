import { ENDPOINTS } from "@/api/endpoints";
import type { Order, OrderRelatedUserDetails, RequesterOrderHistoryParams, RequesterOrderHistoryResponse } from "../types/order.types";
import { parseError } from "@/utils/errorHandler";
import type { ApiResponse } from "@/types/api.types";
import orderApi from "@/api/orderApi";
import authApi from "@/api/authApi";
import type { CreateRequestFormData } from "../schemas/create-request.schema";
import type { RenewRequestFormData } from "../schemas/renew-request.schema";

export const getRequesterOrderHistoryService = async (
    params: RequesterOrderHistoryParams,
): Promise<RequesterOrderHistoryResponse> => {
    try {
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams.set(key, String(value));
            }
        });

        const response = await orderApi.get<ApiResponse<RequesterOrderHistoryResponse>>(
            `${ENDPOINTS.order.getRequesterOrderHistory}?${queryParams.toString()}`
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const getUserByIdService = async (
    userId: string,
): Promise<OrderRelatedUserDetails> => {
    try {
        const response = await authApi.get<ApiResponse<OrderRelatedUserDetails>>(
            ENDPOINTS.user.getUserById(userId),
        );
        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const updateRequestService = async (
    orderId: string,
    payload: CreateRequestFormData & { expectedVersion: number },
): Promise<Order> => {
    try {
        const response = await orderApi.patch<ApiResponse<Order>>(
            ENDPOINTS.order.updateRequest(orderId),
            payload,
        );
        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const createRequestService = async (
    payload: CreateRequestFormData,
): Promise<Order> => {
    try {
        const response = await orderApi.post<ApiResponse<Order>>(
            ENDPOINTS.order.createRequest,
            payload,
        );
        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const receiveRequestService = async (
    orderId: string,
    expectedVersion: number
): Promise<Order> => {
    try {
        const response = await orderApi.post<ApiResponse<Order>>(
            ENDPOINTS.order.receiveRequest(orderId),
            { expectedVersion }
        );
        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const failedRequestService = async (
    orderId: string,
    payload: { expectedVersion: number, failureReason: string }
): Promise<Order> => {
    try {
        const response = await orderApi.post<ApiResponse<Order>>(
            ENDPOINTS.order.failedRequest(orderId),
            payload
        );
        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export async function cancelRequestService(
    orderId: string,
    payload: {
        expectedVersion: number;
        cancellationReason?: string;
    },
): Promise<Order> {
    try {
        const response = await orderApi.post<ApiResponse<Order>>(
            ENDPOINTS.order.cancelRequest(orderId),
            payload,
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
}

export async function renewRequestService(
    orderId: string,
    payload: RenewRequestFormData,
): Promise<Order> {
    try {
        const response = await orderApi.post<ApiResponse<Order>>(
            ENDPOINTS.order.renewRequest(orderId),
            payload,
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
}