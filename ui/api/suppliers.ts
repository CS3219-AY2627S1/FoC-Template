// AI-assisted (Claude), reviewed and tested by Maliha

//AI assisted by Cursor - I just got it to import my dto, see suppliers/src/data/.. {in schema.ts}
import { api } from "./client"

export type Supplier = {
  supplierId: number
  name: string
  type: Category
  buildingName: string
  locationDescription: string
  floor: number
  imageURL: string
  latitude: string
  longitude: string
  // derived by supplier-service from today's hours in Asia/Singapore
  isOpen: boolean
  // sent back on edits so supplier-service can reject a stale save (409)
  updatedAt: string
}

// dayOfWeek 0 = Sunday; times come back as HH:MM:SS
export type OpeningHours = {
  dayOfWeek: number
  opensAt: string | null
  closesAt: string | null
  isClosed: boolean
}

export type SupplierDetail = Supplier & {
  openingHours: OpeningHours[]
}

// Fixed list from supplier-service (SUPPLIER_CATEGORY), shown as a dropdown
export const CATEGORIES = [
  { value: "food/coffee", label: "Coffee" },
  { value: "food",        label: "Food" },
  { value: "printing",    label: "Printing" },
  { value: "shopping",    label: "Shopping" },
  { value: "other",       label: "Other" },
] as const

export type Category = (typeof CATEGORIES)[number]["value"]

export const categoryLabel = (type: string) =>
  CATEGORIES.find((c) => c.value === type)?.label ?? "Other"

export const supplierLocation = (s: Supplier) => `${s.buildingName}, Level ${s.floor}`

export const getSuppliers = () =>
  api<{ data: Supplier[] }>("/suppliers").then((r) => r.data)

export const getSupplier = (id: number) =>
  api<{ data: SupplierDetail }>(`/supplier/${id}`).then((r) => r.data)

export const searchSuppliers = (q: string) =>
  api<{ data: Supplier[] }>(`/suppliers/search?q=${encodeURIComponent(q)}`).then((r) => r.data)

export const getSuppliersByCategory = (type: Category) =>
  api<{ data: Supplier[] }>(`/suppliers/category?type=${encodeURIComponent(type)}`).then((r) => r.data)

// ── Admin only ──

// The fields an admin fills in. lat/long stay strings since they're numeric columns
export type SupplierFields = {
  name: string
  type: Category
  buildingName: string
  locationDescription: string
  floor: number
  latitude: string
  longitude: string
}

// supplier-service wants all 7 days on create. The form only asks for one
// daily range, so every day gets the same hours (edit per day later)
const sameHoursEveryDay = (opensAt: string, closesAt: string): OpeningHours[] =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, opensAt, closesAt, isClosed: false }))

export const createSupplier = (fields: SupplierFields, opensAt: string, closesAt: string) =>
  api<{ data: SupplierDetail }>("/supplier", {
    method: "POST",
    body: JSON.stringify({ ...fields, openingHours: sameHoursEveryDay(opensAt, closesAt) }),
  }).then((r) => r.data)

export const updateSupplier = (s: Supplier, changes: Partial<SupplierFields>) =>
  api<{ data: Supplier }>(`/supplier/${s.supplierId}`, {
    method: "PUT",
    body: JSON.stringify({ ...changes, expectedUpdatedAt: s.updatedAt }),
  }).then((r) => r.data)

// soft delete on supplier-service, it just drops out of the active list
export const deleteSupplier = (id: number) =>
  api<unknown>(`/supplier/${id}`, { method: "DELETE" })