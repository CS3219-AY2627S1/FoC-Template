import type { RequesterOrderHistoryParams, RequesterOrderHistoryResponse } from "@/features/order/types/order.types";
import { useQuery } from "@tanstack/react-query";
import { getRequesterOrderHistoryService } from "@/features/order/services/order.requester.service";
import type { ParsedError } from "@/utils/errorHandler";
import { requesterOrderHistoryQueryKeys } from "./requesterOrderQueryKeys";
import useAuth from "@/hooks/useAuth";

export const useRequesterOrderHistory = (
    params: RequesterOrderHistoryParams
) => {
    const { user } = useAuth();
    const userId = user?.id;

    return useQuery<RequesterOrderHistoryResponse, ParsedError>({
        queryKey: requesterOrderHistoryQueryKeys.history(userId ?? "", params),
        queryFn: () => getRequesterOrderHistoryService(params),
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
