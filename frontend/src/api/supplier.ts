// Frontend API client for the supplier service. The supplier pages call these
// functions instead of using HTTP directly.
// Suppliers: list (search/filter/sort/pagination), get by id, and admin create, update, delete.
// Locations: list, and admin create, delete.
import client from './http'

export const SUPPLIER_TYPES = ['food', 'shopping', 'printing', 'coffee'] as const
export type SupplierType = typeof SUPPLIER_TYPES[number]

export interface Location {
  id: number
  name: string
  // set when soft-deleted; GET /locations only returns live ones, so always null there
  deletedAt: string | null
}

// a supplier row as stored by the supplier service
export interface Supplier {
  id: number
  name: string
  type: SupplierType[]
  floor: number | null
  imageUrl: string | null
  description: string | null
  locationId: number
  // "HH:MM:SS" campus time, both null when there are no opening hours
  opensAt: string | null
  closesAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface SupplierQuery {
  // case-insensitive search on supplier name
  name?: string
  locationId?: number | null
  sortBy: 'id' | 'name'
  sortOrder: 'asc' | 'desc'
  // 1-based, 20 suppliers per page
  page: number
}

export interface SupplierPage {
  data: Supplier[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPage: number
  }
}

export async function listSuppliers (query: SupplierQuery) {
  const params: Record<string, string> = {
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    page: String(query.page),
  }
  if (query.name?.trim()) {
    params.name = query.name.trim()
  }
  if (query.locationId) {
    params.locationId = String(query.locationId)
  }

  const response = await client.get<SupplierPage>('/public/supplier/suppliers', { params })
  return response.data
}

export async function getSupplier (id: number | string) {
  const response = await client.get<Supplier>(`/public/supplier/suppliers/${id}`)
  return response.data
}

// fields an admin can set; optional fields are cleared with null
export interface SupplierInput {
  name: string
  type: SupplierType[]
  locationId: number
  floor: number | null
  imageUrl: string | null
  description: string | null
  // "HH:MM", both set or both null
  opensAt: string | null
  closesAt: string | null
}

// admin only
export async function createSupplier (body: SupplierInput) {
  const response = await client.post<Supplier>('/public/supplier/suppliers', body)
  return response.data
}

// admin only, sends just the fields being changed
export async function updateSupplier (id: number, patch: Partial<SupplierInput>) {
  const response = await client.patch<Supplier>(`/public/supplier/suppliers/${id}`, patch)
  return response.data
}

// admin only, soft delete
export async function deleteSupplier (id: number) {
  await client.delete(`/public/supplier/suppliers/${id}`)
}

export async function listLocations () {
  const response = await client.get<Location[]>('/public/supplier/locations')
  return response.data
}

// admin only
export async function createLocation (name: string) {
  const response = await client.post<Location>('/public/supplier/locations', { name })
  return response.data
}

// admin only, soft delete, refused while any supplier uses the location
export async function deleteLocation (id: number) {
  await client.delete(`/public/supplier/locations/${id}`)
}
