import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { OrderCard } from "@/components/orders/order-card"
import type { Order } from "@/lib/orders"

const order: Order = {
  id: "order-1",
  requesterId: "requester-1",
  courierId: null,
  itemDescription: "Pick up a parcel",
  pickupSupplierId: "store-a",
  deliverySupplierId: "hall-b",
  offeredCredits: 12,
  status: "OPEN",
  createdAt: "2026-10-01T09:00:00Z",
  expiresAt: "2026-10-01T10:00:00Z",
  deliveryTimeLimitMinutes: 30,
  version: 0,
  originalOrderId: null,
  repostedOrderId: null,
}

describe("OrderCard", () => {
  it("renders supplier names and keeps the order ID out of the user-facing card", () => {
    render(
      <OrderCard
        order={order}
        supplierNames={{ "store-a": "Campus Store", "hall-b": "Residential Hall" }}
        actions={<button type="button">Accept errand</button>}
      />,
    )

    expect(screen.getByText("Pick up a parcel")).toBeInTheDocument()
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(screen.getByText(/Campus Store.*Residential Hall/)).toBeInTheDocument()
    expect(screen.queryByText("order-1")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Accept errand" })).toBeInTheDocument()
  })

  it("never exposes opaque supplier IDs while a location is unavailable", () => {
    render(<OrderCard order={order} />)

    expect(screen.getByText(/Location unavailable.*Location unavailable/)).toBeInTheDocument()
    expect(screen.queryByText(/store-a|hall-b/)).not.toBeInTheDocument()
  })
})
