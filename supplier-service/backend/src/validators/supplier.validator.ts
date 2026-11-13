// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-06
// Scope: Implemented Supplier field validation and duplicate/error handling, check criteria and error messages defined by author.
// Author review: Reviewed every outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import { ServiceType, Day } from '@relay/contracts/supplier'

const HH_MM_REGEX = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/

export function validateLocation(location: any): string | null {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    return 'Location is required'
  }

  if (typeof location.lat !== 'number' || isNaN(location.lat)) {
    return 'Location lat is required and must be a number'
  }

  if (typeof location.lng !== 'number' || isNaN(location.lng)) {
    return 'Location lng is required and must be a number'
  }

  if (typeof location.buildingName !== 'string' || location.buildingName.trim() === '') {
    return 'Location buildingName is required and must be a string'
  }

  if (typeof location.floorNumber !== 'number' || isNaN(location.floorNumber)) {
    return 'Location floorNumber is required and must be a number'
  }

  return null
}

export function validateOperatingHours(operatingHours: any): string | null {
  if (!operatingHours || typeof operatingHours !== 'object' || Array.isArray(operatingHours)) {
    return 'OperatingHours is required'
  }

  if (
    typeof operatingHours.openingTime !== 'string' ||
    !HH_MM_REGEX.test(operatingHours.openingTime)
  ) {
    return 'OperatingHours openingTime is required in HH:mm format'
  }

  if (
    typeof operatingHours.closingTime !== 'string' ||
    !HH_MM_REGEX.test(operatingHours.closingTime)
  ) {
    return 'OperatingHours closingTime is required in HH:mm format'
  }

  if (!Array.isArray(operatingHours.daysOfWeek) || operatingHours.daysOfWeek.length === 0) {
    return 'OperatingHours daysOfWeek must be a non-empty array of valid days'
  }

  const daysOfWeekArray: number[] = operatingHours.daysOfWeek
  const validDays: readonly number[] = Object.values(Day)

  for (let i = 0; i < daysOfWeekArray.length; i++) {
    const day = daysOfWeekArray[i]
    if (typeof day !== 'number' || !validDays.includes(day)) {
      return 'OperatingHours daysOfWeek contains invalid day'
    }
  }

  return null
}

export function validateServiceTypes(serviceTypes: any): string | null {
  if (!Array.isArray(serviceTypes) || serviceTypes.length === 0) {
    return 'serviceTypes must be a non-empty array of valid service types'
  }
  const serviceTypeArray: number[] = serviceTypes
  const validServiceTypes: readonly number[] = Object.values(ServiceType)

  for (let i = 0; i < serviceTypeArray.length; i++) {
    const type: number = serviceTypeArray[i]
    if (typeof type !== 'number' || !validServiceTypes.includes(type)) {
      return 'serviceTypes contains invalid service type'
    }
  }

  return null
}
