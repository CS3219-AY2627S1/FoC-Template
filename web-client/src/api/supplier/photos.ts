import { useMutation, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/http'
import { supplierKeys } from './suppliers'
import type { Supplier, SupplierPhotoInput } from './types'

// The supplier-service names its photos by paths on itself, and the browser reaches it through
// the gateway, the same way request() does. An <img> sends the session cookie along.
export function supplierImageUrl(path: string): string {
  return `/api/supplier${path}`
}

// Administrators only; the supplier-service refuses everyone else with 403.
export function useSetSupplierPhoto(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SupplierPhotoInput) =>
      request<Supplier>('supplier', `/suppliers/${id}/photo`, { method: 'PUT', body: input }),
    // Lists and the detail page all show the photo, so everything of this service reloads.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  })
}

export function useRemoveSupplierPhoto(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => request<Supplier>('supplier', `/suppliers/${id}/photo`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  })
}
