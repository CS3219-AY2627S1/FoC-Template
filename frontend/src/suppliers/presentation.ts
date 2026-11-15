/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added shared Supplier category and typical-hours presentation helpers
 * from the approved specification for issue #28.
 * Author review: Reviewed and approved by @ron.
 */
import type { Supplier, SupplierCategory, SupplierHoursKind } from './types'

export const SUPPLIER_CATEGORY_LABELS: Readonly<Record<SupplierCategory, string>> = {
  FOOD: 'Food',
  COFFEE: 'Coffee',
  PRINTING: 'Printing',
  SHOPPING: 'Shopping',
  PICKUP_POINT: 'Pickup point',
}

export const SUPPLIER_HOURS_KIND_LABELS: Readonly<Record<SupplierHoursKind, string>> = {
  UNKNOWN: 'Typical hours unavailable',
  ALL_DAY: 'Open all day',
  INTERVAL: 'Typical hours',
}

export function formatSupplierCategory(category: SupplierCategory): string {
  return SUPPLIER_CATEGORY_LABELS[category]
}

export function formatSupplierCategories(categories: readonly SupplierCategory[]): string {
  return categories.map(formatSupplierCategory).join(', ')
}

export function formatTypicalHours(
  supplier: Pick<Supplier, 'hoursKind' | 'opensAt' | 'closesAt'>,
): string {
  if (supplier.hoursKind === 'UNKNOWN') return SUPPLIER_HOURS_KIND_LABELS.UNKNOWN
  if (supplier.hoursKind === 'ALL_DAY') return SUPPLIER_HOURS_KIND_LABELS.ALL_DAY
  if (!supplier.opensAt || !supplier.closesAt) return SUPPLIER_HOURS_KIND_LABELS.UNKNOWN

  const nextDay = supplier.closesAt < supplier.opensAt ? ' (closes next day)' : ''
  return `${supplier.opensAt}–${supplier.closesAt}${nextDay}`
}
