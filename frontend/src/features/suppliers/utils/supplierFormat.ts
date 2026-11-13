import { isAxiosError } from 'axios'
import { isOpenAt } from './openingHours'
import type { Supplier, SupplierCategory } from '../types/supplier.types'

export const categoryLabels: Record<SupplierCategory, string> = {
  FOOD: 'Food',
  COFFEE: 'Coffee',
  SHOPPING: 'Shopping',
  PRINTING: 'Printing',
  OTHER: 'Other',
}

export const formatLocation = (supplier: Supplier) =>
  supplier.floor
    ? `${supplier.building}, Level ${supplier.floor}`
    : supplier.building

export const getErrorMessage = (error: unknown) => {
  if (isAxiosError<{ message?: string }>(error)) {
    if (error.response?.status === 401) return 'Please log in again.'
    if (error.response?.status === 403)
      return 'Only admins can manage suppliers.'
    if (error.response?.data.message) return error.response.data.message
  }
  return 'Something went wrong. Please try again.'
}

export type SupplierSummary = {
  active: number
  deactivated: number
  openNow: number
}

// the dashboard stats for admin to view
export const summarizeSuppliers = (
  suppliers: Array<Supplier>,
  now: number,
): SupplierSummary => {
  const active = suppliers.filter((supplier) => supplier.active)
  return {
    active: active.length,
    deactivated: suppliers.length - active.length,
    openNow: active.filter((supplier) => isOpenAt(supplier.openingHours, now))
      .length,
  }
}
