import type { Errand, SupplierErrandSummary } from './models'

export type CreateErrandResponse = {
  errand: Errand
}

export type GetErrandsResponse = {
  errands: Errand[]
}

export type GetErrandResponse = {
  errand: Errand
}

export type GetSupplierErrandViewResponse = {
  errands: SupplierErrandSummary[]
}

export type DeleteErrandResponse = undefined

/** Response from listing open errands by supplier (for discovery). */
export type ListOpenBySupplierResponse = {
  errands: Errand[]
}

/** Response from accepting an errand. */
export type AcceptErrandResponse = {
  errand: Errand
}

/** Response from picking up an errand. */
export type PickupErrandResponse = {
  errand: Errand
}

/** Response from delivering an errand. */
export type DeliverErrandResponse = {
  errand: Errand
}

/** Response from confirming an errand. */
export type ConfirmErrandResponse = {
  errand: Errand
}

/** Response from canceling an errand. */
export type CancelErrandResponse = {
  errand: Errand
}

/** Response from dropping an accepted errand. */
export type DropErrandResponse = {
  errand: Errand
}

/** Response from supplier event processing. */
export type SupplierEventsResponse = {
  processed: boolean
  affectedErrandIds: string[]
}
