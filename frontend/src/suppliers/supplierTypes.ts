/**
 * AI Assistance Disclosure
 * Tool: Cursor (Composer)
 * Scope: Shared supplier type helpers for controlled categories + custom Other values.
 * Author review: Reviewed and kept frontend-only; backend type remains a free string.
 */

export const SUPPLIER_TYPE_MAX_LENGTH = 100

/** Stable, controlled categories shown in Create/Edit and always in the list filter. */
export const SUPPLIER_TYPE_CATEGORIES = [
  'Food',
  'Food/Coffee',
  'Printing',
  'Shopping',
] as const

export type SupplierTypeCategory = (typeof SUPPLIER_TYPE_CATEGORIES)[number]

export const SUPPLIER_TYPE_OTHER = 'Other'

export function normalizeSupplierType(value: string): string {
  return value.trim()
}

export function isControlledSupplierType(value: string): boolean {
  return (SUPPLIER_TYPE_CATEGORIES as readonly string[]).includes(value)
}

export function isValidSupplierType(value: string): boolean {
  const normalized = normalizeSupplierType(value)
  return normalized.length > 0 && normalized.length <= SUPPLIER_TYPE_MAX_LENGTH
}

export function getSupplierTypeError(value: string): string {
  const normalized = normalizeSupplierType(value)
  if (normalized.length === 0) return 'Type is required'
  if (normalized.length > SUPPLIER_TYPE_MAX_LENGTH) {
    return `Type must be ${SUPPLIER_TYPE_MAX_LENGTH} characters or fewer`
  }
  return ''
}

/** Distinct non-empty types from loaded suppliers, sorted. */
export function getDistinctSupplierTypes(
  suppliers: ReadonlyArray<{ type: string }>,
): string[] {
  const types = new Set<string>()
  for (const supplier of suppliers) {
    const type = normalizeSupplierType(supplier.type)
    if (type) types.add(type)
  }
  return [...types].sort((a, b) => a.localeCompare(b))
}

/**
 * Filter options: always include controlled categories, plus any custom types
 * already present on suppliers (e.g. Laundry).
 */
export function getSupplierTypeFilterOptions(
  suppliers: ReadonlyArray<{ type: string }>,
): string[] {
  const custom = getDistinctSupplierTypes(suppliers).filter(
    (type) => !isControlledSupplierType(type),
  )
  return [...SUPPLIER_TYPE_CATEGORIES, ...custom]
}
