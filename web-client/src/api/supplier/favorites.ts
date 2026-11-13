import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/http'
import { supplierKeys } from './suppliers'
import type { SupplierFavorites, SupplierFilters } from './types'

// Outside the hook, so React Query keeps the same Set while the answer does not change.
const toSet = (favorites: SupplierFavorites) => new Set(favorites.supplierIds)

// One small request for the whole page, not one per row.
export function useFavoriteSupplierIds() {
  return useQuery({
    queryKey: supplierKeys.favorites,
    queryFn: ({ signal }) => request<SupplierFavorites>('supplier', '/suppliers/favorites', { signal }),
    select: toSet,
  })
}

// The heart changes at once and goes back if the supplier-service refuses, so a tap never waits on
// the network.
export function useSetFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      request<void>('supplier', `/suppliers/${id}/favorite`, { method: favorite ? 'PUT' : 'DELETE' }),
    onMutate: async ({ id, favorite }) => {
      await queryClient.cancelQueries({ queryKey: supplierKeys.favorites })
      const before = queryClient.getQueryData<SupplierFavorites>(supplierKeys.favorites)
      const ids = new Set(before?.supplierIds ?? [])
      if (favorite) ids.add(id)
      else ids.delete(id)
      queryClient.setQueryData<SupplierFavorites>(supplierKeys.favorites, { supplierIds: [...ids] })
      return { before }
    },
    onError: (_error, _variables, context) => {
      if (context?.before) queryClient.setQueryData(supplierKeys.favorites, context.before)
    },
    // Not awaited: in a list of favorites the row, and with it this button, can go away.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.favorites })
      // Only a list of favorites gains or loses a row; every other list stays as it is.
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'supplier' &&
          query.queryKey[1] === 'list' &&
          (query.queryKey[2] as SupplierFilters | undefined)?.favorites === true,
      })
    },
  })
}
