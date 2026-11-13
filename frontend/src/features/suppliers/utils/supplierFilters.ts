import { SUPPLIER_CATEGORIES } from '../types/supplier.types'
import type {
  SupplierCategory,
  SupplierFilters,
  SupplierListSearch,
} from '../types/supplier.types'

const isCategory = (value: string): value is SupplierCategory =>
  (SUPPLIER_CATEGORIES as ReadonlyArray<string>).includes(value)

const parseCategories = (value: unknown): Array<SupplierCategory> => {
  const parts = Array.isArray(value) ? value : [value]
  const names = parts
    .filter((part): part is string => typeof part === 'string')
    .flatMap((part) => part.split(','))
    .map((part) => part.trim().toUpperCase())
  return [...new Set(names.filter(isCategory))]
}

export const parseSupplierListSearch = (
  search: Record<string, unknown>,
): SupplierListSearch => {
  const categories = parseCategories(search.category)
  const q = typeof search.q === 'string' ? search.q.trim() : ''
  return {
    q: q || undefined,
    category: categories.length > 0 ? categories.join(',') : undefined,
    openNow: search.openNow === true || undefined,
    inactive: search.inactive === true || undefined,
  }
}

// Converts URL search params
export const toSupplierFilters = ({
  category,
  ...rest
}: SupplierListSearch): SupplierFilters => {
  const categories = parseCategories(category)
  return { ...rest, category: categories.length > 0 ? categories : undefined }
}

// add selected categories into the URL, or clears the param when none are left
export const toCategoryParam = (categories: ReadonlyArray<string>) =>
  categories.length > 0 ? categories.join(',') : undefined

// check if any filter applied
export const hasActiveFilters = ({
  q,
  category,
  openNow,
}: SupplierListSearch) => Boolean(q) || Boolean(category) || Boolean(openNow)
