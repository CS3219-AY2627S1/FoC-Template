import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createSupplier,
  getSupplier,
  listSuppliers,
  removeSupplierImage,
  setSupplierActive,
  updateSupplier,
  uploadSupplierImage,
} from '../api/suppliers.api'
import type {
  SupplierFilters,
  SupplierImageChange,
  SupplierRequest,
} from '../types/supplier.types'

export const supplierKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierKeys.all, 'list'] as const,
  list: (filters: SupplierFilters) =>
    [...supplierKeys.all, 'list', filters] as const,
  detail: (id: string) => [...supplierKeys.all, 'detail', id] as const,
}

export const useSuppliers = (filters: SupplierFilters = {}) =>
  useQuery({
    queryKey: supplierKeys.list(filters),
    queryFn: () => listSuppliers(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
  })

export const useSupplier = (id: string) =>
  useQuery({
    queryKey: supplierKeys.detail(id),
    queryFn: () => getSupplier(id),
    refetchInterval: 5 * 60_000,
  })

const useInvalidateSuppliers = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: supplierKeys.all })
}

export const useCreateSupplier = () => {
  const invalidate = useInvalidateSuppliers()
  return useMutation({
    mutationFn: (request: SupplierRequest) => createSupplier(request),
    onSuccess: invalidate,
  })
}

export const useUpdateSupplier = (id: string) => {
  const invalidate = useInvalidateSuppliers()
  return useMutation({
    mutationFn: (request: SupplierRequest) => updateSupplier(id, request),
    onSuccess: invalidate,
  })
}

export const useSetSupplierActive = () => {
  const invalidate = useInvalidateSuppliers()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setSupplierActive(id, active),
    onSuccess: invalidate,
  })
}

// Uploads or removes the image
export const useApplySupplierImageChange = () => {
  const invalidate = useInvalidateSuppliers()
  return useMutation({
    mutationFn: async ({
      id,
      change,
    }: {
      id: string
      change: SupplierImageChange
    }) => {
      if (change.type === 'upload') return uploadSupplierImage(id, change.file)
      if (change.type === 'remove') return removeSupplierImage(id)
      return null
    },
    onSuccess: invalidate,
  })
}
