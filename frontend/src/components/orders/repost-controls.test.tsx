import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RepostControls } from "@/components/orders/repost-controls"
import type { Order } from "@/lib/orders"
import { ApiError } from "@/lib/api"

const mocks = vi.hoisted(() => ({ api: vi.fn(), error: vi.fn(), user: { uid: "requester-1" } }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }))
// Retain coverage for explicitly disabled-recovery deployments using the hook's legacy branch.
vi.mock("@/hooks/use-order-command", () => ({ useOrderCommand: (_scope: string, success: (order: Order) => void) => ({
  ready: true, pending: false, message: null, needsAuthorization: false, continueRecovery: vi.fn(),
  run: async (_kind: string, path: string, body: Record<string, unknown>) => success(await mocks.api(path, { method: "POST", body })),
}) }))

const expiredOrder: Order = {
  id: "old-order", requesterId: "requester-1", courierId: null, itemDescription: "Pick up a parcel",
  pickupSupplierId: "store", deliverySupplierId: "hall", offeredCredits: 2, status: "EXPIRED",
  createdAt: new Date(2026, 9, 7, 10).toISOString(), expiresAt: new Date(2026, 9, 7, 11, 7).toISOString(),
  deliveryTimeLimitMinutes: 15, version: 2, originalOrderId: null, repostedOrderId: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 8, 10, 1, 30))
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe("manual repost quarter-hour expiry", () => {
  it("renders the saved manual or automatic failure after a full component remount", () => {
    const persisted = Object.assign({}, expiredOrder, {
      repostFailureMessage: "Repost failed: insufficient available credits.",
      repostFailureAt: "2026-10-08T10:00:00Z",
    })
    const first = render(<RepostControls order={persisted} onUpdated={vi.fn()} />)
    expect(screen.getByRole("alert")).toHaveTextContent(persisted.repostFailureMessage)
    first.unmount()
    render(<RepostControls order={persisted} onUpdated={vi.fn()} />)
    expect(screen.getByRole("alert")).toHaveTextContent(persisted.repostFailureMessage)
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it("keeps the expired card and shows only the semantic insufficient-credit message", async () => {
    const updated = vi.fn()
    mocks.api.mockRejectedValue(new ApiError(409, "INSUFFICIENT_CREDITS", "raw peer details"))
    render(<RepostControls order={expiredOrder} onUpdated={updated} />)
    fireEvent.click(screen.getByRole("button", { name: "Create repost" }))
    expect(await screen.findByText("Repost failed: insufficient available credits.")).toBeInTheDocument()
    expect(screen.queryByText(/refund pending/i)).not.toBeInTheDocument()
    expect(updated).not.toHaveBeenCalled()
    expect(mocks.api).toHaveBeenCalledTimes(2)
    expect(mocks.api).toHaveBeenLastCalledWith("/api/orders/old-order")
  })

  it("does not mislabel other conflicts as insufficient credits or retry authorization rejection", async () => {
    mocks.api.mockRejectedValue(new ApiError(403, "FORBIDDEN", "raw permission details"))
    render(<RepostControls order={expiredOrder} onUpdated={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Create repost" }))
    expect(await screen.findByText("Repost could not be authorized. Please sign in again.")).toBeInTheDocument()
    expect(screen.queryByText(/insufficient available credits/i)).not.toBeInTheDocument()
    expect(mocks.api).toHaveBeenCalledTimes(1)
  })

  it("refreshes the saved original version after failure so a user retry is not stale", async () => {
    const refreshed = { ...expiredOrder, version: 3, repostFailureMessage: "Repost failed: insufficient available credits." }
    const onUpdated = vi.fn()
    mocks.api.mockRejectedValueOnce(new ApiError(409, "INSUFFICIENT_CREDITS", "private details"))
      .mockResolvedValueOnce(refreshed)
    const view = render(<RepostControls order={expiredOrder} onUpdated={onUpdated} />)
    fireEvent.click(screen.getByRole("button", { name: "Create repost" }))
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(refreshed))
    view.rerender(<RepostControls order={refreshed} onUpdated={onUpdated} />)
    expect(screen.getByRole("alert")).toHaveTextContent(refreshed.repostFailureMessage)
    mocks.api.mockResolvedValueOnce({ ...expiredOrder, id: "new-order", status: "OPEN" })
    fireEvent.click(screen.getByRole("button", { name: "Create repost" }))
    await waitFor(() => expect(mocks.api).toHaveBeenLastCalledWith("/api/orders/old-order/repost", {
      method: "POST", body: expect.objectContaining({ expectedVersion: 3 }),
    }))
  })

  it("starts at a future quarter-hour even for an old errand and posts the selected expiry", async () => {
    const updated = { ...expiredOrder, id: "repost", status: "OPEN" }
    const onUpdated = vi.fn()
    mocks.api.mockResolvedValue(updated)
    render(<RepostControls order={expiredOrder} onUpdated={onUpdated} />)
    expect(screen.getByLabelText("New expiry date")).toHaveValue("2026-10-08")
    expect(screen.getByRole("combobox", { name: "New expiry minutes" })).toHaveTextContent("45")
    fireEvent.click(screen.getByRole("button", { name: "Create repost" }))
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/orders/old-order/repost", {
      method: "POST", body: expect.objectContaining({ actorId: "requester-1",
        expiresAt: new Date(2026, 9, 8, 10, 45).toISOString(), expectedVersion: 2 }),
    }))
    expect(onUpdated).toHaveBeenCalledWith(updated)
  })

  it("does not post when the date is cleared", () => {
    render(<RepostControls order={expiredOrder} onUpdated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("New expiry date"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Create repost" }))
    expect(mocks.api).not.toHaveBeenCalled()
    expect(screen.getByLabelText("New expiry date")).toHaveAttribute("aria-invalid", "true")
    expect(mocks.error).toHaveBeenCalledWith("Choose expiry minutes of 00, 15, 30, or 45.")
  })
})
