import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AdminOrders } from "./admin-orders"

const api = vi.hoisted(() => ({
  mode: "live", orders: vi.fn(), order: vi.fn(), recordName: vi.fn(),
  penaltyPolicies: vi.fn(), resolveOrder: vi.fn(), applyPenalty: vi.fn(),
}))
vi.mock("@/hooks/use-admin-api", () => ({ useAdminApi: () => api }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const order = { id: "selected-order-1", status: "ACCEPTED", requesterId: "owner", courierId: "worker",
  requesterName: "Alex", courierName: "Jamie", pickupSupplierId: "pickup", deliverySupplierId: "delivery",
  pickupSupplierName: "The Deck", deliverySupplierName: "Library", offeredCredits: 5,
  version: 2, isCompletionHold: true, isOverdue: null,
  createdAt: "2026-10-17T00:00:00Z", expiresAt: "2026-10-17T02:00:00Z" }
beforeEach(() => {
  vi.clearAllMocks()
  api.orders.mockResolvedValue({ items: [order], page: 1, size: 10, totalItems: 1, totalPages: 1 })
  api.penaltyPolicies.mockResolvedValue([{ policy: "OVERDUE_DELIVERY", penaltyAmount: 1 },
    { policy: "ITEM_MISHANDLING_OR_DAMAGE", penaltyAmount: 4 }, { policy: "WRONG_LOCATION_DELIVERY", penaltyAmount: 4 }])
  api.order.mockResolvedValue(order)
  api.resolveOrder.mockResolvedValue({ ...order, status: "CANCELLED" })
})
afterEach(cleanup)

describe("Admin Order row actions", () => {
  it("sorts cancellation penalty choices by ascending points and submits the unresponsive case", async () => {
    const policies = [{ policy: "DELIBERATE_ITEM_RETENTION_OR_THEFT", penaltyAmount: 10 },
      { policy: "WRONG_LOCATION_DELIVERY", penaltyAmount: 4 }, { policy: "COURIER_UNRESPONSIVE", penaltyAmount: 3 },
      { policy: "ITEM_MISHANDLING_OR_DAMAGE", penaltyAmount: 4 }]
    api.penaltyPolicies.mockResolvedValue(policies)
    render(<AdminOrders />)
    fireEvent.click(await screen.findByRole("radio", { name: "Select order selected-order-1" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }))
    const dialog = await screen.findByRole("dialog", { name: "Cancel this order?" })
    fireEvent.click(within(dialog).getByRole("radio", { name: "Apply penalty" }))
    const unresponsive = await within(dialog).findByRole("radio", { name: /Courier unresponsive/ })
    const choices = within(dialog).getAllByRole("radio").filter(input => input.getAttribute("name") === "cancellation-policy")
    expect(choices.map(input => input.closest("label")?.textContent)).toEqual([
      "Courier unresponsive3 points", "Wrong location delivery4 points", "Item mishandling or damage4 points", "Deliberate item retention or theft10 points"])
    expect(policies.map(item => item.penaltyAmount)).toEqual([10, 4, 3, 4])
    fireEvent.click(unresponsive)
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Admin reason" }))
    fireEvent.pointerDown(await screen.findByRole("option", { name: "Report investigation resolved" }), { pointerType: "mouse" })
    fireEvent.click(await screen.findByRole("option", { name: "Report investigation resolved" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }))
    await waitFor(() => expect(api.resolveOrder).toHaveBeenCalledWith(order.id, "cancel",
      expect.objectContaining({ appliedPenalties: ["COURIER_UNRESPONSIVE"] })))
  })
  it("opens Apply penalty and has no adjustment or admin completion",async()=>{
    render(<AdminOrders />)
    fireEvent.click(await screen.findByRole("radio",{name:"Select order selected-order-1"}))
    expect(screen.queryByRole("button",{name:"Adjust penalty"})).not.toBeInTheDocument()
    expect(screen.queryByRole("button",{name:"Mark as completed"})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button",{name:"Apply penalty"}))
    await screen.findByRole("dialog",{name:"Apply penalty"})
    expect(await screen.findByText(/Stored penalty/)).toBeInTheDocument()
  })
  it("rejects an inverted calendar range without querying and clears all date filters", async () => {
    render(<AdminOrders />)
    await screen.findByRole("radio", { name: "Select order selected-order-1" })
    fireEvent.change(screen.getByLabelText("Orders created on or after"), { target: { value: "2026-10-18" } })
    await waitFor(() => expect(api.orders).toHaveBeenLastCalledWith(expect.objectContaining({ fromDate: "2026-10-18" }), expect.any(AbortSignal)))
    const calls = api.orders.mock.calls.length
    fireEvent.change(screen.getByLabelText("Orders created on or before"), { target: { value: "2026-10-17" } })
    expect(await screen.findByRole("alert")).toHaveTextContent("end date")
    expect(api.orders).toHaveBeenCalledTimes(calls)
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    await screen.findByRole("radio", { name: "Select order selected-order-1" })
    expect(screen.getByLabelText("Orders created on or after")).toHaveValue("")
    expect(screen.getByLabelText("Orders created on or before")).toHaveValue("")
  })
  it("uses compact calendar controls and icon-only refresh without losing filters", async () => {
    render(<AdminOrders />)
    await screen.findByRole("radio", { name: "Select order selected-order-1" })
    expect(screen.queryByText("Created from")).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Orders created on or after"), { target: { value: "2026-10-16" } })
    fireEvent.change(screen.getByLabelText("Orders created on or before"), { target: { value: "2026-10-17" } })
    await waitFor(() => expect(api.orders).toHaveBeenLastCalledWith(expect.objectContaining({ fromDate: "2026-10-16", toDate: "2026-10-17", page: 1 }), expect.any(AbortSignal)))
    const calls = api.orders.mock.calls.length
    const refresh = screen.getByRole("button", { name: "Refresh orders" })
    expect(refresh).toHaveTextContent("")
    fireEvent.click(refresh)
    await waitFor(() => expect(api.orders.mock.calls.length).toBeGreaterThan(calls))
    expect(screen.getByLabelText("Orders created on or after")).toHaveValue("2026-10-16")
  })
  it("keeps OPEN cancellation available without courier penalties and disables terminal actions", async () => {
    api.orders.mockResolvedValueOnce({ items: [{ ...order, status: "OPEN", courierId: null }], page: 1, size: 10, totalItems: 1, totalPages: 1 })
    render(<AdminOrders />)
    const select = await screen.findByRole("radio", { name: "Select order selected-order-1" })
    fireEvent.keyDown(select.closest("tr")!, { key: "Enter" })
    expect(select).toBeChecked()
    expect(screen.getByRole("button", { name: "Apply penalty" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }))
    const dialog = await screen.findByRole("dialog", { name: "Cancel this order?" })
    expect(within(dialog).getByRole("radio", { name: "Apply penalty" })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole("radio", { name: "No penalty" }))
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Admin reason" }))
    fireEvent.pointerDown(await screen.findByRole("option", { name: "Requester requested cancellation" }), { pointerType: "mouse" })
    fireEvent.click(screen.getByRole("option", { name: "Requester requested cancellation" }))
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }))
    await waitFor(() => expect(api.resolveOrder).toHaveBeenCalledWith(order.id, "cancel", {
      requesterId: "owner", courierId: null, appliedPenalties: [], resolutionReason: "Requester requested cancellation",
    }))
  })

  it("retains an unsuccessful request for exact retry and prevents double submission", async () => {
    api.resolveOrder.mockRejectedValueOnce(new Error("This order is being updated. Please retry."))
    render(<AdminOrders />)
    fireEvent.click(await screen.findByRole("radio", { name: "Select order selected-order-1" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }))
    const dialog = await screen.findByRole("dialog", { name: "Cancel this order?" })
    fireEvent.click(within(dialog).getByRole("radio", { name: "No penalty" }))
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Admin reason" }))
    fireEvent.pointerDown(await screen.findByRole("option", { name: "Requester requested cancellation" }), { pointerType: "mouse" })
    fireEvent.click(screen.getByRole("option", { name: "Requester requested cancellation" }))
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Please retry")
    expect(within(dialog).getByRole("radio", { name: "No penalty" })).toBeChecked()
    let finish!: (value: unknown) => void
    api.resolveOrder.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }))
    expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Go back" })).toBeDisabled()
    expect(api.resolveOrder).toHaveBeenCalledTimes(2)
    expect(api.resolveOrder.mock.calls[0]).toEqual(api.resolveOrder.mock.calls[1])
    finish({ ...order, status: "COMPLETED" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("disables both operations on a terminal order", async () => {
    api.orders.mockResolvedValueOnce({ items: [{ ...order, status: "COMPLETED" }], page: 1, size: 10, totalItems: 1, totalPages: 1 })
    render(<AdminOrders />)
    fireEvent.click(await screen.findByRole("radio", { name: "Select order selected-order-1" }))
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeDisabled()
  })

  it("selects and shades a row while preserving its View and profile links", async () => {
    render(<AdminOrders />)
    const select = await screen.findByRole("radio", { name: "Select order selected-order-1" })
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeDisabled()
    fireEvent.click(screen.getByText("Accepted", { selector: '[data-slot="badge"]' }))
    expect(select).toBeChecked()
    expect(select.closest("tr")).toHaveAttribute("data-state", "selected")
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Apply penalty" })).toBeEnabled()
    expect(screen.getByRole("link", { name: "View order selected-order-1" })).toHaveAttribute("href", "/admin/orders/selected-order-1")
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }))
    fireEvent.click(screen.getByRole("link", { name: "Alex" }))
    expect(select).not.toBeChecked()
  })

  it("requires a reason and penalty choice, then sends the selected maximum policies", async () => {
    render(<AdminOrders />)
    fireEvent.click(await screen.findByRole("radio", { name: "Select order selected-order-1" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }))
    const dialog = await screen.findByRole("dialog", { name: "Cancel this order?" })
    expect(within(dialog).getByRole("button", { name: "Confirm cancellation" })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole("radio", { name: /Apply penalty/ }))
    fireEvent.click(await within(dialog).findByRole("radio", { name: /Item mishandling or damage/ }))
    fireEvent.click(within(dialog).getByRole("radio", { name: /Wrong location delivery/ }))
    expect(within(dialog).getByRole("radio", { name: /Item mishandling or damage/ })).not.toBeChecked()
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument()
    expect(dialog).toHaveTextContent("4 points")
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Admin reason" }))
    fireEvent.pointerDown(await screen.findByRole("option", { name: "Other reason" }), { pointerType: "mouse" })
    fireEvent.click(screen.getByRole("option", { name: "Other reason" }))
    fireEvent.change(await within(dialog).findByRole("textbox", { name: "Custom reason" }), { target: { value: "Investigation confirms partial fulfilment." } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }))
    await waitFor(() => expect(api.resolveOrder).toHaveBeenCalledWith("selected-order-1", "cancel", {
      requesterId: "owner", courierId: "worker", appliedPenalties: ["WRONG_LOCATION_DELIVERY"],
      resolutionReason: "Investigation confirms partial fulfilment.",
    }))
  })
  it("shows an existing penalty clearly and does not offer to waive it on cancellation",async()=>{
    api.orders.mockResolvedValue({items:[{...order,appliedPenalty:"ITEM_MISHANDLING_OR_DAMAGE",appliedPenaltyAmount:4,isOverdue:true}],page:1,size:20,totalItems:1,totalPages:1})
    render(<AdminOrders />)
    fireEvent.click(await screen.findByRole("radio",{name:"Select order selected-order-1"}))
    fireEvent.click(screen.getByRole("button",{name:"Cancel order"}))
    const dialog=await screen.findByRole("dialog",{name:"Cancel this order?"})
    expect(dialog).toHaveTextContent("Stored penalty: Item mishandling or damage · 4 points")
    expect(within(dialog).getByRole("radio",{name:"No penalty"})).toBeInTheDocument()
    expect(within(dialog).queryByRole("radio",{name:"No additional penalty"})).not.toBeInTheDocument()
  })

})
