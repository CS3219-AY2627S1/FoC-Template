/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import type {
  Supplier,
  SupplierDirectoryEntry,
  SupplierDirectoryListResponse,
  SupplierListResponse,
  SupplierReferenceListResponse,
  SupplierWriteRequest,
} from './supplier.types'
import { authenticatedFetch } from '../auth/auth.fetch'

const supplierApiBaseUrl = (import.meta.env.VITE_SUPPLIER_API_URL ?? '').trim().replace(/\/+$/, '')

type SupplierSort = 'name,asc' | 'name,desc'

export type ListSuppliersParams = {
  query?: string
  categoryId?: string
  buildingId?: string
  page?: number
  size?: number
  sort?: SupplierSort
}

type ProblemDetails = {
  detail?: string
  title?: string
  inactiveReferences?: string[]
}

export class SupplierApiError extends Error {
  status: number
  inactiveReferences: string[]

  constructor(message: string, status: number, inactiveReferences: string[] = []) {
    super(message)
    this.name = 'SupplierApiError'
    this.status = status
    this.inactiveReferences = inactiveReferences
  }
}

async function sendJson<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await authenticatedFetch(`${supplierApiBaseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    })
  } catch {
    throw new SupplierApiError('Could not connect to the Supplier Service.', 0)
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemDetails | null
    throw new SupplierApiError(
      problem?.detail ?? problem?.title ?? 'Unable to update supplier data.',
      response.status,
      problem?.inactiveReferences ?? [],
    )
  }
  return (await response.json()) as T
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response

  try {
    response = await authenticatedFetch(`${supplierApiBaseUrl}${path}`, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new SupplierApiError('Could not connect to the Supplier Service.', 0)
  }

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ProblemDetails | null
    const message = problem?.detail ?? problem?.title ?? 'Unable to load supplier data.'
    throw new SupplierApiError(message, response.status)
  }

  return (await response.json()) as T
}

export async function listSuppliers(
  {
    query,
    categoryId,
    buildingId,
    page = 0,
    size = 20,
    sort = 'name,asc',
  }: ListSuppliersParams = {},
  signal?: AbortSignal,
) {
  const searchParams = new URLSearchParams({
    page: page.toString(),
    size: size.toString(),
    sort,
  })

  if (query) searchParams.set('q', query)
  if (categoryId) searchParams.set('categoryId', categoryId)
  if (buildingId) searchParams.set('buildingId', buildingId)

  return getJson<SupplierListResponse>(`/suppliers?${searchParams}`, signal)
}

export function getSupplier(supplierId: string, signal?: AbortSignal) {
  return getJson<Supplier>(`/suppliers/${encodeURIComponent(supplierId)}`, signal)
}

export function listSupplierCategories(signal?: AbortSignal) {
  return getJson<SupplierReferenceListResponse>('/categories', signal)
}

export function listSupplierBuildings(signal?: AbortSignal) {
  return getJson<SupplierReferenceListResponse>('/buildings', signal)
}

export function listAdminCategories(signal?: AbortSignal) {
  return getJson<SupplierDirectoryListResponse>('/categories', signal)
}

export function listAdminBuildings(signal?: AbortSignal) {
  return getJson<SupplierDirectoryListResponse>('/buildings', signal)
}

export function listDeactivatedSuppliers(params: ListSuppliersParams = {}, signal?: AbortSignal) {
  const { query, categoryId, buildingId, page = 0, size = 20, sort = 'name,asc' } = params
  const searchParams = new URLSearchParams({ page: String(page), size: String(size), sort })
  if (query) searchParams.set('q', query)
  if (categoryId) searchParams.set('categoryId', categoryId)
  if (buildingId) searchParams.set('buildingId', buildingId)
  return getJson<SupplierListResponse>(`/suppliers/deactivated?${searchParams}`, signal)
}

export function createSupplier(request: SupplierWriteRequest) {
  return sendJson<Supplier>('/suppliers', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}

export function updateSupplier(id: string, request: SupplierWriteRequest) {
  return sendJson<Supplier>(`/suppliers/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  })
}

export function deactivateSupplier(id: string) {
  return sendJson<Supplier>(`/suppliers/${encodeURIComponent(id)}/deactivate`, { method: 'PATCH' })
}

export function reactivateSupplier(id: string) {
  return sendJson<Supplier>(`/suppliers/${encodeURIComponent(id)}/reactivate`, { method: 'PATCH' })
}

export function listDeactivatedCategories(signal?: AbortSignal) {
  return getJson<SupplierDirectoryListResponse>('/categories/deactivated', signal)
}

export function listDeactivatedBuildings(signal?: AbortSignal) {
  return getJson<SupplierDirectoryListResponse>('/buildings/deactivated', signal)
}

export function createCategory(name: string) {
  return sendJson<SupplierDirectoryEntry>('/categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
}

export function updateCategory(id: string, name: string) {
  return sendJson<SupplierDirectoryEntry>(`/categories/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
}

export function deactivateCategory(id: string) {
  return sendJson<SupplierDirectoryEntry>(`/categories/${encodeURIComponent(id)}/deactivate`, { method: 'POST' })
}

export function reactivateCategory(id: string) {
  return sendJson<SupplierDirectoryEntry>(`/categories/${encodeURIComponent(id)}/reactivate`, { method: 'POST' })
}

export function createBuilding(name: string) {
  return sendJson<SupplierDirectoryEntry>('/buildings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
}

export function updateBuilding(id: string, name: string) {
  return sendJson<SupplierDirectoryEntry>(`/buildings/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  })
}

export function deactivateBuilding(id: string) {
  return sendJson<SupplierDirectoryEntry>(`/buildings/${encodeURIComponent(id)}/deactivate`, { method: 'POST' })
}

export function reactivateBuilding(id: string) {
  return sendJson<SupplierDirectoryEntry>(`/buildings/${encodeURIComponent(id)}/reactivate`, { method: 'POST' })
}
