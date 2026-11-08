import { ApiError, type RequestOptions } from "@/lib/api"
import type { CreditTransactionPage } from "@/lib/credit-transactions"
import type { Order, OrderStatus } from "@/lib/orders"
import type { Page, Supplier, SupplierInput } from "@/lib/suppliers"
import { adminOrderDateBounds } from "@/lib/admin-order-dates"

export type AdminOrder = Order & {
  requesterName: string | null
  courierName: string | null
  pickupSupplierName: string | null
  deliverySupplierName: string | null
}

export type AdminUser = {
  id: string | null
  userId: string
  username: string
  email: string
  roles: string[]
  penalty: number
  isCourierSuspended: boolean
  suspensionEndDate: string | null
  phoneNumber: string | null
  address: string | null
  active: boolean | null
  accountStatus?: string | null
  usableBalance: number | null
  reservedBalance: number | null
  totalBalance: number | null
}

export type AdminRoleContext = { userId: string; roles: string[] }
export type AdminSearch = { page: number; searchBy: "name" | "id"; q: string }
export type AdminOrderQuery = { page: number; status: OrderStatus | null; orderId: string; fromDate?: string; toDate?: string; actionEligibleOnly?: boolean }
export type AdminRequest = <T>(path: string, options?: Omit<RequestOptions, "token">) => Promise<T>
export type AdminApiMode = "mock" | "live"
export type AdminOrderAction = "cancel"
export type ApplyPenaltyInput = { commandId: string; courierId: string; expectedVersion: number; policy: string; reason: string }
export type PenaltyPolicy = { policy: string; penaltyAmount: number }
export type AdminOrderResolution = {
  requesterId: string
  courierId: string | null
  appliedPenalties: string[]
  resolutionReason: string
}

export const ADMIN_ORDER_STATUSES: OrderStatus[] = [
  "OPEN", "ACCEPTED", "IN_PROGRESS", "PICKED_UP", "DELIVERED",
  "COMPLETED", "CANCELLED", "ABORTED", "EXPIRED",
]

export const ADMIN_ACTION_ELIGIBLE_STATUSES: readonly OrderStatus[] = [
  "OPEN", "ACCEPTED", "IN_PROGRESS", "PICKED_UP", "DELIVERED",
]

const ADMIN_TABLE_PAGE_SIZE = 20

/** Administrative operations always use provider APIs. Reports have a separate local demo transport. */
export function createAdminApi(request: AdminRequest) {
  return createLiveAdminApi(request)
}

function createLiveAdminApi(request: AdminRequest) {
  const detail = (root: string, id: string) => root + "/" + encodeURIComponent(id)
  const supplier = (id: string, signal?: AbortSignal) => request<Supplier>(detail("/api/suppliers", id), { signal })
  const summary = (id: string, signal?: AbortSignal) =>
    request<Pick<AdminUser, "userId" | "username" | "email" | "roles" | "penalty" | "isCourierSuspended" | "suspensionEndDate">>(
      detail("/api/users/summary", id), { signal })
  const order = async (id: string, signal?: AbortSignal): Promise<AdminOrder> =>
    adminOrder(await request<Order>(detail("/api/orders", id), { signal }))

  const profile = async (id: string, signal?: AbortSignal) => normalizeUser(await request<UserProfile>(detail("/api/users", id), { signal }), id)
  return {
    mode: "live" as const,
    capabilities: { userDirectory: true, userActions: true, creditTransactions: true },
    penaltyPolicies: (signal?: AbortSignal) => request<PenaltyPolicy[]>("/api/orders/admin/penalty-policies", { signal }),
    applyPenalty: async (id: string, body: ApplyPenaltyInput) => adminOrder(await request<Order>(detail("/api/orders/admin", id) + "/apply-penalty", { method: "POST", body })),
    resolveOrder: async (id: string, action: AdminOrderAction, input: AdminOrderResolution) =>
      adminOrder(await request<Order>(detail("/api/orders/admin", id) + "/" + action, { method: "POST", body: input })),
    roleContext: (_userId: string, signal?: AbortSignal) => request<AdminRoleContext>("/api/users/role-context", { signal }),
    orders: async (query: AdminOrderQuery, signal?: AbortSignal): Promise<Page<AdminOrder>> => {
      if (query.orderId.trim() && !query.fromDate && !query.toDate && !query.actionEligibleOnly) {
        return exactPage(() => order(query.orderId.trim(), signal), query.page,
          (result) => !query.status || result.status === query.status, ADMIN_TABLE_PAGE_SIZE)
      }
      const params = new URLSearchParams({ page: String(query.page), size: String(ADMIN_TABLE_PAGE_SIZE) })
      if (query.actionEligibleOnly) params.set("actionEligibleOnly", "true")
      if (query.status) params.set("status", query.status)
      if (query.orderId.trim()) params.set("orderId", query.orderId.trim())
      addDateBounds(params, query)
      const result = await request<Page<Order>>("/api/orders?" + params, { signal })
      return { ...result, items: result.items.map(adminOrder) }
    },
    order,
    user: profile,
    userBalance: async (id: string, signal?: AbortSignal) => {
      const balance = await request<Pick<AdminUser, "userId" | "usableBalance" | "reservedBalance" | "totalBalance">>(detail("/api/credits/users", id) + "/balance", { signal })
      if (!balance || balance.userId !== id) throw new Error("Credit balance does not match the requested user.")
      return balance
    },
    users: async (query: AdminSearch, signal?: AbortSignal): Promise<Page<AdminUser>> => {
      const params = new URLSearchParams({ page: String(query.page), size: String(ADMIN_TABLE_PAGE_SIZE), searchBy: query.searchBy })
      if (query.q.trim()) params.set("q", query.q.trim())
      const result = await request<Page<UserProfile>>("/api/users/admin/search?" + params, { signal })
      return { ...result, items: result.items.map(user => normalizeUser(user, user.userId)) }
    },
    userTransactions: (id: string, page: number, signal?: AbortSignal) =>
      request<CreditTransactionPage>(detail("/api/credits/users", id) + "/transactions?" +
        new URLSearchParams({ page: String(page), size: "20" }), { signal }),
    promoteUser: async (id: string) => normalizeUser(await request<UserProfile>(detail("/api/users", id) + "/user-promotion", { method: "PUT" }), id),
    suspendUser: async (id: string) => normalizeUser(await request<UserProfile>(detail("/api/users", id) + "/suspension", { method: "PUT" }), id),
    unsuspendUser: async (id: string) => normalizeUser(await request<UserProfile>(detail("/api/users", id) + "/suspension-removal", { method: "PUT" }), id),
    deactivateUser: async (id: string) => {
      await request<unknown>(detail("/api/users", id), { method: "DELETE" })
      return profile(id)
    },
    suppliers: (query: AdminSearch, signal?: AbortSignal): Promise<Page<Supplier>> => {
      if (query.searchBy === "id" && query.q.trim()) return exactPage(() => supplier(query.q.trim(), signal), query.page)
      const params = new URLSearchParams({ page: String(query.page), size: "10", status: "all" })
      if (query.q.trim()) params.set("q", query.q.trim())
      return request<Page<Supplier>>("/api/suppliers?" + params, { signal })
    },
    supplier,
    createSupplier: (input: SupplierInput) => request<Supplier>("/api/suppliers", { method: "POST", body: input }),
    // PATCH only the edited fields so concurrent edits to other fields are not overwritten.
    updateSupplier: (id: string, changes: Partial<SupplierInput>) =>
      request<Supplier>(detail("/api/suppliers", id), { method: "PATCH", body: changes }),
    deactivateSupplier: (id: string) => request<Supplier>(detail("/api/suppliers", id), { method: "DELETE" }),
    reactivateSupplier: (id: string) => request<Supplier>(detail("/api/suppliers", id), { method: "PATCH", body: { active: true } }),
    // Label requests are independent of the primary Order query and its loading state.
    recordName: async (kind: "users" | "suppliers", id: string, signal?: AbortSignal): Promise<string | null> =>
    {
      if (kind === "users") {
        const result = await summary(id, signal)
        if (!result) return null
        if (result.userId !== id) throw new Error("User summary does not match the requested user.")
        return result.username?.trim() || null
      }
      const result = await supplier(id, signal)
      if (!result) return null
      if (result.id !== id) throw new Error("Supplier does not match the requested supplier.")
      return result.name?.trim() || null
    },
  }
}

function addDateBounds(params: URLSearchParams, query: AdminOrderQuery) {
  const bounds = adminOrderDateBounds(query.fromDate, query.toDate)
  if (bounds.createdFrom) params.set("createdFrom", bounds.createdFrom)
  if (bounds.createdBefore) params.set("createdBefore", bounds.createdBefore)
}

function adminOrder(order: Order): AdminOrder {
  return { ...order, requesterName: null, courierName: null, pickupSupplierName: null, deliverySupplierName: null }
}

async function exactPage<T>(load: () => Promise<T>, page: number, matches: (item: T) => boolean = () => true, size = 10): Promise<Page<T>> {
  try {
    const item = await load()
    const totalItems = matches(item) ? 1 : 0
    return { items: page === 1 && totalItems ? [item] : [], page, size, totalItems, totalPages: totalItems }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error
    return { items: [], page, size, totalItems: 0, totalPages: 0 }
  }
}


type UserProfile = Pick<AdminUser, "id" | "userId" | "username" | "email" | "roles" | "penalty" | "isCourierSuspended" | "suspensionEndDate"> & { status?: string; phoneNumber?: string | null; address?: string | null }
function normalizeUser(result: UserProfile, id: string): AdminUser {
  if (!result || result.userId !== id) throw new Error("User profile does not match the requested user.")
  return { id: result.id ?? null, userId: result.userId, username: result.username, email: result.email,
    roles: result.roles, penalty: result.penalty, isCourierSuspended: result.isCourierSuspended, suspensionEndDate: result.suspensionEndDate,
    phoneNumber: result.phoneNumber ?? null, address: result.address ?? null, accountStatus: result.status ?? null,
    active: result.status === "ACTIVE" ? true : result.status === "DEACTIVATED" || result.status === "DEACTIVATION_PENDING" ? false : null,
    usableBalance: null, reservedBalance: null, totalBalance: null }
}
