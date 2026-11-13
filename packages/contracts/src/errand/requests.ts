import type {
  DeliveryDetails,
  ErrandListScope,
  ErrandLocation,
  SupplierDetails,
  SupplierErrandViewScope,
} from './models'

/** Request to create an errand. The requester is taken from the session. */
export type CreateErrandRequest = {
  supplierDetails: SupplierDetails
  name: string
  pickupLocation: ErrandLocation
  targetLocation: ErrandLocation
  deliveryDetails: DeliveryDetails
  creditAmount: number
  startAt?: string
  expiresAt?: string
}

/** Request to accept an errand. No body needed - authenticated via session. */
export type AcceptErrandRequest = {}

/** Request to cancel an errand. No body needed - authenticated via session. */
export type CancelErrandRequest = {}
export type GetErrandsOptions = {
  scope?: ErrandListScope
}

export type SupplierErrandViewRequest = {
  scope: SupplierErrandViewScope
  supplierId: string
}
