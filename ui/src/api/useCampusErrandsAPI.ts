/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-14
Scope: Refactored the endpoint configuration and API hook into the requested service groups
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Added API calls for loading and updating the current profile
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Added API calls for listing managed users and granting or revoking admin access
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-10-27
Scope: Added the authenticated credit audit-log API call
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { useMemo } from 'react'
import type { Order, CreateOrderRequest, CreditBalance, OrderAction } from '../pages/orders/models'
import type { ResolutionAction, RepairAction, OrderReview } from './orderOperations'
import { makeAuthenticatedCampusErrandsAPIRequest, makeCampusErrandsAPIRequest } from './api'
import type { AuthenticatedRequestOptions } from './api'
import { endpointConfig } from './endpointConfig'
import type {
  SignInRequest,
  SignInResponse,
  SignOutResponse,
  SignUpRequest,
  SignUpResponse,
} from '../pages/authentication/models'
import type {
  Supplier,
  SupplierCreateRequest,
  SupplierUpdateRequest,
} from '../pages/suppliers/models'
import type { CurrentSession, CurrentUserProfile } from '../components/user/models'
import type {
  ListManagedUsersRequest,
  ManagedUser,
  UpdateManagedUserRoleRequest,
} from '../pages/adminManagerPortal/models'
import type { UpdateCurrentUserProfileRequest } from '../pages/profile/models'
import type { CreditAuditLog } from '../pages/creditAuditLogs/models'
import type { OrderAuditLog } from '../pages/orderAuditLogs/models'

export const useCampusErrandsAPI = () => useMemo(() => ({
  request: makeCampusErrandsAPIRequest,
  authenticatedRequest: makeAuthenticatedCampusErrandsAPIRequest,
  user: {
    authentication: {
      signIn: (request: SignInRequest) =>
        makeCampusErrandsAPIRequest<SignInRequest, SignInResponse>(
          request, endpointConfig.user.authentication.signIn,
        ),
      signUp: (request: SignUpRequest) =>
        makeCampusErrandsAPIRequest<SignUpRequest, SignUpResponse>(
          request, endpointConfig.user.authentication.signUp,
        ),
      verify: (options?: AuthenticatedRequestOptions) =>
        makeAuthenticatedCampusErrandsAPIRequest<null, CurrentSession>(
          null, endpointConfig.user.authentication.verify, options,
        ),
      signOut: () =>
        makeCampusErrandsAPIRequest<null, SignOutResponse>(
          null, endpointConfig.user.authentication.signOut,
        ),
      getCurrentUser: (options?: AuthenticatedRequestOptions) =>
        makeAuthenticatedCampusErrandsAPIRequest<null, CurrentUserProfile>(
          null, endpointConfig.user.authentication.getCurrentUser, options,
        ),
      updateCurrentUser: (request: UpdateCurrentUserProfileRequest) =>
        makeAuthenticatedCampusErrandsAPIRequest<UpdateCurrentUserProfileRequest, CurrentUserProfile>(
          request, endpointConfig.user.authentication.updateCurrentUser,
        ),
      listManagedUsers: (request: ListManagedUsersRequest) =>
        makeAuthenticatedCampusErrandsAPIRequest<ListManagedUsersRequest, ManagedUser[]>(
          request, endpointConfig.user.authentication.listManagedUsers,
        ),
      updateManagedUserRole: (request: UpdateManagedUserRoleRequest) =>
        makeAuthenticatedCampusErrandsAPIRequest<UpdateManagedUserRoleRequest, ManagedUser>(
          request, endpointConfig.user.authentication.updateManagedUserRole,
        ),
    },
  },
  supplier: {
    list: (options?: AuthenticatedRequestOptions) =>
      makeAuthenticatedCampusErrandsAPIRequest<null, Supplier[]>(
        null, endpointConfig.supplier.suppliers.list, options,
      ),
    create: (request: SupplierCreateRequest) =>
      makeAuthenticatedCampusErrandsAPIRequest<SupplierCreateRequest, Supplier>(
        request, endpointConfig.supplier.suppliers.create,
      ),
    update: (request: SupplierUpdateRequest) =>
      makeAuthenticatedCampusErrandsAPIRequest<SupplierUpdateRequest, Supplier>(
        request, endpointConfig.supplier.suppliers.update,
      ),
    remove: (id: string) =>
      makeAuthenticatedCampusErrandsAPIRequest<{ id: string }, null>(
        { id }, endpointConfig.supplier.suppliers.remove,
      ),
  },
  order: {
    disputed: () => makeAuthenticatedCampusErrandsAPIRequest<null, Order[]>(null, endpointConfig.order.orders.disputed),
    resolve: (id: string, action: ResolutionAction, reason: string) => makeAuthenticatedCampusErrandsAPIRequest<{ id: string; action: ResolutionAction; reason: string }, Order>({ id, action, reason }, endpointConfig.order.orders.resolve),
    review: (id: string) => makeAuthenticatedCampusErrandsAPIRequest<{ id: string }, OrderReview>({ id }, endpointConfig.order.orders.review),
    repair: (id: string, request_id: string, action: RepairAction, reason: string) => makeAuthenticatedCampusErrandsAPIRequest<{ id: string; request_id: string; action: RepairAction; reason: string }, Order>({ id, request_id, action, reason }, endpointConfig.order.orders.repair),
    open: () => makeAuthenticatedCampusErrandsAPIRequest<null, Order[]>(null, endpointConfig.order.orders.open),
    requested: () => makeAuthenticatedCampusErrandsAPIRequest<null, Order[]>(null, endpointConfig.order.orders.requested),
    assigned: () => makeAuthenticatedCampusErrandsAPIRequest<null, Order[]>(null, endpointConfig.order.orders.assigned),
    create: (request: CreateOrderRequest, idempotencyKey: string) => makeAuthenticatedCampusErrandsAPIRequest<CreateOrderRequest, Order>(request, endpointConfig.order.orders.create, { headers: { 'Idempotency-Key': idempotencyKey } }),
    dispute: (id: string, reason: string) => makeAuthenticatedCampusErrandsAPIRequest<{ id: string; reason: string }, Order>({ id, reason }, endpointConfig.order.orders.dispute),
    update: (id: string, action: OrderAction) => makeAuthenticatedCampusErrandsAPIRequest<{ id: string; action: OrderAction }, Order>({ id, action }, endpointConfig.order.orders.update),
    auditLogs: (id: string) => makeAuthenticatedCampusErrandsAPIRequest<{ id: string }, OrderAuditLog[]>({ id }, endpointConfig.order.orders.auditLogs),  },
  credit: {
    current: () => makeAuthenticatedCampusErrandsAPIRequest<null, CreditBalance>(null, endpointConfig.credit.credits.current),
    auditLogs: () => makeAuthenticatedCampusErrandsAPIRequest<null, CreditAuditLog[]>(null, endpointConfig.credit.credits.auditLogs),
  },
}), [])
