import type { CourierOrderHistoryParams, OpenOrdersQueryParams } from "@/features/order/types/order.types";

export const courierOrderQueryKeys = {
    all: ["courierOrder"] as const,
    history: (userId: string, params: CourierOrderHistoryParams) =>
        [...courierOrderQueryKeys.all, "history", userId, params] as const,
    open: (params: OpenOrdersQueryParams) =>
        [...courierOrderQueryKeys.all, "open", params] as const,
};
