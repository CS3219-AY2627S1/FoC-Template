import type { Location, OperatingHours, ServiceType } from '@relay/contracts/supplier'
import type { SupplierErrorCode } from '@relay/contracts/supplier'

export interface SupplierRow {
  id: string
  name: string
  location: Location
  is_operational: boolean
  operating_hours: OperatingHours
  service_types: ServiceType[]
  created_at: string
  updated_at: string
}

export class SupplierServiceError extends Error {
  constructor(
    public readonly code: SupplierErrorCode,
    message: string,
    public readonly statusCode = 500,
  ) {
    super(message)
    this.name = 'SupplierServiceError'
  }
}
