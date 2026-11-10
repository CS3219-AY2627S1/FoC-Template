import { useQuery } from "@tanstack/react-query";
import type { OpenOrdersQueryParams, OpenOrdersQueryResponse } from "@/features/order/types/order.types";
import { getOpenRequestsService } from "@/features/order/services/order.courier.service";
import { courierOrderQueryKeys } from "@/features/order/hooks/courierOrderQueryKeys";
import type { ParsedError } from "@/utils/errorHandler";

export const useOpenOrders = (
    params: OpenOrdersQueryParams
) => {
    return useQuery<OpenOrdersQueryResponse, ParsedError>({
        queryKey: courierOrderQueryKeys.open(params),
        queryFn: () => getOpenRequestsService(params),
        placeholderData: (previousData) => previousData,
        refetchInterval: 10_000, // Refetch every 10 seconds
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    });
};
