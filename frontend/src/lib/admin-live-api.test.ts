import { describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { createAdminApi } from "@/lib/admin-api"

describe("Live Admin API adapter", () => {
  it("filters action eligibility in the server query even with an exact ID", async () => {
    const request = vi.fn().mockResolvedValue({ items: [], page: 2, totalItems: 0, totalPages: 0 })
    const api = createAdminApi(request)
    await api.orders({ page: 2, status: "ACCEPTED", orderId: " order/1 ", actionEligibleOnly: true })
    const path = request.mock.calls[0][0]
    expect(path).toMatch(/^\/api\/orders\?/)
    expect(Object.fromEntries(new URLSearchParams(path.split("?")[1]))).toEqual({
      page: "2", size: "20", status: "ACCEPTED", orderId: "order/1", actionEligibleOnly: "true",
    })
  })
  it("combines calendar bounds, status and exact ID on the server before pagination", async () => {
    const request = vi.fn().mockResolvedValue({ items: [], totalItems: 0 })
    const api = createAdminApi(request)
    await api.orders({ page: 2, status: "DELIVERED", orderId: "order/1", fromDate: "2026-10-16", toDate: "2026-10-17" })
    const params = new URLSearchParams(request.mock.calls[0][0].split("?")[1])
    expect(request.mock.calls[0][0]).toMatch(/^\/api\/orders\?/)
    expect(Object.fromEntries(params)).toMatchObject({ page: "2", size: "20", status: "DELIVERED", orderId: "order/1" })
    expect(new Date(params.get("createdFrom")!).getDate()).toBe(16)
    expect(new Date(params.get("createdBefore")!).getDate()).toBe(18)
    expect(request).toHaveBeenCalledTimes(1)
  })
  it("posts an explicit resolution to the real endpoint and never falls back on failure", async () => {
    const request = vi.fn().mockRejectedValue(new ApiError(409, "CONFLICT", "Order changed"))
    const api = createAdminApi(request)
    const input = { requesterId: "owner", courierId: "worker", appliedPenalties: [], resolutionReason: "Delivery confirmed" }
    await expect(api.resolveOrder("order/1", "cancel", input)).rejects.toThrow("Order changed")
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/orders/admin/order%2F1/cancel", { method: "POST", body: input })
  })
  it("checks the authenticated role context without sending a trusted caller ID", async () => {
    const request = vi.fn().mockResolvedValue({ userId: "signed-in", roles: ["admin"] })
    const api = createAdminApi(request)
    await api.roleContext("signed-in")
    expect(request).toHaveBeenCalledWith("/api/users/role-context", { signal: undefined })
  })

  it("uses real server-filtered Order pages and exact details", async () => {
    const request = vi.fn().mockResolvedValue({ items: [{ id: "order-1" }], page: 2, size: 20, totalItems: 21, totalPages: 2 })
    const api = createAdminApi(request)
    const result = await api.orders({ page: 2, status: "COMPLETED", orderId: "" })
    expect(request).toHaveBeenCalledWith("/api/orders?page=2&size=20&status=COMPLETED", { signal: undefined })
    expect(result.totalItems).toBe(21)
    request.mockResolvedValue({ id: "order/1", status: "OPEN" })
    await api.order("order/1")
    expect(request).toHaveBeenLastCalledWith("/api/orders/order%2F1", { signal: undefined })
    const unmatched = await api.orders({ page: 1, status: "COMPLETED", orderId: "order/1" })
    expect(unmatched.items).toEqual([])
    expect(unmatched.size).toBe(20)
  })

  it("turns only missing exact searches into empty results; real errors never fall back to mocks", async () => {
    const request = vi.fn().mockRejectedValue(new ApiError(404, "NOT_FOUND", "Missing"))
    const api = createAdminApi(request)
    expect((await api.suppliers({ page: 1, searchBy: "id", q: "missing" })).items).toEqual([])
    expect((await api.orders({ page: 1, status: null, orderId: "missing" })).items).toEqual([])
    for (const status of [401, 403, 503]) {
      request.mockRejectedValue(new ApiError(status, "FAILURE", "Real failure"))
      await expect(api.orders({ page: 1, status: null, orderId: "missing" })).rejects.toThrow("Real failure")
      await expect(api.suppliers({ page: 1, searchBy: "id", q: "missing" })).rejects.toThrow("Real failure")
    }
    expect(request.mock.calls.every(([path]) => !path.includes("admin-mock"))).toBe(true)
  })

  it("loads actual Supplier types with authentication transport and propagates failures", async () => {
    const request = vi.fn().mockResolvedValue({ items: ["Food/Coffee", "Library"] })
    const api = createAdminApi(request)
    const controller = new AbortController()
    expect(await api.supplierTypes(controller.signal)).toEqual(["Food/Coffee", "Library"])
    expect(request).toHaveBeenCalledWith("/api/suppliers/types", { signal: controller.signal })
    const failure = new ApiError(503, "SERVICE_UNAVAILABLE", "Types unavailable")
    request.mockRejectedValue(failure)
    await expect(api.supplierTypes()).rejects.toBe(failure)
  })

  it("reuses Supplier search/create/edit/soft-deactivation contracts", async () => {
    const request = vi.fn().mockResolvedValue({ items: [] })
    const api = createAdminApi(request)
    await api.suppliers({ page: 2, searchBy: "name", q: " Deck " })
    expect(request).toHaveBeenLastCalledWith("/api/suppliers?page=2&size=10&status=all&q=Deck", { signal: undefined })
    const input = { name: "Deck", type: "Food", building: "Arts", floor: "", locationDescription: "",
      latitude: 1.3, longitude: 103.8, openingTime: "09:00", closingTime: "18:00", imageUrl: "" }
    await api.createSupplier(input)
    expect(request).toHaveBeenLastCalledWith("/api/suppliers", { method: "POST", body: { ...input, imageUrl: null } })
    await api.createSupplier({ ...input, imageUrl: "   " })
    expect(request).toHaveBeenLastCalledWith("/api/suppliers", { method: "POST", body: { ...input, imageUrl: null } })
    await api.createSupplier({ ...input, imageUrl: "https://example.com/location.jpg" })
    expect(request).toHaveBeenLastCalledWith("/api/suppliers", { method: "POST",
      body: { ...input, imageUrl: "https://example.com/location.jpg" } })
    await api.updateSupplier("supplier/1", { imageUrl: "" })
    expect(request).toHaveBeenLastCalledWith("/api/suppliers/supplier%2F1", { method: "PATCH", body: { imageUrl: "" } })
    await api.updateSupplier("supplier/1", { closingTime: "21:30" })
    expect(request).toHaveBeenLastCalledWith("/api/suppliers/supplier%2F1", { method: "PATCH", body: { closingTime: "21:30" } })
    await api.deactivateSupplier("supplier/1")
    expect(request).toHaveBeenLastCalledWith("/api/suppliers/supplier%2F1", { method: "DELETE" })
    await api.reactivateSupplier("supplier/1")
    expect(request).toHaveBeenLastCalledWith("/api/suppliers/supplier%2F1", { method: "PATCH", body: { active: true } })
  })

  it("preserves existing summary facts without fabricating missing profile or credit fields", async () => {
    const request = vi.fn().mockResolvedValue({ userId: "user/1", username: "Alex", email: "alex@u.nus.edu",
      roles: ["courier"], penalty: 2, isCourierSuspended: false, suspensionEndDate: null })
    const api = createAdminApi(request)
    const user = await api.user("user/1")
    expect(request).toHaveBeenLastCalledWith("/api/users/user%2F1", { signal: undefined })
    expect(user).toMatchObject({ userId: "user/1", username: "Alex", penalty: 2, active: null,
      id: null, phoneNumber: null, address: null, usableBalance: null, reservedBalance: null, totalBalance: null })
  })

  it("rejects a mismatched selected profile and resolves related labels through existing endpoints", async () => {
    const request = vi.fn().mockResolvedValue({ userId: "another-user", username: "Wrong" })
    const api = createAdminApi(request)
    await expect(api.user("user-1")).rejects.toThrow("does not match")
    request.mockResolvedValue({ userId: "user-1", username: "Alex" })
    expect(await api.recordName("users", "user-1")).toBe("Alex")
    expect(request).toHaveBeenLastCalledWith("/api/users/summary/user-1", { signal: undefined })
    request.mockResolvedValue({ id: "supplier-1", name: "Deck" })
    expect(await api.recordName("suppliers", "supplier-1")).toBe("Deck")
    expect(request).toHaveBeenLastCalledWith("/api/suppliers/supplier-1", { signal: undefined })
    const result = await api.suppliers({ page: 1, searchBy: "id", q: "supplier-1" })
    expect(result).toMatchObject({ items: [{ id: "supplier-1" }], page: 1, totalItems: 1, totalPages: 1 })
  })

  it("does not attach another record's name and handles empty lookup results", async () => {
    const request = vi.fn().mockResolvedValue({ userId: "other", username: "Wrong user" })
    const api = createAdminApi(request)
    await expect(api.recordName("users", "user-1")).rejects.toThrow("does not match")
    request.mockResolvedValue({ id: "other", name: "Wrong location" })
    await expect(api.recordName("suppliers", "supplier-1")).rejects.toThrow("does not match")
    request.mockResolvedValue(null)
    expect(await api.recordName("users", "user-1")).toBeNull()
    expect(await api.recordName("suppliers", "supplier-1")).toBeNull()
    request.mockResolvedValue({ userId: "user-1", username: "  " })
    expect(await api.recordName("users", "user-1")).toBeNull()
  })

  it("loads the selected user's real Credit history with pagination and cancellation", async () => {
    const history = { items: [{ transactionId: "transaction-1", type: "REFUNDED_EXPIRY",
      amount: 5, direction: "CREDIT", occurredAt: "2026-10-15T00:00:00Z", orderId: "order-1" }],
      page: 2, size: 20, totalItems: 21, totalPages: 2 }
    const request = vi.fn().mockResolvedValue(history)
    const api = createAdminApi(request)
    const signal = new AbortController().signal
    expect(await api.userTransactions("user/1", 2, signal)).toEqual(history)
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/api/credits/users/user%2F1/transactions?page=2&size=20", { signal })
    expect(api.capabilities.creditTransactions).toBe(true)
  })

  it("preserves empty Credit pages and propagates account/auth/service errors without a mock fallback", async () => {
    const empty = { items: [], page: 1, size: 20, totalItems: 0, totalPages: 0 }
    const request = vi.fn().mockResolvedValue(empty)
    const api = createAdminApi(request)
    expect(await api.userTransactions("user-1", 1)).toEqual(empty)
    for (const status of [401, 403, 404, 503]) {
      const error = new ApiError(status, "FAILURE", "Credit request failed")
      request.mockRejectedValue(error)
      await expect(api.userTransactions("user-1", 1)).rejects.toBe(error)
    }
    expect(request.mock.calls).toHaveLength(5)
    expect(request.mock.calls.every(([path]) => path === "/api/credits/users/user-1/transactions?page=1&size=20")).toBe(true)
  })
})
