import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { components } from './schema'
import { supplierApi } from './client'

export type Supplier = components['schemas']['SupplierResponse']
export type SupplierList = components['schemas']['SupplierListResponse']
export type SupplierMetadata = components['schemas']['SupplierMetadataResponse']

export interface SupplierListParameters {
  search?: string
  type?: string
  building?: string
  page: number
  size: number
  sort: string
}

export class SupplierApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SupplierApiError'
  }
}

export function useSupplierListQuery(parameters: SupplierListParameters) {
  return useQuery({
    queryKey: ['suppliers', 'list', parameters],
    queryFn: async () => {
      const { data, error, response } = await supplierApi.GET(
        '/api/suppliers',
        {
          params: { query: parameters },
        },
      )

      if (error || !data) {
        throw new SupplierApiError(
          response.status,
          'We couldn’t load campus locations.',
        )
      }

      return data
    },
    placeholderData: keepPreviousData,
  })
}

export function useSupplierMetadataQuery() {
  return useQuery({
    queryKey: ['suppliers', 'metadata'],
    queryFn: async () => {
      const { data, error } = await supplierApi.GET('/api/suppliers/metadata')

      if (error || !data) {
        throw new SupplierApiError(500, 'We couldn’t load the filters.')
      }

      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSupplierDetailQuery(
  id: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['suppliers', 'detail', id],
    queryFn: async () => {
      const { data, error, response } = await supplierApi.GET(
        '/api/suppliers/{id}',
        { params: { path: { id: id! } } },
      )

      if (error || !data) {
        throw new SupplierApiError(
          response.status,
          response.status === 404
            ? 'That campus location could not be found.'
            : 'We couldn’t load this location.',
        )
      }

      return data
    },
    enabled: enabled && Boolean(id),
  })
}
