import { parseError } from "@/utils/errorHandler";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: (failureCount, error) => {
                const { statusCode } = parseError(error);
                if (statusCode >= 400 && statusCode < 500) return false;
                return failureCount < 2;
            },
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: false,
        },
    },
    queryCache: new QueryCache({
        onError: (error) => {
            toast.error(error.message ? error.message : "An unexpected error occurred. Please try again later.");
        },
    }),
});

export default queryClient;