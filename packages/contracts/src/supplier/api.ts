import type {
  CreateSupplierRequest,
  GetSuppliersFilterParams,
  UpdateSupplierRequest,
} from './requests'
import type {
  GetSuppliersResponse,
  GetSupplierResponse,
  CreateSupplierResponse,
  UpdateSupplierResponse,
} from './responses'

/** Async boundary implemented by an HTTP adapter in the Supplier UI */
export interface SupplierApi {
  /** Get all suppliers, optionally filtered (public) */
  getSuppliers(filters?: GetSuppliersFilterParams): Promise<GetSuppliersResponse>
  /** Get a single supplier by ID (public) */
  getSupplier(id: string): Promise<GetSupplierResponse>
  /** Add a new supplier (admin only - validated via SessionId) */
  addSupplier(request: CreateSupplierRequest): Promise<CreateSupplierResponse>
  /** Update an existing supplier (admin only - validated via SessionId) */
  updateSupplier(id: string, request: UpdateSupplierRequest): Promise<UpdateSupplierResponse>
  /** Remove a supplier (admin only - validated via SessionId) */
  removeSupplier(id: string): Promise<void>
}
