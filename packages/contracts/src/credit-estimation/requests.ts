import type { ServiceType as SupplierServiceType } from '../supplier/models'

/** Request to estimate credit for an errand. */
export type EstimateCreditRequest = {
  name: string
  description: string
  serviceType: SupplierServiceType
  instructions: string
  startAt: string
  expiresAt: string
  userId: string
  availableCredit: number
}
