/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
export type SupplierStatus = 'ACTIVE' | 'INACTIVE'
export type SupplierReferenceStatus = 'ACTIVE' | 'RETIRED'

export type SupplierReference = {
  id: string
  name: string
}

export type SupplierDirectoryEntry = SupplierReference & {
  status: SupplierReferenceStatus
}

export type SupplierWriteRequest = {
  name: string
  categoryId: string
  buildingId: string
  floor: string | null
  description: string | null
  openingTime: string | null
  closingTime: string | null
  imageUrl: string | null
}

export type Supplier = {
  id: string
  name: string
  category: SupplierReference
  building: SupplierReference
  floor: string | null
  description: string | null
  openingTime: string | null
  closingTime: string | null
  imageUrl: string | null
  status: SupplierStatus
}

export type SupplierPage = {
  number: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

export type SupplierListResponse = {
  items: Supplier[]
  page: SupplierPage
}

export type SupplierReferenceListResponse = {
  items: SupplierReference[]
}

export type SupplierDirectoryListResponse = {
  items: SupplierDirectoryEntry[]
}
