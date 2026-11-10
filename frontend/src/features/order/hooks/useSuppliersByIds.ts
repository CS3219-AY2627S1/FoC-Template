import { useQuery } from "@tanstack/react-query";
import { getSuppliersByIdsService } from "@/features/supplier/services/supplier.service";

export function useSuppliersByIds(ids: string[]) {
    const uniqueIds = [...new Set(ids)].sort();

    return useQuery({
        queryKey: ["suppliers", "by-ids", uniqueIds],
        queryFn: () => getSuppliersByIdsService(uniqueIds),
        enabled: uniqueIds.length > 0,
    });
}