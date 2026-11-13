export const SUPPLIER_CATEGORIES = [
  'FOOD',
  'COFFEE',
  'SHOPPING',
  'PRINTING',
  'OTHER',
] as const

export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number]

export const DAYS_OF_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number]

/**
 * Hours for one day "HH:MM". A closing time earlier
 * than the opening time means the supplier closes after midnight.
 * 00:00–23:59 represents a full 24-hour day.
 */
export type OpeningHours = {
  dayOfWeek: DayOfWeek
  opensAt: string
  closesAt: string
}

export type OpenStatus =
  | { isOpen: false }
  | { isOpen: true; is24Hours: true }
  | { isOpen: true; is24Hours: false; closesAt: string }

export type Supplier = {
  id: string
  name: string
  category: SupplierCategory
  building: string
  floor: string | null
  locationDescription: string | null
  latitude: number | null
  longitude: number | null
  /** Days the supplier opens, Monday first. Missing days are closed. */
  openingHours: Array<OpeningHours>
  imageUrl: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type SupplierRequest = Omit<
  Supplier,
  'id' | 'active' | 'imageUrl' | 'createdAt' | 'updatedAt'
>

export type SupplierFilters = {
  q?: string
  category?: Array<SupplierCategory>
  openNow?: boolean
  inactive?: boolean
}

/**
 * The supplier list page's URL search params are filters.
 * Categories are comma-separated (`?category=FOOD,COFFEE`)
 */
export type SupplierListSearch = Omit<SupplierFilters, 'category'> & {
  category?: string
}

// 3 conditions for image upload
export type SupplierImageChange =
  { type: 'keep' } | { type: 'upload'; file: File } | { type: 'remove' }
