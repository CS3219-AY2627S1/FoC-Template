import type { RequesterOrderHistoryParams } from "../types/order.types";

export const requesterOrderHistoryQueryKeys = {
    all: ["requesterOrderHistory"] as const,
    history: (userId: string, params: RequesterOrderHistoryParams) =>
        [...requesterOrderHistoryQueryKeys.all, "history", userId, params] as const,
};
