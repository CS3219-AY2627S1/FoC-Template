import type { Location, ServiceType, OperatingHours } from '../supplier/models'

/** States in the errand lifecycle. */
export const ErrandStatus = {
  Open: 'OPEN',
  Accepted: 'ACCEPTED',
  PickedUp: 'PICKED_UP',
  Delivered: 'DELIVERED',
  Cancelled: 'CANCELLED',
  Expired: 'EXPIRED',
  Confirmed: 'CONFIRMED',
  Deleted: 'DELETED',
} as const

export type ErrandStatus = (typeof ErrandStatus)[keyof typeof ErrandStatus]

/** Public listing scopes supported by the Errand Service. */
export type ErrandListScope = 'mine' | 'visible'

/** Supplier-facing views served through an authenticated backend boundary. */
export type SupplierErrandViewScope = 'explore' | 'mine'

/** A location snapshot stored with an errand (same shape as supplier.Location). */
export type ErrandLocation = Location

/** Delivery information owned by the Errand Service. */
export type DeliveryDetails = {
  description: string
  instructions?: string
}

/** Supplier details bundled together for errand creation. */
export type SupplierDetails = {
  supplierId: string
  supplierName: string
  serviceType: number
}

/** Privacy-safe profile details for an assigned courier. */
export type CourierProfile = {
  username: string | null
  profilePictureUrl: string | null
}

/** The public Errand Service representation of an errand. */
export type Errand = {
  id: string
  name: string
  /** Cognito sub of the user who created the errand. */
  requesterSub: string
  /** Cognito sub of the assigned courier, when accepted. */
  courierSub: string | null
  /** Profile summary for the assigned courier, when available. */
  courierProfile: CourierProfile | null
  supplierDetails: SupplierDetails
  pickupLocation: ErrandLocation
  targetLocation: ErrandLocation
  deliveryDetails: DeliveryDetails
  creditAmount: number
  status: ErrandStatus
  startAt: string
  expiresAt: string
  /** Server-generated confirmation deadline; set when the errand is delivered. */
  confirmationDeadline: string | null
  createdAt: string
  updatedAt: string
}

/** Supplier change event for errand service notifications. */
export type SupplierInfoEvent = {
  supplierId: string
  name?: string
  location?: ErrandLocation
  operatingHours?: OperatingHours
  isOperational?: boolean
  serviceTypes?: ServiceType[]
}

/** Privacy-safe errand projection used by supplier map and detail views. */
export type SupplierErrandSummary = Omit<Errand, 'requesterSub' | 'courierSub'>
