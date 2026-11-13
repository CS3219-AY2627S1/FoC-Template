import type { Supplier } from './models'

/** Response when listing multiple suppliers */
export interface GetSuppliersResponse {
  suppliers: Supplier[]
}

export type SupplierValidationFailureCode =
  'SUPPLIER_NOT_FOUND' | 'SUPPLIER_INACTIVE' | 'SERVICE_TYPE_NOT_OFFERED'

export type ValidateSupplierSelectionResponse =
  | {
      valid: true
      supplierId: string
      serviceType?: number
    }
  | {
      valid: false
      supplierId: string
      code: SupplierValidationFailureCode
      message: string
    }

/** Response when retrieving a single supplier */
export interface GetSupplierResponse {
  supplier: Supplier
}

/** Response when creating a supplier */
export interface CreateSupplierResponse {
  supplier: Supplier
}

/** Response when updating a supplier */
export interface UpdateSupplierResponse {
  supplier: Supplier
}
