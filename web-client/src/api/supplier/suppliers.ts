import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/http'
import type { Paginated } from '@/lib/http'
import type {
  Supplier,
  SupplierFilters,
  SupplierFilterValues,
  SupplierInput,
  SupplierStatus,
  WalkingRoute,
} from './types'

type Point = { latitude: number; longitude: number }

// Every key starts with the service name, and a list key holds all of its filters.
export const supplierKeys = {
  all: ['supplier'] as const,
  list: (filters: SupplierFilters) => ['supplier', 'list', filters] as const,
  filterValues: (status: SupplierStatus | 'all') => ['supplier', 'filters', status] as const,
  favorites: ['supplier', 'favorites'] as const,
  detail: (id: string) => ['supplier', 'detail', id] as const,
  route: (id: string, to: Point | null) => ['supplier', 'route', id, to?.latitude, to?.longitude] as const,
}

export function useSuppliers(filters: SupplierFilters) {
  return useQuery({
    queryKey: supplierKeys.list(filters),
    queryFn: ({ signal }) => request<Paginated<Supplier>>('supplier', '/suppliers', { query: filters, signal }),
    // Keeps the current page on screen while the next one loads, instead of a skeleton.
    placeholderData: keepPreviousData,
  })
}

// Type, zone and building are free text, so the choices for a filter menu come from the service.
export function useSupplierFilterValues(status: SupplierStatus | 'all' = 'Active') {
  return useQuery({
    queryKey: supplierKeys.filterValues(status),
    queryFn: ({ signal }) =>
      request<SupplierFilterValues>('supplier', '/suppliers/filters', { query: { status }, signal }),
  })
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: supplierKeys.detail(id),
    queryFn: ({ signal }) => request<Supplier>('supplier', `/suppliers/${id}`, { signal }),
  })
}

// The walk from the supplier to `to`. It is a POST so that the point stays out of the URL and every
// access log, but it changes nothing, so it is cached like a read.
export function useWalkingRoute(id: string, to: Point | null) {
  return useQuery({
    queryKey: supplierKeys.route(id, to),
    queryFn: ({ signal }) =>
      request<WalkingRoute>('supplier', `/suppliers/${id}/route`, { method: 'POST', body: { to }, signal }),
    // Nothing to measure until both ends are chosen.
    enabled: id !== '' && to !== null,
  })
}

// Administrators only; the supplier-service refuses everyone else with 403 (F1.5.4).
export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SupplierInput) => request<Supplier>('supplier', '/suppliers', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  })
}

export function useUpdateSupplier(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: Partial<SupplierInput>) =>
      request<Supplier>('supplier', `/suppliers/${id}`, { method: 'PATCH', body: changes }),
    // Lists and details may all show the old values, so everything of this service reloads.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  })
}

// The supplier-service never deletes a supplier: DELETE sets it Inactive and the record stays,
// so errands that already use it still find it. Setting the status back reactivates it.
export function useSetSupplierStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active
        ? request<Supplier>('supplier', `/suppliers/${id}`, { method: 'PATCH', body: { status: 'Active' } })
        : request<Supplier>('supplier', `/suppliers/${id}`, { method: 'DELETE' }),
    // Not awaited: under a status filter the reload removes the row, and with it the button whose
    // own onSuccess still has to run (React Query skips it for a component that is gone).
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all })
    },
  })
}
