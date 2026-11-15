/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Defined frontend Supplier API types from the implemented v1 contract
 * for issue #28.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: added backend-owned Building Code metadata types for issue #30.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: replaced the duplicated closed Building Code union with the
 * metadata-driven named string domain type for issue #34.
 * Author review: Reviewed and approved by @ron.
 */

export const SUPPLIER_CATEGORIES = ['FOOD', 'COFFEE', 'PRINTING', 'SHOPPING', 'PICKUP_POINT'] as const
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number]

export const SUPPLIER_HOURS_KINDS = ['UNKNOWN', 'ALL_DAY', 'INTERVAL'] as const
export type SupplierHoursKind = (typeof SUPPLIER_HOURS_KINDS)[number]

export const SUPPLIER_STATUSES = ['ACTIVE', 'ARCHIVED'] as const
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number]

export const SUPPLIER_SORTS = ['name,asc', 'name,desc', 'updatedAt,desc'] as const
export type SupplierSort = (typeof SUPPLIER_SORTS)[number]

export const SUPPLIER_LIST_DEFAULT_PAGE = 0
export const SUPPLIER_LIST_DEFAULT_SIZE = 12
export const SUPPLIER_LIST_MAX_SIZE = 100

// The API owns the valid code set and code-to-label mapping. Keeping a named
// string type documents the domain without duplicating the backend registry.
export type BuildingCode = string

export interface SupplierBuildingOption {
  readonly code: BuildingCode
  readonly label: string
}

export interface SupplierMetadata {
  readonly buildingCodes: readonly SupplierBuildingOption[]
}

export interface Supplier {
  readonly id: string
  readonly name: string
  readonly categories: readonly SupplierCategory[]
  readonly buildingCode: BuildingCode
  readonly buildingLabel: string
  readonly floor: string | null
  readonly locationDescription: string
  readonly latitude: number | null
  readonly longitude: number | null
  readonly hoursKind: SupplierHoursKind
  readonly opensAt: string | null
  readonly closesAt: string | null
  readonly imagePath: string | null
  readonly status: SupplierStatus
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly archivedAt: string | null
}

export interface SupplierPage {
  readonly items: readonly Supplier[]
  readonly page: number
  readonly size: number
  readonly totalItems: number
  readonly totalPages: number
}

export interface SupplierListQuery {
  readonly q?: string
  readonly buildingCode?: BuildingCode
  readonly category?: SupplierCategory
  readonly status?: SupplierStatus
  readonly page?: number
  readonly size?: number
  readonly sort?: SupplierSort
}

interface SupplierMutationFields {
  readonly name: string
  readonly categories: readonly SupplierCategory[]
  readonly buildingCode: BuildingCode
  readonly floor?: string | null
  readonly locationDescription: string
  readonly latitude?: number | null
  readonly longitude?: number | null
}

export type SupplierMutation = SupplierMutationFields &
  (
    | {
        readonly hoursKind: 'INTERVAL'
        readonly opensAt: string
        readonly closesAt: string
      }
    | {
        readonly hoursKind: 'UNKNOWN' | 'ALL_DAY'
        readonly opensAt?: never
        readonly closesAt?: never
      }
  )

export interface SupplierWithEtag {
  readonly supplier: Supplier
  readonly etag: string
}
