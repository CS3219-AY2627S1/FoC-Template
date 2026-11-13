import { authFetch } from '@relay/user-auth-frontend-fetch'
import type { ErrandApi } from '@relay/contracts'

const baseUrl = '/api/errands'

export const hostErrandApi: ErrandApi = {
  async createErrand(body) {
    return request('', { method: 'POST', body: JSON.stringify(body) })
  },
  async getErrands(options) {
    const query = options?.scope ? `?scope=${encodeURIComponent(options.scope)}` : ''
    return request(query)
  },
  async listOpenBySupplier(supplierId) {
    return request(`/suppliers/${encodeURIComponent(supplierId)}/errands?scope=open`)
  },
  async getSupplierErrandView(options) {
    return request(
      `/suppliers/${encodeURIComponent(options.supplierId)}/errands?scope=${options.scope === 'explore' ? 'open' : 'all'}`,
    )
  },
  async listBySupplier(supplierId) {
    return request(`/suppliers/${encodeURIComponent(supplierId)}/errands?scope=all`)
  },
  async getErrand(id) {
    return request(`/${encodeURIComponent(id)}`)
  },
  async acceptErrand(id) {
    return request(`/${encodeURIComponent(id)}/accept`, { method: 'POST' })
  },
  async pickupErrand(id) {
    return request(`/${encodeURIComponent(id)}/pickup`, { method: 'POST' })
  },
  async deliverErrand(id) {
    return request(`/${encodeURIComponent(id)}/deliver`, { method: 'POST' })
  },
  async confirmErrand(id) {
    return request(`/${encodeURIComponent(id)}/confirm`, { method: 'POST' })
  },
  async cancelErrand(id) {
    return request(`/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
  },
  async dropErrand(id) {
    return request(`/${encodeURIComponent(id)}/drop`, { method: 'POST' })
  },
  async deleteErrand(id) {
    return request(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  if (!response.ok) {
    let message = `Errand service request failed (${response.status}).`
    let fieldErrors: Record<string, string> | undefined
    try {
      const body = (await response.json()) as {
        message?: string
        fieldErrors?: Record<string, string>
      }
      message = body.message ?? message
      fieldErrors = body.fieldErrors
    } catch {
      /* status message */
    }
    const error = new Error(message) as Error & { fieldErrors?: Record<string, string> }
    error.fieldErrors = fieldErrors
    throw error
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
