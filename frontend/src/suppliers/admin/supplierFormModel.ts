/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Modelled the administrator Supplier form draft and exact mutation
 * conversion for issue #30.
 * Author review: Reviewed and approved by @ron.
 */
import type {
  BuildingCode,
  Supplier,
  SupplierCategory,
  SupplierHoursKind,
  SupplierMutation,
} from '../types'

export interface SupplierFormDraft {
  readonly name: string
  readonly categories: readonly SupplierCategory[]
  readonly buildingCode: BuildingCode | ''
  readonly floor: string
  readonly locationDescription: string
  readonly latitude: string
  readonly longitude: string
  readonly hoursKind: SupplierHoursKind
  readonly opensAt: string
  readonly closesAt: string
}

export const EMPTY_SUPPLIER_DRAFT: SupplierFormDraft = {
  name: '',
  categories: [],
  buildingCode: '',
  floor: '',
  locationDescription: '',
  latitude: '',
  longitude: '',
  hoursKind: 'UNKNOWN',
  opensAt: '',
  closesAt: '',
}

export function draftFromSupplier(supplier: Supplier): SupplierFormDraft {
  return {
    name: supplier.name,
    categories: supplier.categories,
    buildingCode: supplier.buildingCode,
    floor: supplier.floor ?? '',
    locationDescription: supplier.locationDescription,
    latitude: supplier.latitude?.toString() ?? '',
    longitude: supplier.longitude?.toString() ?? '',
    hoursKind: supplier.hoursKind,
    opensAt: supplier.opensAt ?? '',
    closesAt: supplier.closesAt ?? '',
  }
}

export function validateSupplierDraft(draft: SupplierFormDraft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!draft.name.trim()) errors.name = 'Name is required.'
  if (draft.categories.length === 0) errors.categories = 'Choose at least one category.'
  if (!draft.buildingCode) errors.buildingCode = 'Choose a Building Code.'
  if (!draft.locationDescription.trim()) {
    errors.locationDescription = 'Location description is required.'
  }

  const hasLatitude = draft.latitude.trim() !== ''
  const hasLongitude = draft.longitude.trim() !== ''
  if (hasLatitude !== hasLongitude) {
    errors.latitude = 'Provide both coordinates or leave both blank.'
    errors.longitude = 'Provide both coordinates or leave both blank.'
  } else if (hasLatitude) {
    const latitude = Number(draft.latitude)
    const longitude = Number(draft.longitude)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      errors.latitude = 'Latitude must be between -90 and 90.'
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      errors.longitude = 'Longitude must be between -180 and 180.'
    }
  }

  if (draft.hoursKind === 'INTERVAL') {
    if (!draft.opensAt) errors.opensAt = 'Opening time is required.'
    if (!draft.closesAt) errors.closesAt = 'Closing time is required.'
    if (draft.opensAt && draft.opensAt === draft.closesAt) {
      errors.closesAt = 'Closing time must differ from opening time.'
    }
  }
  return errors
}

export function mutationFromDraft(draft: SupplierFormDraft): SupplierMutation {
  if (!draft.buildingCode) throw new Error('Building Code is required.')
  const common = {
    name: draft.name.trim(),
    categories: draft.categories,
    buildingCode: draft.buildingCode,
    floor: draft.floor.trim() || null,
    locationDescription: draft.locationDescription.trim(),
    latitude: draft.latitude.trim() ? Number(draft.latitude) : null,
    longitude: draft.longitude.trim() ? Number(draft.longitude) : null,
  }
  return draft.hoursKind === 'INTERVAL'
    ? {
        ...common,
        hoursKind: 'INTERVAL',
        opensAt: draft.opensAt,
        closesAt: draft.closesAt,
      }
    : { ...common, hoursKind: draft.hoursKind }
}
