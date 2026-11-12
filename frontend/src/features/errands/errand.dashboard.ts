/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-21
 * Scope (AI-03): Isolated failed supplier lookups and added regression tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-65): Added recommended errands UI into errand dashboard
 * Author review: Code changes were checked and validated
 */


import { getSupplier, listSupplierBuildings } from '../suppliers/supplier.api'
import type { Supplier, SupplierReference } from '../suppliers/supplier.types'
import { listErrands, listRecommendedErrands } from './errand.api'
import type {
  ErrandCreditFilter,
  ErrandDashboardItem,
  ErrandExpiryFilter,
  ErrandListItem,
  ErrandSort,
  ListErrandsParams,
  RecommendedErrandDashboardItem,
} from './errand.types'

const HOUR_IN_MS = 60 * 60 * 1000
const DAY_IN_MS = 24 * HOUR_IN_MS
const RECOMMENDED_ERRAND_COUNT = 4

export type ErrandDashboardFilters = {
  deliveryBuildingId: string
  credit: ErrandCreditFilter
  expiry: ErrandExpiryFilter
  sort: ErrandSort
}

export type OpenErrandDashboardData = {
  total: number
  items: ErrandDashboardItem[]
}

export function buildOpenErrandParams(
  filters: ErrandDashboardFilters,
  now = new Date(),
): ListErrandsParams {
  const params: ListErrandsParams = {
    statuses: ['OPEN'],
    deliveryBuildingId: filters.deliveryBuildingId || undefined,
    availableOnly: true,
    sort: filters.sort,
    page: 0,
    size: 20,
  }

  if (filters.credit === 'up-to-5') params.maxCreditValue = 5
  if (filters.credit === '6-to-10') {
    params.minCreditValue = 6
    params.maxCreditValue = 10
  }
  if (filters.credit === '11-plus') params.minCreditValue = 11

  if (filters.expiry === 'next-4-hours') {
    params.expiresBefore = new Date(now.getTime() + 4 * HOUR_IN_MS).toISOString()
  }
  if (filters.expiry === 'today') {
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)
    params.expiresBefore = endOfToday.toISOString()
  }
  if (filters.expiry === 'next-7-days') {
    params.expiresBefore = new Date(now.getTime() + 7 * DAY_IN_MS).toISOString()
  }

  return params
}

function enrichErrand<T extends ErrandListItem>(
  errand: T,
  suppliersById: Map<string, Supplier>,
): T & ErrandDashboardItem {
  const supplier = suppliersById.get(errand.supplier_id)

  return {
    ...errand,
    supplier_name: supplier?.name ?? 'Supplier unavailable',
    supplier_building_name: supplier?.building.name ?? 'Pickup location unavailable',
    delivery_building_name: 'Delivery location unavailable',
  }
}

export function nameDeliveryBuildings<T extends ErrandDashboardItem>(
  items: T[],
  deliveryBuildings: SupplierReference[],
): T[] {
  const buildingsById = new Map(
    deliveryBuildings.map((building) => [building.id, building]),
  )

  return items.map((errand) => ({
    ...errand,
    delivery_building_name:
      buildingsById.get(errand.delivery_building_id)?.name ??
      'Delivery location unavailable',
  }))
}

export function applyDeliveryBuildingNames(
  data: OpenErrandDashboardData,
  deliveryBuildings: SupplierReference[],
): OpenErrandDashboardData {
  return { ...data, items: nameDeliveryBuildings(data.items, deliveryBuildings) }
}

export async function loadErrandDashboardBuildings(signal?: AbortSignal) {
  const response = await listSupplierBuildings(signal)
  return response.items
}

async function withSupplierNames<T extends ErrandListItem>(
  errands: T[],
  signal?: AbortSignal,
): Promise<(T & ErrandDashboardItem)[]> {
  const supplierIds = [...new Set(errands.map((errand) => errand.supplier_id))]
  const supplierResults = await Promise.allSettled(
    supplierIds.map((supplierId) => getSupplier(supplierId, signal)),
  )
  const abortedRequest = supplierResults.find(
    (result) =>
      result.status === 'rejected' &&
      result.reason instanceof DOMException &&
      result.reason.name === 'AbortError',
  )

  if (abortedRequest?.status === 'rejected') throw abortedRequest.reason

  const suppliers = supplierResults.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )
  const suppliersById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
  return errands.map((errand) => enrichErrand(errand, suppliersById))
}

export async function loadOpenErrandDashboard(
  filters: ErrandDashboardFilters,
  signal?: AbortSignal,
  now = new Date(),
): Promise<OpenErrandDashboardData> {
  const errandResponse = await listErrands(buildOpenErrandParams(filters, now), signal)
  return {
    total: errandResponse.total,
    items: await withSupplierNames(errandResponse.items, signal),
  }
}

export async function loadRecommendedErrands(
  signal?: AbortSignal,
): Promise<RecommendedErrandDashboardItem[]> {
  const response = await listRecommendedErrands(RECOMMENDED_ERRAND_COUNT, signal)
  return withSupplierNames(response.items, signal)
}
