import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { components } from './schema'
import { supplierApi, supplierFetch } from './client'
import type { Supplier } from './supplierQueries'

export type CreateSupplierRequest =
  components['schemas']['CreateSupplierRequest']
export type UpdateSupplierRequest =
  components['schemas']['UpdateSupplierRequest']
export type SupplierStatus = 'ACTIVE' | 'INACTIVE'

export interface AdminSupplierListParameters {
  search?: string
  type?: string
  building?: string
  status?: SupplierStatus
  page: number
  size: number
  sort: string
}

type SupplierProblem =
  | components['schemas']['InvalidRequestProblem']
  | components['schemas']['InvalidSupplierRequestProblem']
  | components['schemas']['SupplierNotFoundProblem']
  | components['schemas']['SupplierUpdateConflictProblem']
  | components['schemas']['InvalidSupplierImageProblem']
  | components['schemas']['SupplierImageUnavailableProblem']

export class SupplierMutationError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: SupplierProblem | undefined,
    fallbackMessage: string,
  ) {
    super(problem?.detail ?? fallbackMessage)
    this.name = 'SupplierMutationError'
  }

  get fieldErrors() {
    return 'errors' in (this.problem ?? {})
      ? (this.problem as components['schemas']['InvalidSupplierRequestProblem'])
          .errors
      : undefined
  }
}

function mutationError(
  status: number,
  error: unknown,
  fallbackMessage: string,
) {
  return new SupplierMutationError(
    status,
    typeof error === 'object' && error !== null
      ? (error as SupplierProblem)
      : undefined,
    fallbackMessage,
  )
}

export function useAdminSupplierListQuery(
  parameters: AdminSupplierListParameters,
) {
  return useQuery({
    queryKey: ['suppliers', 'admin', 'list', parameters],
    queryFn: async () => {
      const { data, error, response } = await supplierApi.GET(
        '/api/admin/suppliers',
        { params: { query: parameters } },
      )

      if (error || !data) {
        throw mutationError(
          response.status,
          error,
          'We couldn’t load the location list.',
        )
      }
      return data
    },
    placeholderData: keepPreviousData,
  })
}

export function useAdminSupplierMetadataQuery() {
  return useQuery({
    queryKey: ['suppliers', 'admin', 'metadata'],
    queryFn: async () => {
      const { data, error } = await supplierApi.GET(
        '/api/admin/suppliers/metadata',
      )
      if (error || !data) {
        throw new SupplierMutationError(
          500,
          undefined,
          'We couldn’t load the filters.',
        )
      }
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useInvalidateSupplierQueries() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['suppliers'] })
}

export function useCreateSupplierMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async (request: CreateSupplierRequest) => {
      const { data, error, response } = await supplierApi.POST(
        '/api/suppliers',
        { body: request },
      )
      if (error || !data) {
        throw mutationError(
          response.status,
          error,
          'We couldn’t add this location.',
        )
      }
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateSupplierMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async ({
      id,
      request,
    }: {
      id: string
      request: UpdateSupplierRequest
    }) => {
      const { data, error, response } = await supplierApi.PUT(
        '/api/suppliers/{id}',
        { params: { path: { id } }, body: request },
      )
      if (error || !data) {
        throw mutationError(
          response.status,
          error,
          'We couldn’t save this location.',
        )
      }
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUploadSupplierImageMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async ({
      id,
      version,
      file,
    }: {
      id: string
      version: number
      file: File
    }) => {
      const body = new FormData()
      body.set('file', file)
      const response = await supplierFetch(
        new Request(
          new URL(
            `/api/admin/suppliers/${encodeURIComponent(id)}/image?version=${version}`,
            window.location.origin,
          ),
          { method: 'PUT', body },
        ),
      )
      const payload = (await response.json().catch(() => undefined)) as
        Supplier | SupplierProblem | undefined
      if (!response.ok) {
        throw mutationError(
          response.status,
          payload,
          'We couldn’t upload this location’s photo.',
        )
      }
      return payload as Supplier
    },
    onSuccess: invalidate,
  })
}

export function useRemoveSupplierImageMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async ({ id, version }: { id: string; version: number }) => {
      const { data, error, response } = await supplierApi.DELETE(
        '/api/admin/suppliers/{id}/image',
        {
          params: { path: { id }, query: { version } },
        },
      )
      if (error || !data) {
        throw mutationError(
          response.status,
          error,
          'We couldn’t remove this location’s photo.',
        )
      }
      return data
    },
    onSuccess: invalidate,
  })
}

export function useChangeSupplierStatusMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async ({
      supplier,
      status,
    }: {
      supplier: Supplier
      status: SupplierStatus
    }) => {
      const { data, error, response } = await supplierApi.PATCH(
        '/api/suppliers/{id}/status',
        {
          params: { path: { id: supplier.id! } },
          body: { status, version: supplier.version! },
        },
      )
      if (error || !data) {
        throw mutationError(
          response.status,
          error,
          'We couldn’t change this location’s status.',
        )
      }
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteSupplierMutation() {
  const invalidate = useInvalidateSupplierQueries()
  return useMutation({
    mutationFn: async (supplier: Supplier) => {
      const { error, response } = await supplierApi.DELETE(
        '/api/suppliers/{id}',
        {
          params: {
            path: { id: supplier.id! },
            query: { version: supplier.version! },
          },
        },
      )
      if (error || !response.ok) {
        throw mutationError(
          response.status,
          error,
          'We couldn’t delete this location.',
        )
      }
    },
    onSuccess: invalidate,
  })
}
