import type { CreateErrandRequest, GetErrandsOptions, SupplierErrandViewRequest } from './requests'
import type { SupplierInfoEvent } from './models'
import type {
  CreateErrandResponse,
  DeleteErrandResponse,
  GetErrandResponse,
  GetErrandsResponse,
  ListOpenBySupplierResponse,
  AcceptErrandResponse,
  PickupErrandResponse,
  DeliverErrandResponse,
  ConfirmErrandResponse,
  CancelErrandResponse,
  DropErrandResponse,
  GetSupplierErrandViewResponse,
  SupplierEventsResponse,
} from './responses'

/** Browser-facing Errand Service boundary. */
export interface ErrandApi {
  /** Create an errand for the authenticated requester. */
  createErrand(request: CreateErrandRequest): Promise<CreateErrandResponse>

  /** List errands visible to the authenticated user. */
  getErrands(options?: GetErrandsOptions): Promise<GetErrandsResponse>

  /** List open errands for a specific supplier (for courier discovery when viewing supplier). */
  listOpenBySupplier(supplierId: string): Promise<ListOpenBySupplierResponse>

  /** List errands for a selected supplier in the authenticated user's view. */
  getSupplierErrandView(request: SupplierErrandViewRequest): Promise<GetSupplierErrandViewResponse>
  /** List all errands for a specific supplier (when viewing supplier details). */
  listBySupplier(supplierId: string): Promise<GetErrandsResponse>

  /** Retrieve an errand visible to the authenticated user. */
  getErrand(id: string): Promise<GetErrandResponse>

  /** Accept an open errand (courier only). */
  acceptErrand(id: string): Promise<AcceptErrandResponse>

  /** Pick up the errand (courier only). */
  pickupErrand(id: string): Promise<PickupErrandResponse>

  /** Deliver the errand (courier only). */
  deliverErrand(id: string): Promise<DeliverErrandResponse>

  /** Confirm the delivered errand has been received (requester only). */
  confirmErrand(id: string): Promise<ConfirmErrandResponse>

  /** Cancel an open errand created by the requester (requester only). */
  cancelErrand(id: string): Promise<CancelErrandResponse>

  /** Drop an accepted errand (courier only). */
  dropErrand(id: string): Promise<DropErrandResponse>

  /** Delete a cancelled, expired, or confirmed errand owned by the requester. */
  deleteErrand(id: string): Promise<DeleteErrandResponse>
}

/**
 * Internal Errand Service boundary for supplier event processing.
 * Not exposed to browsers; authenticated with service token.
 */
export interface ErrandInternalApi {
  /** Receive supplier change notifications from Supplier Service. */
  receiveSupplierEvent(event: SupplierInfoEvent): Promise<SupplierEventsResponse>
}
