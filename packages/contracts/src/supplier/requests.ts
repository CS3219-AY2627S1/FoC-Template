import type { Location, OperatingHours, ServiceType } from './models'

/** Request to create a new supplier (admin only) */
export interface CreateSupplierRequest {
  name: string
  location: Location
  isOperational: boolean
  operatingHours: OperatingHours
  serviceTypes: ServiceType[]
}

/** Request to update an existing supplier (admin only) */
export interface UpdateSupplierRequest {
  name?: string
  location?: Location
  isOperational?: boolean
  operatingHours?: OperatingHours
  serviceTypes?: ServiceType[]
}

/** Query parameters for filtering the supplier list */
export interface GetSuppliersFilterParams {
  /** Operational status filter; 'all' or omitted means no status filter */
  status?: 'all' | 'operational' | 'not-operational'
  /** Service types to match (OR); an empty array matches no supplier */
  serviceTypes?: ServiceType[]
}

export type ValidateSupplierSelectionRequest = {
  supplierId: string
  /** TODO: require this once the errand create form sends serviceType. */
  serviceType?: ServiceType
}
