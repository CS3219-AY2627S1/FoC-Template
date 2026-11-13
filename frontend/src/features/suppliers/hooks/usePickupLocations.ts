import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { listSuppliers } from '../api/suppliers.api'
import { formatLocation } from '../utils/supplierFormat'
import { supplierKeys } from './useSuppliers'

export const usePickupLocations = (enabled: boolean) =>
  useQuery({
    queryKey: supplierKeys.list({}),
    queryFn: () => listSuppliers({}),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
    select: (suppliers) =>
      suppliers
        .filter((supplier) => supplier.active)
        .map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          address:
            [formatLocation(supplier), supplier.locationDescription]
              .filter(Boolean)
              .join(' · ') || supplier.name,
        })),
  })
