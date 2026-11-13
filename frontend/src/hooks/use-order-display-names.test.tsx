import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useOrderDisplayNames } from "./use-order-display-names"
import { ApiError } from "@/lib/api"
import type { AdminOrder } from "@/lib/admin-api"
const api = vi.hoisted(() => ({ mode: "live", recordName: vi.fn() }))
vi.mock("@/hooks/use-admin-api", () => ({ useAdminApi: () => api }))
const order = { requesterId: "user", courierId: "user", pickupSupplierId: "place", deliverySupplierId: "place" } as AdminOrder
beforeEach(() => { api.mode = "live"; api.recordName.mockReset() })
afterEach(cleanup)
describe("Order display names", () => {
  it("looks up additional account IDs without requiring an associated order", async () => {
    api.recordName.mockResolvedValue("Resolver name")
    const { result } = renderHook(() => useOrderDisplayNames([], ["admin", "admin", null]))
    await waitFor(() => expect(result.current("users", "admin")).toBe("Resolver name"))
    expect(api.recordName).toHaveBeenCalledTimes(1)
    expect(api.recordName).toHaveBeenCalledWith("users", "admin", expect.any(AbortSignal))
  })
  it("resolves repeated participants/locations once without mutating stored IDs", async () => {
    api.recordName.mockImplementation(async (kind: string) => kind === "users" ? "Alex" : "The Deck")
    const { result } = renderHook(() => useOrderDisplayNames([order, order]))
    await waitFor(() => expect(result.current("users", "user")).toBe("Alex"))
    expect(result.current("suppliers", "place")).toBe("The Deck")
    expect(api.recordName).toHaveBeenCalledTimes(2)
    expect(order.requesterId).toBe("user")
  })
  it("distinguishes deleted records from temporary service failures", async () => {
    api.recordName.mockImplementation(async (kind: string) => { throw new ApiError(kind === "users" ? 404 : 503, "FAILED", "failed") })
    const { result } = renderHook(() => useOrderDisplayNames([order]))
    await waitFor(() => expect(result.current("users", "user")).toBe("Deleted user"))
    expect(result.current("suppliers", "place")).toBe("Supplier unavailable")
  })
  it("retains sample names without issuing real peer requests", () => {
    api.mode = "mock"
    const { result } = renderHook(() => useOrderDisplayNames([order]))
    expect(result.current("users", "user", "Sample Alex")).toBe("Sample Alex")
    expect(api.recordName).not.toHaveBeenCalled()
  })
  it("aborts obsolete lookups and never applies an earlier row's result to a new ID", async () => {
    const signals: AbortSignal[] = []
    api.recordName.mockImplementation((_kind: string, _id: string, signal: AbortSignal) => { signals.push(signal); return new Promise(() => {}) })
    const { result, rerender, unmount } = renderHook(({ data }) => useOrderDisplayNames([data]), { initialProps: { data: order } })
    expect(result.current("users", "user")).toBe("Loading user…")
    rerender({ data: { ...order, requesterId: "another" } })
    expect(signals[0].aborted).toBe(true)
    unmount(); expect(signals.every(signal => signal.aborted)).toBe(true)
  })
})
