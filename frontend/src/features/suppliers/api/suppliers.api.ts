// The shared client adds the access token and refreshes it on 401.
import { axiosClient } from '#/lib/axiosClient'
import type {
  Supplier,
  SupplierFilters,
  SupplierRequest,
} from '../types/supplier.types'

export const listSuppliers = async (filters: SupplierFilters) => {
  const { data } = await axiosClient.get<Array<Supplier>>('/suppliers', {
    params: {
      q: filters.q,
      category: filters.category,
      openNow: filters.openNow,
      includeInactive: filters.inactive,
    },
    paramsSerializer: { indexes: null },
  })
  return data
}

export const getSupplier = async (id: string) => {
  const { data } = await axiosClient.get<Supplier>(`/suppliers/${id}`)
  return data
}

export const createSupplier = async (request: SupplierRequest) => {
  const { data } = await axiosClient.post<Supplier>('/suppliers', request)
  return data
}

export const updateSupplier = async (id: string, request: SupplierRequest) => {
  const { data } = await axiosClient.put<Supplier>(`/suppliers/${id}`, request)
  return data
}

export const setSupplierActive = async (id: string, active: boolean) => {
  const action = active ? 'activate' : 'deactivate'
  const { data } = await axiosClient.post<Supplier>(
    `/suppliers/${id}/${action}`,
  )
  return data
}

// Uploads a jpeg or png
export const uploadSupplierImage = async (id: string, file: File) => {
  const body = new FormData()
  body.append('file', file)
  const { data } = await axiosClient.put<Supplier>(
    `/suppliers/${id}/image`,
    body,
  )
  return data
}

export const removeSupplierImage = async (id: string) => {
  const { data } = await axiosClient.delete<Supplier>(`/suppliers/${id}/image`)
  return data
}
