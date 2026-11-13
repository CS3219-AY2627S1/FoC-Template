import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSupplierNames } from "@/hooks/use-supplier-names"

const mocks = vi.hoisted(() => ({ api: vi.fn(), user: { uid: "user" } }))

vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}))

beforeEach(() => {
  mocks.api.mockReset()
})
afterEach(cleanup)

describe("Order supplier names", () => {
  it("preserves resolved location labels", async () => {
    mocks.api.mockResolvedValue({
      items: [{ id: "pickup", name: "Cafe", building: "Block A" }],
      missingIds: [],
    })
    const { result } = renderHook(() => useSupplierNames(["pickup"]))

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.names.pickup).toBe("Cafe — Block A")
  })

  it("finishes loading when some referenced locations are missing", async () => {
    mocks.api.mockResolvedValue({
      items: [{ id: "pickup", name: "Cafe", building: "Block A" }],
      missingIds: ["delivery"],
    })
    const { result } = renderHook(() => useSupplierNames(["pickup", "delivery"]))

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.names).toEqual({
      pickup: "Cafe — Block A",
      delivery: "Deleted supplier",
    })
    expect(result.current.error).toBeNull()
  })

  it("finishes loading when all referenced locations are missing", async () => {
    mocks.api.mockResolvedValue({ items: [], missingIds: ["pickup", "delivery"] })
    const { result } = renderHook(() => useSupplierNames(["pickup", "delivery"]))

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.names).toEqual({
      pickup: "Deleted supplier",
      delivery: "Deleted supplier",
    })
    expect(result.current.loading).toBe(false)
  })
  it("finishes empty lookups even when missingIds is empty", async () => {
    mocks.api.mockResolvedValue({ items: [], missingIds: [] })
    const { result } = renderHook(() => useSupplierNames(["removed"]))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.names.removed).toBe("Deleted supplier")
  })

  it("does not label a transient lookup failure as deletion or block the list", async () => {
    mocks.api.mockRejectedValue(new Error("Service unavailable"))
    const { result } = renderHook(() => useSupplierNames(["pickup"]))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.names.pickup).toBeUndefined()
    expect(result.current.error).toBe("Service unavailable")
  })

  it("uses the deleted label when a successful lookup has no response body", async () => {
    mocks.api.mockResolvedValue(null)
    const { result } = renderHook(() => useSupplierNames(["removed"]))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.names.removed).toBe("Deleted supplier")
    expect(result.current.error).toBeNull()
  })
})
