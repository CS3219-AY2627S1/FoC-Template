/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added typed Supplier v1 API calls with query serialization and ETag
 * handling for issue #28.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: added the authenticated Supplier metadata helper for issue #30.
 * Author review: Reviewed and approved by @ron.
 */
import { apiRequest, apiRequestWithMeta } from './client'
import type {
  Supplier,
  SupplierListQuery,
  SupplierMetadata,
  SupplierMutation,
  SupplierPage,
  SupplierWithEtag,
} from '../suppliers/types'

const SUPPLIER_PATH = '/suppliers'

export function listSuppliers(query: SupplierListQuery = {}, signal?: AbortSignal): Promise<SupplierPage> {
  return apiRequest<SupplierPage>(supplierListPath(query), { signal })
}

export function getSupplierMetadata(signal?: AbortSignal): Promise<SupplierMetadata> {
  return apiRequest<SupplierMetadata>(`${SUPPLIER_PATH}/metadata`, { signal })
}

export async function getSupplier(id: string, signal?: AbortSignal): Promise<SupplierWithEtag> {
  const response = await apiRequestWithMeta<Supplier>(supplierPath(id), { signal })
  return { supplier: response.data, etag: requiredEtag(response.headers) }
}

export async function createSupplier(values: SupplierMutation): Promise<SupplierWithEtag> {
  const response = await apiRequestWithMeta<Supplier>(SUPPLIER_PATH, {
    method: 'POST',
    body: values,
  })
  return { supplier: response.data, etag: requiredEtag(response.headers) }
}

export async function updateSupplier(
  id: string,
  values: SupplierMutation,
  etag: string,
): Promise<SupplierWithEtag> {
  const response = await apiRequestWithMeta<Supplier>(supplierPath(id), {
    method: 'PUT',
    body: values,
    headers: { 'If-Match': etag },
  })
  return { supplier: response.data, etag: requiredEtag(response.headers) }
}

export function archiveSupplier(id: string, etag: string): Promise<void> {
  return apiRequest<void>(supplierPath(id), {
    method: 'DELETE',
    headers: { 'If-Match': etag },
  })
}

export async function restoreSupplier(id: string, etag: string): Promise<SupplierWithEtag> {
  const response = await apiRequestWithMeta<Supplier>(`${supplierPath(id)}/restore`, {
    method: 'POST',
    headers: { 'If-Match': etag },
  })
  return { supplier: response.data, etag: requiredEtag(response.headers) }
}

function supplierListPath(query: SupplierListQuery): string {
  const search = new URLSearchParams()
  if (query.q !== undefined) search.set('q', query.q)
  if (query.buildingCode !== undefined) search.set('buildingCode', query.buildingCode)
  if (query.category !== undefined) search.set('category', query.category)
  if (query.status !== undefined) search.set('status', query.status)
  if (query.page !== undefined) search.set('page', String(query.page))
  if (query.size !== undefined) search.set('size', String(query.size))
  if (query.sort !== undefined) search.set('sort', query.sort)
  const queryString = search.toString()
  return queryString ? `${SUPPLIER_PATH}?${queryString}` : SUPPLIER_PATH
}

function supplierPath(id: string): string {
  return `${SUPPLIER_PATH}/${encodeURIComponent(id)}`
}

function requiredEtag(headers: Headers): string {
  const etag = headers.get('ETag')
  if (!etag) throw new Error('Supplier response did not include an ETag.')
  return etag
}
