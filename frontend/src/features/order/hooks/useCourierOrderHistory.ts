import { useQuery } from "@tanstack/react-query";
import type { CourierOrderHistoryParams, CourierOrderHistoryResponse } from "@/features/order/types/order.types";
import { getCourierOrderHistoryService } from "@/features/order/services/order.courier.service";
import { courierOrderQueryKeys } from "@/features/order/hooks/courierOrderQueryKeys";
import type { ParsedError } from "@/utils/errorHandler";
import useAuth from "@/hooks/useAuth";

export const useCourierOrderHistory = (
    params: CourierOrderHistoryParams
) => {
    const { user } = useAuth();
    const userId = user?.id;

    return useQuery<CourierOrderHistoryResponse, ParsedError>({
        queryKey: courierOrderQueryKeys.history(userId ?? "", params),
        queryFn: () => getCourierOrderHistoryService(params),
        enabled: Boolean(userId), // Only run the query if userId is available
        placeholderData: (previousData, previousQuery) =>
            previousQuery?.queryKey[1] === userId
                ? previousData
                : undefined, // Only use previous data if the userId matches
        refetchInterval: 10_000, // Refetch every 10 seconds
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    });
};
