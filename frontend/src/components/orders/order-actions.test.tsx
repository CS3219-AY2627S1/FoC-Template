import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OrderActions } from "@/components/orders/order-actions"
import type { Order } from "@/lib/orders"

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@/hooks/use-api", () => ({
  useApi: () => mocks.api,
}))
vi.mock("@/lib/order-command-storage", () => ({ readOrderIntent: async () => null }))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: { uid: "courier-1" } }),
}))

vi.mock("sonner", () => ({
  toast: {
    success: mocks.success,
    error: mocks.error,
  },
}))

const acceptedOrder: Order = {
  id: "order-1",
  requesterId: "requester-1",
  courierId: "courier-1",
  itemDescription: "Pick up a parcel",
  pickupSupplierId: "store-a",
  deliverySupplierId: "hall-b",
  offeredCredits: 12,
  status: "ACCEPTED",
  createdAt: "2026-10-01T09:00:00Z",
  expiresAt: "2026-10-01T10:00:00Z",
  deliveryTimeLimitMinutes: 30,
  version: 4,
  originalOrderId: null,
  repostedOrderId: null,
}

describe("requester completion holds", () => {
  beforeEach(() => vi.clearAllMocks())

  it("explains the ongoing report and prevents completion while held", async () => {
    const held = { ...acceptedOrder, requesterId: "courier-1", status: "DELIVERED", isCompletionHold: true } as unknown as Order
    render(<OrderActions order={held} mode="requester" onUpdated={vi.fn()} />)
    await act(async () => {})
    expect(screen.getByText("This order has an ongoing report. You can complete it after the report is resolved.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Confirm completion" })).toBeDisabled()
    expect(mocks.api).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "POST" }))
  })

  it("shows a backend hold rejection when the displayed flag was stale", async () => {
    const onUpdated = vi.fn()
    const message = "This order has an ongoing report. You can complete it after the report is resolved."
    mocks.api.mockImplementation(async (path: string) => {
      if (path.endsWith("complete")) throw new Error(message)
      return { enabled: false }
    })
    render(<OrderActions order={{ ...acceptedOrder, requesterId: "courier-1", status: "DELIVERED" }} mode="requester" onUpdated={onUpdated} />)
    fireEvent.click(screen.getByRole("button", { name: "Confirm completion" }))
    expect(screen.getByRole("heading", { name: "Check this order before completing it" })).toBeInTheDocument()
    expect(screen.getByText(/Completed orders cannot be disputed/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Report an issue" })).toHaveAttribute("href", "/reporting?tab=create&category=ORDER&orderId=order-1")
    expect(screen.queryByRole("button", { name: "Keep reviewing" })).not.toBeInTheDocument()
    expect(mocks.api).not.toHaveBeenCalledWith(expect.stringContaining("complete"), expect.anything())
    fireEvent.click(screen.getByRole("button", { name: "Complete order" }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(message))
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it("dismisses the completion dialog from the close button or backdrop without taking an action", async () => {
    render(<OrderActions order={{ ...acceptedOrder, requesterId: "courier-1", status: "DELIVERED" }} mode="requester" onUpdated={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Confirm completion" }))
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Check this order before completing it" })).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "Confirm completion" }))
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Check this order before completing it" })).not.toBeInTheDocument())

    expect(mocks.api).not.toHaveBeenCalledWith(expect.stringContaining("complete"), expect.anything())
  })
})

describe("OrderActions accepted cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows cancellation only to the courier for an accepted errand", async () => {
    const onUpdated = vi.fn()

    render(<OrderActions order={acceptedOrder} mode="courier" onUpdated={onUpdated} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Abort errand" })).not.toBeDisabled())

    expect(screen.getByRole("button", { name: "Start errand" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Abort errand" })).toBeInTheDocument()

    cleanup()
    render(<OrderActions order={{ ...acceptedOrder, status: "IN_PROGRESS" }} mode="courier" onUpdated={onUpdated} />)
    await act(async () => {})
    expect(screen.queryByRole("button", { name: "Abort errand" })).not.toBeInTheDocument()

    cleanup()
    render(<OrderActions order={acceptedOrder} mode="requester" onUpdated={onUpdated} />)
    await act(async () => {})
    expect(screen.queryByRole("button", { name: "Abort errand" })).not.toBeInTheDocument()
  })

  it("confirms cancellation, calls the existing versioned API, and reports a reopened errand", async () => {
    const reopenedOrder = { ...acceptedOrder, status: "OPEN", courierId: null } as unknown as Order
    const onUpdated = vi.fn()
    mocks.api.mockResolvedValue(reopenedOrder)

    render(<OrderActions order={acceptedOrder} mode="courier" onUpdated={onUpdated} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Abort errand" })).not.toBeDisabled())

    fireEvent.click(screen.getByRole("button", { name: "Abort errand" }))
    expect(screen.getByRole("heading", { name: "Abort this accepted errand?" })).toBeInTheDocument()
    expect(mocks.api).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "POST" }))

    fireEvent.click(screen.getByRole("button", { name: "Yes, abort errand" }))

    await waitFor(() => {
      expect(mocks.api).toHaveBeenCalledWith("/api/orders/order-1/cancel-accepted", {
        method: "POST",
        body: expect.objectContaining({
          actorId: "courier-1",
          expectedVersion: 4,
        }),
      })
    })
    expect(onUpdated).toHaveBeenCalledWith(reopenedOrder)
    expect(mocks.success).toHaveBeenCalledWith("Errand reopened for other couriers")
  })

  it("reports a final cancellation when the API returns an aborted errand", async () => {
    const abortedOrder = { ...acceptedOrder, status: "ABORTED", courierId: null } as unknown as Order
    mocks.api.mockResolvedValue(abortedOrder)

    render(<OrderActions order={acceptedOrder} mode="courier" onUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Abort errand" })).not.toBeDisabled())
    fireEvent.click(screen.getByRole("button", { name: "Abort errand" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, abort errand" }))

    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Expired errand aborted"))
  })

  it("shows the API error when an accepted cancellation cannot be completed", async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path.endsWith("capabilities")) return { enabled: false }
      throw new Error("This errand is no longer accepted.")
    })

    render(<OrderActions order={acceptedOrder} mode="courier" onUpdated={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Abort errand" })).not.toBeDisabled())
    fireEvent.click(screen.getByRole("button", { name: "Abort errand" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, abort errand" }))

    await waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith("This errand is no longer accepted.")
    })
  })
})
