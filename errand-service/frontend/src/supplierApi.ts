import { authFetch } from '@relay/user-auth-frontend-fetch'
import type { GetSuppliersResponse, SupplierApi } from '@relay/contracts'

const supplierApiBaseUrl = import.meta.env.VITE_SUPPLIER_API_URL ?? '/api/supplier'

export function createHttpSupplierApi(): SupplierApi {
  async function request<T>(path: string): Promise<T> {
    const response = await authFetch(`${supplierApiBaseUrl}${path}`, { credentials: 'include' })
    if (!response.ok) throw new Error(`Supplier service request failed (${response.status}).`)
    return (await response.json()) as T
  }

  return {
    getSuppliers: () => request<GetSuppliersResponse>(''),
    getSupplier: (id) => request(`/${encodeURIComponent(id)}`),
    addSupplier: async () => {
      throw new Error('Supplier administration is not available here.')
    },
    updateSupplier: async () => {
      throw new Error('Supplier administration is not available here.')
    },
    removeSupplier: async () => {
      throw new Error('Supplier administration is not available here.')
    },
  }
}

export const httpSupplierApi = createHttpSupplierApi()
