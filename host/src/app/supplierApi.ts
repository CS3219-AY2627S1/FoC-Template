import { authFetch } from '@relay/user-auth-frontend-fetch'
import type { SupplierApi } from '@relay/contracts'

const baseUrl = '/api/supplier'

export const hostSupplierApi: SupplierApi = {
  async getSuppliers(filters) {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.serviceTypes?.length)
      params.set('serviceTypes', JSON.stringify(filters.serviceTypes))
    const query = params.toString()
    return request(query ? `?${query}` : '')
  },
  async getSupplier(id) {
    return request(`/${encodeURIComponent(id)}`)
  },
  async addSupplier(body) {
    return request('', { method: 'POST', body: JSON.stringify(body) })
  },
  async updateSupplier(id, body) {
    return request(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })
  },
  async removeSupplier(id) {
    await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  if (!response.ok) throw new Error(`Supplier service request failed (${response.status}).`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
