import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import { AdminOrders } from "./admin-orders"
import { AdminUsers } from "./admin-users"
import { AdminSuppliers } from "./admin-suppliers"
import { CopyId } from "./admin-ui"
import { AdminSelectedUser } from "./admin-selected-user"

const mocks = vi.hoisted(() => ({
  mode: "mock" as "mock" | "live",
  capabilities: { userDirectory: true, userActions: true, creditTransactions: true },
  orders: vi.fn(), users: vi.fn(), user: vi.fn(), suppliers: vi.fn(),
  order: vi.fn(), push: vi.fn(),
  recordName: vi.fn(),
  supplier: vi.fn(), userTransactions: vi.fn(), userBalance: vi.fn(),
  suspendUser: vi.fn(), unsuspendUser: vi.fn(), promoteUser: vi.fn(), deactivateUser: vi.fn(),
  createSupplier: vi.fn(), updateSupplier: vi.fn(), deactivateSupplier: vi.fn(), reactivateSupplier: vi.fn(), supplierTypes: vi.fn(),
}))
vi.mock("@/hooks/use-admin-api", () => ({ useAdminApi: () => mocks }))
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))

const user = {
  id: "profile-1", userId: "user-1", username: "Alex", email: "alex@u.nus.edu",
  roles: ["requester", "courier"], active: true, penalty: 1, isCourierSuspended: false,
  suspensionEndDate: null, phoneNumber: "80000000", address: "NUS",
  usableBalance: 100, reservedBalance: 5, totalBalance: 105,
}
const supplier = {
  id: "supplier-1", name: "The Deck", type: "Food", building: "Arts", floor: "1",
  active: true, openingTime: "09:00", closingTime: "18:00", latitude: 1, longitude: 103,
  locationDescription: "Lobby", imageUrl: null, openNow: false,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
}
const order = {
  id: "order-1", itemDescription: "Lunch delivery", status: "OPEN", offeredCredits: 5,
  requesterId: "user-1", requesterName: "Alex", courierId: null, courierName: null,
  pickupSupplierId: "supplier-1", pickupSupplierName: "The Deck",
  deliverySupplierId: "supplier-2", deliverySupplierName: "Library",
  createdAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-01T02:00:00Z",
}
const page = (items: unknown[], current = 1) => ({ items, page: current, size: 10, totalItems: 12, totalPages: 2 })

it("opens an exact order search from a Report link while retaining table actions", async () => {
  render(<AdminOrders initialSearchOrderId="order-1" />)
  await waitFor(() => expect(mocks.orders).toHaveBeenCalledWith(
    expect.objectContaining({ orderId: "order-1", page: 1, status: null }), expect.anything()))
  expect(screen.getByLabelText("Order ID")).toHaveValue("order-1")
  expect(await screen.findByRole("link", { name: "View order order-1" })).toBeInTheDocument()
})
beforeEach(() => {
  vi.clearAllMocks()
  // JSDOM lacks PointerEvent; Base UI forwards a click to its native checkbox.
  vi.stubGlobal("PointerEvent", MouseEvent)
  mocks.mode = "mock"
  mocks.capabilities = { userDirectory: true, userActions: true, creditTransactions: true }
  mocks.orders.mockImplementation((query) => Promise.resolve(page([order], query.page)))
  mocks.order.mockResolvedValue(order)
  mocks.users.mockResolvedValue(page([user]))
  mocks.user.mockResolvedValue(user)
  mocks.userBalance.mockImplementation((id) => Promise.resolve({ ...user, userId: id }))
  mocks.supplier.mockResolvedValue(supplier)
  mocks.userTransactions.mockResolvedValue(page([]))
  mocks.suppliers.mockResolvedValue(page([supplier]))
  mocks.supplierTypes.mockResolvedValue(["Food/Coffee", "Library", "Shopping"])
  mocks.promoteUser.mockResolvedValue({ ...user, roles: [...user.roles, "admin"] })
  mocks.suspendUser.mockResolvedValue({ ...user, penalty: 10, isCourierSuspended: true, suspensionEndDate: "2026-12-04T00:00:00Z" })
  mocks.unsuspendUser.mockResolvedValue({ ...user, penalty: 10 })
  mocks.deactivateUser.mockResolvedValue({ ...user, active: false })
  mocks.deactivateSupplier.mockResolvedValue({ ...supplier, active: false })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("Admin pages", () => {
  it("toggles action-eligible orders with pagination reset and compatible status filters", async () => {
    render(<AdminOrders />)
    const toggle = screen.getByRole("switch", { name: "Action-eligible orders" })
    expect(toggle.closest("form")).toBe(screen.getByLabelText("Order ID").closest("form"))
    expect(toggle).toHaveAttribute("aria-checked", "false")
    await screen.findByRole("link", { name: "View order order-1" })
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal)))
    fireEvent.click(toggle)
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, actionEligibleOnly: true }), expect.any(AbortSignal)))
    fireEvent.change(screen.getByRole("combobox", { name: "Order status" }), { target: { value: "ACCEPTED" } })
    expect(toggle).toHaveAttribute("aria-checked", "true")
    fireEvent.change(screen.getByRole("combobox", { name: "Order status" }), { target: { value: "COMPLETED" } })
    expect(toggle).toHaveAttribute("aria-checked", "false")
    fireEvent.click(toggle)
    expect(screen.getByRole("combobox", { name: "Order status" })).toHaveValue("all")
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(toggle).toHaveAttribute("aria-checked", "false")
  })
  it("places a full-width Admin resolution below repost information and hides retired waiver fields", async () => {
    mocks.order.mockResolvedValue({ ...order, originalOrderId: "original", adminResolutionReason: "Investigation complete", adminResolutionAt: "2026-10-29T01:00:00Z", adminPenaltyAmount: 0,
      overduePenaltyWaived: true, overdueWaivedAt: "2026-10-28T01:00:00Z", overdueWaivedBy: "old-admin", overdueWaiverReason: "Old waiver" })
    render(<AdminOrders initialOrderId="order-1" />)
    await screen.findByText("Investigation complete")
    const resolution = screen.getByRole("heading", { name: "Admin resolution" }).closest("[data-slot=card]")!
    const repost = screen.getByRole("heading", { name: "Repost information" }).closest("[data-slot=card]")!
    expect(resolution).toHaveClass("lg:col-span-2")
    expect(repost.compareDocumentPosition(resolution) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText("Old waiver")).not.toBeInTheDocument()
    expect(screen.queryByText("Overdue penalty waived")).not.toBeInTheDocument()
    expect(within(resolution as HTMLElement).queryByText("Not provided")).not.toBeInTheDocument()
  })

  it("offers ID and Name now that the real directory supports both", async () => {
    render(<AdminUsers />)
    const searchType = screen.getByRole("combobox", { name: "Users search type" })
    expect(searchType).toHaveTextContent("ID")
    fireEvent.click(searchType)
    expect(await screen.findByRole("option", { name: "ID" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Name" })).toBeInTheDocument()
  })
  it("keeps profile and history visible when balance fails and retries only the balance", async () => {
    mocks.userBalance.mockRejectedValueOnce(new Error("Credit unavailable"))
    render(<AdminSelectedUser userId="user-1" />)
    expect(await screen.findByText("Credit unavailable")).toBeInTheDocument()
    expect(screen.getByText("alex@u.nus.edu")).toBeInTheDocument()
    expect(await screen.findByText("No credit transactions")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("100")).toBeInTheDocument()
    expect(mocks.user).toHaveBeenCalledTimes(1)
  })
  it("paginates real selected-user history with independently loaded balance", async () => {
    mocks.mode = "live"
    mocks.capabilities = { userDirectory: false, userActions: false, creditTransactions: true }
    mocks.user.mockResolvedValue({ ...user, usableBalance: null, reservedBalance: null, totalBalance: null })
    mocks.userTransactions.mockImplementation((_id, current) => Promise.resolve({
      items: [{ transactionId: "transaction-" + current, type: "RECEIVED", amount: 5,
        direction: "CREDIT", occurredAt: "2026-10-15T00:00:00Z", orderId: "history-order-" + current }],
      page: current, size: 20, totalItems: 21, totalPages: 2,
    }))
    const view = render(<AdminSelectedUser userId="user-1" />)
    expect((await screen.findAllByText("history-order-1")).length).toBeGreaterThan(0)
    expect(await screen.findByText("100")).toBeInTheDocument()
    expect(mocks.userTransactions).toHaveBeenLastCalledWith("user-1", 1, expect.any(AbortSignal))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect((await screen.findAllByText("history-order-2")).length).toBeGreaterThan(0)
    expect(mocks.userTransactions).toHaveBeenLastCalledWith("user-1", 2, expect.any(AbortSignal))
    mocks.user.mockResolvedValue({ ...user, userId: "user-2", username: "Jamie" })
    view.rerender(<AdminSelectedUser userId="user-2" />)
    await waitFor(() => expect(mocks.userTransactions).toHaveBeenLastCalledWith("user-2", 1, expect.any(AbortSignal)))
    expect(screen.queryByText("history-order-2")).not.toBeInTheDocument()
    expect(mocks.users).not.toHaveBeenCalled()
  })

  it("keeps the profile visible and retries a failed Credit account lookup without pretending history is empty", async () => {
    mocks.mode = "live"
    mocks.capabilities = { userDirectory: false, userActions: false, creditTransactions: true }
    mocks.userTransactions.mockRejectedValueOnce(new Error("Credit account has not been provisioned."))
      .mockResolvedValue({ items: [], page: 1, size: 20, totalItems: 0, totalPages: 0 })
    render(<AdminSelectedUser userId="user-1" />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Credit account has not been provisioned.")
    expect(screen.getByText("alex@u.nus.edu")).toBeInTheDocument()
    expect(screen.queryByText("No credit transactions")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("No credit transactions")).toBeInTheDocument()
    expect(mocks.userTransactions).toHaveBeenCalledTimes(2)
  })

  it("shows live orders and navigation immediately even while names are pending or unavailable", async () => {
    mocks.mode = "live"
    mocks.orders.mockResolvedValue(page([{ ...order, requesterName: null, pickupSupplierName: null, deliverySupplierName: null }]))
    mocks.recordName.mockImplementation(() => new Promise(() => {}))
    render(<AdminOrders />)
    expect(await screen.findByRole("link", { name: "View order order-1" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Loading user…" })).toHaveAttribute("href", "/admin/users/user-1")
    expect(screen.getAllByRole("link", { name: "Loading supplier…" })[0]).toHaveAttribute("href", "/admin/suppliers/supplier-1")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("searches by exact UID then opens the real profile", async () => {
    mocks.mode = "live"
    mocks.capabilities = { userDirectory: false, userActions: true, creditTransactions: true }
    render(<AdminUsers />)
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: " user-1 " } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    await waitFor(() => expect(mocks.users).toHaveBeenCalledWith({ page: 1, searchBy: "id", q: "user-1" }, expect.any(AbortSignal)))
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    expect(await screen.findByText("Profile summary")).toBeInTheDocument()
    expect(mocks.user).toHaveBeenCalledWith("user-1", expect.any(AbortSignal))
  })

  it("keeps live user summary visible with missing-value placeholders and no Credit or mutation calls", async () => {
    mocks.mode = "live"
    mocks.capabilities = { userDirectory: false, userActions: false, creditTransactions: false }
    mocks.user.mockResolvedValue({ ...user, id: null, active: null, phoneNumber: null, address: null,
      usableBalance: null, reservedBalance: null, totalBalance: null })
    render(<AdminSelectedUser userId="user-1" />)
    expect(await screen.findByText("alex@u.nus.edu")).toBeInTheDocument()
    expect(screen.getByText("Credit transactions")).toBeInTheDocument()
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(2)
    expect(screen.queryByRole("button", { name: "Suspend User" })).not.toBeInTheDocument()
    for (const name of ["Promote to Admin", "Deactivate User"]) {
      const button = screen.getByRole("button", { name })
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(mocks.userTransactions).not.toHaveBeenCalled()
    expect(mocks.suspendUser).not.toHaveBeenCalled()
    expect(mocks.promoteUser).not.toHaveBeenCalled()
    expect(mocks.deactivateUser).not.toHaveBeenCalled()
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Copy user-1 ID" })).toBeInTheDocument()
    expect(screen.queryByText(/Demo data/)).not.toBeInTheDocument()
  })

  it("paginates and searches orders on the server and exposes every status", async () => {
    render(<AdminOrders />)
    await screen.findByRole("link", { name: "View order order-1" })
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith(
      { page: 2, status: null, orderId: "" }, expect.any(AbortSignal),
    ))
    fireEvent.change(screen.getByLabelText("Order ID"), { target: { value: "order-1" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith(
      { page: 1, status: null, orderId: "order-1" }, expect.any(AbortSignal),
    ))
    expect(screen.getByRole("combobox", { name: "Order status" }).tagName).toBe("SELECT")
    expect(await screen.findByRole("option", { name: "Aborted" })).toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox", { name: "Order status" }), { target: { value: "COMPLETED" } })
    await waitFor(() => expect(mocks.orders).toHaveBeenLastCalledWith(
      { page: 1, status: "COMPLETED", orderId: "order-1" }, expect.any(AbortSignal),
    ))
  })

  it("copies the underlying supplier ID only from the copy icon", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<CopyId id="supplier-1" name="The Deck" />)
    fireEvent.click(screen.getByText("The Deck"))
    expect(writeText).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Copy The Deck ID" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("supplier-1"))
  })

  it("loads a full user profile with promotion, courier suspension and deactivation actions", async () => {
    render(<AdminUsers />)
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    expect(await screen.findByText("80000000")).toBeInTheDocument()
    const actions = screen.getByText("Admin actions").closest("[data-slot=card]") as HTMLElement
    expect(within(actions).getAllByRole("button").map((button) => button.textContent))
      .toEqual(["Promote to Admin", "Suspend Courier", "Deactivate User"])
    expect(screen.queryByLabelText("Suspension end (your local time)")).not.toBeInTheDocument()
    expect(mocks.suspendUser).not.toHaveBeenCalled()
  })

  it("confirms suspension, explains the effects and updates the selected profile", async () => {
    render(<AdminUsers />)
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    fireEvent.click(await screen.findByRole("button", { name: "Suspend Courier" }))
    expect(screen.getByText(/one month.*penalty score to 10/i)).toBeInTheDocument()
    expect(mocks.suspendUser).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(mocks.suspendUser).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Suspend Courier" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm suspension" }))
    expect(await screen.findByRole("button", { name: "Unsuspend Courier" })).toBeEnabled()
    expect(mocks.suspendUser).toHaveBeenCalledExactlyOnceWith("user-1")
    expect(screen.getByText("10")).toBeInTheDocument()
    expect(screen.getByText("Suspended")).toBeInTheDocument()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("confirms unsuspension without implying the penalty score is reset", async () => {
    mocks.user.mockResolvedValue({ ...user, penalty: 10, isCourierSuspended: true, suspensionEndDate: "2026-12-04T00:00:00Z" })
    render(<AdminUsers />)
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    fireEvent.click(await screen.findByRole("button", { name: "Unsuspend Courier" }))
    expect(screen.getByText(/penalty score will not be reset/i)).toBeInTheDocument()
    expect(mocks.unsuspendUser).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirm unsuspension" }))
    expect(await screen.findByRole("button", { name: "Suspend Courier" })).toBeEnabled()
    expect(mocks.unsuspendUser).toHaveBeenCalledExactlyOnceWith("user-1")
    expect(screen.getByText("10")).toBeInTheDocument()
    expect(screen.queryByText("Suspended")).not.toBeInTheDocument()
  })

  it.each([false, true])("retains profile and allows retry after a failed suspension action (suspended=%s)", async (suspended) => {
    mocks.user.mockResolvedValue({ ...user, isCourierSuspended: suspended })
    const mutation = suspended ? mocks.unsuspendUser : mocks.suspendUser
    mutation.mockRejectedValue(new Error("Account is not active."))
    render(<AdminUsers />)
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    fireEvent.click(await screen.findByRole("button", { name: suspended ? "Unsuspend Courier" : "Suspend Courier" }))
    const label = suspended ? "Confirm unsuspension" : "Confirm suspension"
    fireEvent.click(screen.getByRole("button", { name: label }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Account is not active.")
    expect(screen.getByRole("button", { name: label })).toBeEnabled()
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.getByText("80000000")).toBeInTheDocument()
  })

  it.each([false, true])("disables suspension actions for inactive accounts (suspended=%s)", async (suspended) => {
    mocks.user.mockResolvedValue({ ...user, active: false, isCourierSuspended: suspended })
    render(<AdminUsers />)
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    expect(await screen.findByRole("button", { name: suspended ? "Unsuspend Courier" : "Suspend Courier" })).toBeDisabled()
    expect(mocks.suspendUser).not.toHaveBeenCalled()
    expect(mocks.unsuspendUser).not.toHaveBeenCalled()
  })

  it("prevents repeat suspension submissions and dismissal while saving", async () => {
    let resolve!: (value: typeof user) => void
    mocks.suspendUser.mockImplementation(() => new Promise<typeof user>((done) => { resolve = done }))
    render(<AdminUsers />)
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    fireEvent.click(await screen.findByRole("button", { name: "Suspend Courier" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm suspension" }))
    expect(screen.getByRole("button", { name: "Suspending…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Suspending…" }))
    expect(mocks.suspendUser).toHaveBeenCalledTimes(1)
    await act(async () => { resolve({ ...user, penalty: 10, isCourierSuspended: true }) })
    expect(await screen.findByRole("button", { name: "Unsuspend Courier" })).toBeEnabled()
  })

  it("requires confirmation before deactivating a user", async () => {
    render(<AdminUsers />)
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate User" }))
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument()
    expect(mocks.deactivateUser).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }))
    await waitFor(() => expect(mocks.deactivateUser).toHaveBeenCalledWith("user-1"))
  })

  it("promotes a user and prevents duplicate promotion controls", async () => {
    render(<AdminUsers />)
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    fireEvent.click(await screen.findByRole("button", { name: "Promote to Admin" }))
    expect(await screen.findByRole("button", { name: "Already an admin" })).toBeDisabled()
    expect(mocks.promoteUser).toHaveBeenCalledWith("user-1")
  })

  it("requires confirmation before deactivating a supplier", async () => {
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate The Deck" }))
    expect(mocks.deactivateSupplier).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole("button", { name: "Confirm deactivation" }))
    await waitFor(() => expect(mocks.deactivateSupplier).toHaveBeenCalledWith("supplier-1"))
  })

  it("creates a supplier through the existing form and mock adapter", async () => {
    mocks.createSupplier.mockResolvedValue({ ...supplier, id: "new-supplier" })
    render(<AdminSuppliers />)
    fireEvent.click(screen.getByRole("button", { name: "Create supplier" }))
    const dialog = within(await screen.findByRole("dialog"))
    for (const [label, value] of [["Name", "Printing"], ["Type", "Printing"], ["Building", "COM3"],
      ["Latitude", "1.294"], ["Longitude", "103.773"]]) {
      fireEvent.change(dialog.getByLabelText(label), { target: { value } })
    }
    fireEvent.click(dialog.getByRole("button", { name: "Create supplier" }))
    await waitFor(() => expect(mocks.createSupplier).toHaveBeenCalledWith(expect.objectContaining({
      name: "Printing", type: "Printing", building: "COM3", latitude: 1.294, longitude: 103.773,
      openingTime: "09:00", closingTime: "18:00",
    })))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("edits a supplier by sending only the changed fields", async () => {
    mocks.updateSupplier.mockResolvedValue({ ...supplier, closingTime: "21:30" })
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }))
    const dialog = within(await screen.findByRole("dialog"))
    expect(dialog.getByLabelText("Name")).toHaveValue("The Deck")
    fireEvent.change(dialog.getByLabelText("Closes"), { target: { value: "21:30" } })
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(mocks.updateSupplier).toHaveBeenCalledWith("supplier-1", { closingTime: "21:30" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByText("21:30")).toBeInTheDocument()
  })

  it("closes the editor without a request when nothing changed", async () => {
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }))
    const dialog = within(await screen.findByRole("dialog"))
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(mocks.updateSupplier).not.toHaveBeenCalled()
  })

  it("keeps the editor open and shows the service error when an edit fails", async () => {
    mocks.updateSupplier.mockRejectedValue(new ApiError(409, "CONFLICT", "Duplicate"))
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Edit details" }))
    const dialog = within(await screen.findByRole("dialog"))
    fireEvent.change(dialog.getByLabelText("Building"), { target: { value: "COM3" } })
    fireEvent.click(dialog.getByRole("button", { name: "Save changes" }))
    expect(await dialog.findByText("A supplier with this name already exists in that building.")).toBeInTheDocument()
    expect(dialog.getByRole("button", { name: "Save changes" })).toBeEnabled()
  })

  it("reactivates an inactive supplier", async () => {
    mocks.supplier.mockResolvedValue({ ...supplier, active: false })
    mocks.reactivateSupplier.mockResolvedValue(supplier)
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Reactivate The Deck" }))
    await waitFor(() => expect(mocks.reactivateSupplier).toHaveBeenCalledWith("supplier-1"))
    expect(await screen.findByRole("button", { name: "Deactivate The Deck" })).toBeEnabled()
  })

  it("reports a failed reactivation", async () => {
    mocks.supplier.mockResolvedValue({ ...supplier, active: false })
    mocks.reactivateSupplier.mockRejectedValue(new Error("Update failed"))
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Reactivate The Deck" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Update failed")
    expect(screen.getByRole("button", { name: "Reactivate The Deck" })).toBeEnabled()
  })

  it("keeps a supplier active when its confirmation is cancelled", async () => {
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate The Deck" }))
    fireEvent.click(await screen.findByRole("button", { name: "Keep active" }))
    expect(mocks.deactivateSupplier).not.toHaveBeenCalled()
  })

  it("retains the confirmation and reports a failed supplier mutation", async () => {
    mocks.deactivateSupplier.mockRejectedValue(new Error("Update failed"))
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate The Deck" }))
    fireEvent.click(await screen.findByRole("button", { name: "Confirm deactivation" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Update failed")
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Confirm deactivation" })).toBeEnabled()
  })

  it.each([
    ["Users", AdminUsers, mocks.users],
    ["Suppliers", AdminSuppliers, mocks.suppliers],
  ] as const)("searches %s by ID using the dropdown", async (label, Component, request) => {
    render(<Component />)
    await waitFor(() => expect(request).toHaveBeenCalled())
    fireEvent.click(screen.getByRole("combobox", { name: label + " search type" }))
    fireEvent.pointerDown(await screen.findByRole("option", { name: "ID" }), { pointerType: "mouse" })
    fireEvent.click(screen.getByRole("option", { name: "ID" }))
    fireEvent.change(screen.getByLabelText("Search " + label.toLowerCase()), { target: { value: "exact-id" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    await waitFor(() => expect(request).toHaveBeenLastCalledWith(
      { page: 1, searchBy: "id", q: "exact-id" }, expect.any(AbortSignal),
    ))
  })

  it("shows a failed list request with an actionable retry", async () => {
    mocks.orders.mockRejectedValueOnce(new Error("Service unavailable")).mockResolvedValue(page([order]))
    render(<AdminOrders />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("link", { name: "View order order-1" })).toBeInTheDocument()
  })

  it("links each related record to its Admin detail route and keeps descriptions in View only", async () => {
    render(<AdminOrders />)
    expect(await screen.findByRole("link", { name: "Alex" })).toHaveAttribute("href", "/admin/users/user-1")
    expect(screen.getByRole("link", { name: "Alex" })).toHaveClass("hover:underline", "focus-visible:underline")
    expect(screen.getByRole("link", { name: "Alex" })).not.toHaveClass("underline")
    expect(screen.getByRole("link", { name: "The Deck" })).toHaveAttribute("href", "/admin/suppliers/supplier-1")
    expect(screen.queryByText("Lunch delivery")).not.toBeInTheDocument()
    for (const name of ["Requester", "Courier", "Pickup", "Delivery", "Created", "Expires"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument()
    }
    expect(screen.getByRole("link", { name: "View order order-1" })).toHaveAttribute("href", "/admin/orders/order-1")
  })

  it("keeps supplier card titles plain and navigates through View details", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<AdminSuppliers />)
    const name = await screen.findByText("The Deck")
    expect(name.closest("a")).toBeNull()
    expect(name.closest("button")).toBeNull()
    fireEvent.click(name)
    expect(writeText).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Copy The Deck ID" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("supplier-1"))
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute("href", "/admin/suppliers/supplier-1")
  })

  it("renders the profile in the Users tab with its own transaction history and copyable ID", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<AdminUsers />)
    fireEvent.click(await screen.findByRole("button", { name: "View profile of Alex" }))
    await screen.findByText("80000000")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByText("Profile summary")).toBeInTheDocument()
    expect(await screen.findByText("Credit transactions")).toBeInTheDocument()
    expect(mocks.userTransactions).toHaveBeenCalledWith("user-1", 1, expect.any(AbortSignal))
    fireEvent.click(screen.getByRole("button", { name: "Copy user-1 ID" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("user-1"))
    fireEvent.click(screen.getByRole("button", { name: "Back to users" }))
    expect(await screen.findByRole("button", { name: "View profile of Alex" })).toBeInTheDocument()
  })

  it("uses the normal Supplier status badge", async () => {
    render(<AdminSuppliers />)
    expect(await screen.findByText("Closed")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute("href", "/admin/suppliers/supplier-1")
  })

  it("opens a deep-linked user without requiring the list and preserves the profile if history fails", async () => {
    mocks.userTransactions.mockRejectedValue(new Error("History unavailable"))
    render(<AdminSelectedUser userId="user-1" />)
    expect(await screen.findByText("80000000")).toBeInTheDocument()
    expect(await screen.findByRole("alert")).toHaveTextContent("History unavailable")
    expect(screen.getByRole("button", { name: "Promote to Admin" })).toBeEnabled()
    expect(mocks.user).toHaveBeenCalledWith("user-1", expect.any(AbortSignal))
    expect(mocks.users).not.toHaveBeenCalled()
  })

  it("opens a deep-linked supplier that is absent from the current list", async () => {
    mocks.suppliers.mockResolvedValue(page([]))
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    expect(await screen.findByText("Lobby")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Back to suppliers" })).toBeInTheDocument()
    expect(mocks.supplier).toHaveBeenCalledWith("supplier-1", expect.any(AbortSignal))
  })

  it("paginates the selected user's history without switching identity", async () => {
    mocks.userTransactions.mockImplementation((_id, current) => Promise.resolve(page([
      { transactionId: "t-1", type: "RECEIVED", amount: 10, direction: "CREDIT", occurredAt: "2026-10-11T08:00:00Z", orderId: "order-1" },
    ], current)))
    render(<AdminSelectedUser userId="user-1" />)
    await screen.findByText("Credit transactions")
    await screen.findAllByText("+10 credits")
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(mocks.userTransactions).toHaveBeenLastCalledWith("user-1", 2, expect.any(AbortSignal)))
  })

  it("discards a late profile response after selecting another user", async () => {
    let resolveFirst!: (value: typeof user) => void
    mocks.user.mockImplementation((id) => id === "first" ? new Promise((resolve) => { resolveFirst = resolve }) : Promise.resolve({ ...user, userId: "second", username: "Jamie" }))
    const view = render(<AdminSelectedUser userId="first" />)
    view.rerender(<AdminSelectedUser userId="second" />)
    expect(await screen.findByRole("heading", { name: "Jamie" })).toBeInTheDocument()
    resolveFirst({ ...user, userId: "first" })
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Alex" })).not.toBeInTheDocument())
  })

  it("places user admin actions before profile and credit history", async () => {
    render(<AdminSelectedUser userId="user-1" />)
    const actions = await screen.findByText("Admin actions")
    const summary = screen.getByText("Profile summary")
    const history = await screen.findByText("Credit transactions")
    expect(actions.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(actions.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("loads a full Order page independently of the list and retains description", async () => {
    render(<AdminOrders initialOrderId="order-1" />)
    expect(await screen.findByText("Lunch delivery")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(mocks.order).toHaveBeenCalledWith("order-1", expect.any(AbortSignal))
    expect(mocks.orders).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Back to orders" }))
    expect(mocks.push).toHaveBeenCalledWith("/admin/orders")
  })

  it("retains a failed Order detail's retry and back controls", async () => {
    mocks.order.mockRejectedValueOnce(new Error("Order not found.")).mockResolvedValue(order)
    render(<AdminOrders initialOrderId="order-1" />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Order not found.")
    expect(screen.getByRole("button", { name: "Back to orders" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Lunch delivery")).toBeInTheDocument()
  })

  it.each(["create", "edit"])("loads actual Supplier catalogue type suggestions for %s", async (mode) => {
    render(<AdminSuppliers initialSupplierId={mode === "edit" ? "supplier-1" : undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: mode === "edit" ? "Edit details" : "Create supplier" }))
    await waitFor(() => expect(mocks.supplierTypes).toHaveBeenCalledWith(expect.any(AbortSignal)))
    await waitFor(() => expect(Array.from(document.querySelectorAll("#supplier-types option")).map(option => option.getAttribute("value")))
      .toEqual(["Food/Coffee", "Library", "Shopping"]))
    const type = screen.getByLabelText("Type")
    fireEvent.change(type, { target: { value: "Campus residence" } })
    expect(type).toHaveValue("Campus residence")
  })

  it("keeps supplier creation editable when type suggestions are unavailable", async () => {
    mocks.supplierTypes.mockRejectedValue(new Error("Types unavailable"))
    render(<AdminSuppliers />)
    fireEvent.click(screen.getByRole("button", { name: "Create supplier" }))
    await waitFor(() => expect(mocks.supplierTypes).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "Food" } })
    expect(screen.getByLabelText("Type")).toHaveValue("Food")
    expect(screen.getByLabelText("Image link")).not.toBeRequired()
  })

  it("places supplier actions above details and confirms deactivation", async () => {
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    const actions = await screen.findByText("Admin actions")
    expect(actions.compareDocumentPosition(screen.getByText("Location details")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Deactivate The Deck" }))
    expect(mocks.deactivateSupplier).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole("button", { name: "Confirm deactivation" }))
    await waitFor(() => expect(mocks.deactivateSupplier).toHaveBeenCalledWith("supplier-1"))
    expect(await screen.findByRole("button", { name: "Reactivate The Deck" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Deactivate The Deck" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Back to suppliers" }))
    expect(mocks.push).toHaveBeenCalledWith("/admin/suppliers")
  })

  it("retains the Supplier profile and confirmation after a failed deactivation", async () => {
    mocks.deactivateSupplier.mockRejectedValue(new Error("Update failed"))
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate The Deck" }))
    fireEvent.click(await screen.findByRole("button", { name: "Confirm deactivation" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Update failed")
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.getByText("Location details")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Confirm deactivation" })).toBeEnabled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("keeps supplier card browsing but requires opening details before deactivation", async () => {
    render(<AdminSuppliers />)
    expect(await screen.findByRole("link", { name: "View details" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Deactivate The Deck" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Supplier locations" })).not.toBeInTheDocument()
  })

  it("separates user identity and account values into individual columns", async () => {
    render(<AdminUsers />)
    await screen.findByRole("button", { name: "View profile of Alex" })
    for (const name of ["Name", "Email", "User ID", "Account status", "Courier status", "Available credits", "Reserved credits", "Total credits"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument()
    }
    const nameCell = screen.getByRole("button", { name: "Alex" }).closest("td")
    expect(nameCell).not.toHaveTextContent(user.email)
    expect(nameCell).not.toHaveTextContent(user.userId)
  })

  it("groups Order details without losing repost facts and navigates related names separately from copying IDs", async () => {
    mocks.order.mockResolvedValue({ ...order, courierId: "user-2", courierName: "Jamie", originalOrderId: "original-1", automaticRepostEnabled: true, repostCreditAmount: 8, auditNote: "Extra returned information" })
    render(<AdminOrders initialOrderId="order-1" />)
    await screen.findByText("Lunch delivery")
    for (const title of ["Order information", "People", "Locations", "Status and timing", "Repost information", "Other information"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument()
    }
    expect(screen.getByRole("link", { name: "The Deck" })).toHaveAttribute("href", "/admin/suppliers/supplier-1")
    expect(screen.getByRole("link", { name: "Alex" })).toHaveAttribute("href", "/admin/users/user-1")
    expect(screen.getByRole("link", { name: "Jamie" })).toHaveAttribute("href", "/admin/users/user-2")
    expect(screen.getByRole("button", { name: "Copy supplier-1 ID" })).toBeInTheDocument()
    expect(screen.getByText("Extra returned information")).toBeInTheDocument()
    expect(screen.getByText(/Original order id/i)).toBeInTheDocument()
  })

  it("swaps version and description inside the original card grid and orders requester above courier", async () => {
    mocks.order.mockResolvedValue({ courierName: "Jamie", courierId: "user-2",
      ...Object.fromEntries(Object.entries(order).filter(([key]) => !key.startsWith("courier"))),
      attemptId: "attempt-1", version: 3,
    })
    render(<AdminOrders initialOrderId="order-1" />)
    const requester = await screen.findByRole("link", { name: "Alex" })
    const courier = screen.getByRole("link", { name: "Jamie" })
    expect(requester.compareDocumentPosition(courier) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const description = screen.getByText("Lunch delivery").closest("div")!
    const info = screen.getByRole("heading", { name: "Order information" }).closest("[data-slot=card]")!
    const terms = within(info as HTMLElement).getAllByRole("term").map((term) => term.textContent)
    expect(terms).toEqual(["Id", "Attempt Id", "Version", "Offered Credits", "Item Description"])
    expect(description).not.toHaveClass("sm:col-span-2")
    expect(info).not.toHaveClass("lg:col-span-2")
    expect(within(info as HTMLElement).getAllByRole("term")[0].closest("dl")).toHaveClass("sm:grid-cols-2")
  })

  it("shows supplier status beside location details, outside admin actions, and retains the detail map", async () => {
    render(<AdminSuppliers initialSupplierId="supplier-1" />)
    await screen.findByText("Location details")
    const actions = screen.getByText("Admin actions").closest("[data-slot=card]")!
    const details = screen.getByText("Location details").closest("[data-slot=card]")!
    expect(within(actions as HTMLElement).queryByText("Closed")).not.toBeInTheDocument()
    expect(within(details as HTMLElement).getByText("Closed")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Supplier location" })).toBeInTheDocument()
  })
})
