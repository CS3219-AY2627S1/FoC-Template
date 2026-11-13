import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { OrderCommandDiscoveryProvider, useOrderCommandDiscovery } from "@/components/orders/order-command-discovery"
import { PendingErrandCards } from "@/components/orders/pending-errand-cards"
import { PendingOrderCommands } from "@/components/orders/pending-order-commands"
import { useOrderCommand } from "@/hooks/use-order-command"
import type { OrderCommandStatus } from "@/lib/order-commands"
import { OrderActions } from "@/components/orders/order-actions"
import { RepostControls } from "@/components/orders/repost-controls"
import type { Order } from "@/lib/orders"
import type { ReactNode } from "react"
import MyErrandsPage from "@/app/my-errands/page"

const m = vi.hoisted(() => ({ api: vi.fn(), account: "owner", polls: new Set<() => Promise<void>>(), read: vi.fn(), write: vi.fn(), remove: vi.fn() }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => m.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: { uid: m.account }, loading: false }) }))
vi.mock("@/components/require-auth", () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }))
vi.mock("@/hooks/use-supplier-names", () => ({ useSupplierNames: () => ({ names: { pickup: "Pickup", delivery: "Delivery" }, ready: true }) }))
vi.mock("@/lib/order-command-storage", () => ({ readOrderIntent: m.read, writeOrderIntent: m.write, removeOrderIntent: m.remove }))
vi.mock("@/hooks/use-visible-polling", async () => {
  const { useEffect } = await import("react")
  return { ORDER_POLL_INTERVAL_MS: 5000, useVisiblePolling: (callback: (signal: AbortSignal) => Promise<void>, enabled: boolean) => {
    useEffect(() => {
      if (!enabled) return
      const controller = new AbortController()
      const task = () => callback(controller.signal)
      m.polls.add(task); void task()
      return () => { controller.abort(); m.polls.delete(task) }
    }, [callback, enabled])
    return () => callback(new AbortController().signal)
  } }
})
const details = { itemDescription: "Existing errand", pickupSupplierId: "pickup", deliverySupplierId: "delivery", offeredCredits: 5,
  deliveryTimeLimitMinutes: 15, expiresAt: "2026-10-11T10:00:00Z", orderStatus: "OPEN" as const, version: 0 }
const accept: OrderCommandStatus = { commandId: "same-K", kind: "ACCEPT", orderId: "order", status: "PENDING", reason: "AUTHORIZATION_REQUIRED", displayDetails: details }
async function poll() { await act(async () => { for (const callback of [...m.polls]) await callback() }) }
beforeEach(() => { vi.clearAllMocks(); m.account = "owner"; m.polls.clear(); m.read.mockResolvedValue(null); m.remove.mockResolvedValue(undefined) })
function Action() {
  const action = useOrderCommand("accept:order", vi.fn(), vi.fn())
  return <><button disabled={!action.ready || action.pending} onClick={() => void action.run("ACCEPT", "/api/orders/order/accept", { commandId: "NEW" })}>Accept</button>
    <span>{action.pending ? "Pending action" : "Idle"}</span>
    {action.needsAuthorization && <button onClick={() => void action.continueRecovery()}>Authorize action</button>}</>
}
function State() { const discovery = useOrderCommandDiscovery(); return <span>{discovery?.items.length ?? 0} known</span> }
it("restores the real OPEN card from server discovery with empty IndexedDB and resumes the same key only", async () => {
  m.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true }
    : path.includes("/resume?") ? { ...accept, reason: "PROCESSING" } : { items: [accept], totalPages: 1 })
  render(<OrderCommandDiscoveryProvider onResolved={vi.fn()}><Action /><PendingErrandCards displayedOrders={[]} /><PendingOrderCommands onResolved={vi.fn()} /></OrderCommandDiscoveryProvider>)
  expect(await screen.findByText("Existing errand")).toBeInTheDocument()
  expect(screen.getByText("Open")).toBeInTheDocument()
  expect(screen.getByText("Pending action")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled()
  expect(screen.queryByText("Accepting errand")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Authorize action" }))
  await waitFor(() => expect(m.api).toHaveBeenCalledWith("/api/orders/commands/same-K/resume?userId=owner", { method: "POST" }))
  expect(m.write).not.toHaveBeenCalled()
  expect(m.api.mock.calls.some(([path]) => path.endsWith("/accept"))).toBe(false)
})
it("shows submitted CREATE/REPOST details separately without successor cards and does not duplicate a live errand", async () => {
  m.api.mockResolvedValue({ items: [accept, { ...accept, commandId: "C", kind: "CREATE", displayDetails: { ...details, itemDescription: "New request", orderStatus: null } },
    { ...accept, commandId: "R", kind: "REPOST", displayDetails: { ...details, itemDescription: "Edited repost", orderStatus: null } }], enabled: true, totalPages: 1 })
  render(<OrderCommandDiscoveryProvider onResolved={vi.fn()}><PendingErrandCards displayedOrders={[{ id: "order", status: "OPEN" }]} /><PendingOrderCommands onResolved={vi.fn()} /></OrderCommandDiscoveryProvider>)
  expect(await screen.findByText("New request")).toBeInTheDocument()
  expect(screen.getByText("Edited repost")).toBeInTheDocument()
  expect(screen.queryByText("Existing errand")).not.toBeInTheDocument()
  expect(screen.queryByText("Open")).not.toBeInTheDocument()
})
it("covers all pending pages and keeps a history snapshot separate from a live abort", async () => {
  m.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true }
    : path.includes("page=2") ? { items: [{ ...accept, kind: "ABORT", displayDetails: { ...details, orderStatus: "ACCEPTED" } }], totalPages: 2 }
      : { items: [], totalPages: 2 })
  render(<OrderCommandDiscoveryProvider onResolved={vi.fn()}><PendingErrandCards displayedOrders={[{ id: "order", status: "ABORTED", attemptId: "old-attempt" }]} /></OrderCommandDiscoveryProvider>)
  expect(await screen.findByText("Existing errand")).toBeInTheDocument()
  expect(screen.getByText("Accepted")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Abort pending…" })).toBeDisabled()
})
it("does not infer terminal success from list absence, 404 or failed refresh; confirms key before refreshing", async () => {
  const resolved = vi.fn(); let items = [accept]; let lookup: unknown = null
  m.api.mockImplementation(async (path: string) => {
    if (path.endsWith("capabilities")) return { enabled: true }
    if (path.includes("/same-K?")) { if (!lookup) throw new Error("404 or timeout"); return lookup }
    return { items, totalPages: 1 }
  })
  render(<OrderCommandDiscoveryProvider onResolved={resolved}><State /></OrderCommandDiscoveryProvider>)
  expect(await screen.findByText("1 known")).toBeInTheDocument()
  items = []; await poll()
  expect(screen.getByText("1 known")).toBeInTheDocument(); expect(resolved).not.toHaveBeenCalled()
  lookup = { ...accept, status: "COMPLETED", outcome: "SUCCESS", result: { id: "order", status: "ACCEPTED" } }
  await poll()
  expect(screen.getByText("0 known")).toBeInTheDocument(); expect(resolved).toHaveBeenCalledTimes(1)
  expect(m.api.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false)
})
it("hides old-account commands immediately and ignores delayed old-account responses", async () => {
  let finish: (value: unknown) => void = () => undefined
  m.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true }
    : path.includes("userId=owner") ? new Promise((resolve) => { finish = resolve }) : { items: [], totalPages: 1 })
  const view = render(<OrderCommandDiscoveryProvider onResolved={vi.fn()}><PendingErrandCards displayedOrders={[]} /><State /></OrderCommandDiscoveryProvider>)
  await waitFor(() => expect(m.api).toHaveBeenCalledWith(expect.stringContaining("userId=owner"), expect.anything()))
  m.account = "different"
  view.rerender(<OrderCommandDiscoveryProvider onResolved={vi.fn()}><PendingErrandCards displayedOrders={[]} /><State /></OrderCommandDiscoveryProvider>)
  await act(async () => finish({ items: [accept], totalPages: 1 }))
  expect(screen.queryByText("Existing errand")).not.toBeInTheDocument()
})

const order: Order = { id: "order", requesterId: "owner", courierId: "owner", ...details, status: "ACCEPTED", version: 0,
  createdAt: "2026-10-11T09:00:00Z", originalOrderId: null, repostedOrderId: null }
it("binds a discovered abort to the existing accepted card and disables competing progress", async () => {
  m.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true }
    : { items: [{ ...accept, kind: "ABORT", displayDetails: { ...details, orderStatus: "ACCEPTED" } }], totalPages: 1 })
  render(<OrderCommandDiscoveryProvider onResolved={vi.fn()}><OrderActions order={order} mode="courier" onUpdated={vi.fn()} /><PendingErrandCards displayedOrders={[order]} /></OrderCommandDiscoveryProvider>)
  expect(await screen.findByRole("button", { name: "Abort pending…" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Start errand" })).toBeDisabled()
  expect(screen.getAllByRole("button", { name: "Continue with authorization" })).toHaveLength(1)
  expect(screen.queryByText("Existing errand")).not.toBeInTheDocument()
})
it("keeps the original EXPIRED repost form disabled while a server-owned edited repost is pending", async () => {
  m.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true }
    : { items: [{ ...accept, kind: "REPOST", displayDetails: { ...details, orderStatus: null, itemDescription: "Frozen edit" } }], totalPages: 1 })
  render(<OrderCommandDiscoveryProvider onResolved={vi.fn()}><RepostControls order={{ ...order, status: "EXPIRED" }} onUpdated={vi.fn()} /><PendingOrderCommands onResolved={vi.fn()} /></OrderCommandDiscoveryProvider>)
  expect(await screen.findByText("Frozen edit")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Reposting…" })).toBeDisabled()
  expect(screen.getByLabelText("Description")).toBeDisabled()
  expect(m.write).not.toHaveBeenCalled()
})
it("keeps a pending acceptance visible on My Errands outside the selected status filter", async () => {
  m.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true }
    : path.startsWith("/api/orders/mine") ? { items: [], totalPages: 0 }
      : { items: [accept], totalPages: 1 })
  render(<MyErrandsPage />)
  expect(await screen.findByText("Existing errand")).toBeInTheDocument()
  fireEvent.change(screen.getByRole("combobox", { name: "Filter errands by status" }), { target: { value: "COMPLETED" } })
  await screen.findByText("No errands match this status.")
  expect(screen.getByText("Existing errand")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Continue with authorization" })).toBeInTheDocument()
})
it("retains known pending cards on discovery failure and clears only after confirmed rejection", async () => {
  let broken = false, missing = false
  const resolved = vi.fn()
  m.api.mockImplementation(async (path: string) => {
    if (broken) throw new Error("offline")
    if (path.endsWith("capabilities")) return { enabled: true }
    if (path.includes("/same-K?")) return { ...accept, status: "COMPLETED", outcome: "REJECTED", message: "Deadline passed." }
    return { items: missing ? [] : [accept], totalPages: 1 }
  })
  render(<OrderCommandDiscoveryProvider onResolved={resolved}><PendingErrandCards displayedOrders={[]} /></OrderCommandDiscoveryProvider>)
  await screen.findByText("Existing errand")
  broken = true; await poll()
  expect(screen.getByText("Existing errand")).toBeInTheDocument(); expect(resolved).not.toHaveBeenCalled()
  broken = false; missing = true; await poll()
  expect(screen.queryByText("Existing errand")).not.toBeInTheDocument(); expect(resolved).toHaveBeenCalledTimes(1)
})
it("never attaches browser intent or recovery controls to an immutable aborted attempt", async () => {
  m.api.mockResolvedValue({ enabled: true, items: [{ ...accept, kind: "ABORT" }], totalPages: 1 })
  render(<OrderCommandDiscoveryProvider onResolved={vi.fn()}><OrderActions order={{ ...order, status: "ABORTED", attemptId: "old" }} mode="courier" onUpdated={vi.fn()} /><State /></OrderCommandDiscoveryProvider>)
  await screen.findByText("1 known")
  expect(m.read).not.toHaveBeenCalled()
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
})
it("clears only the matching browser action before a terminal discovery refresh can unmount its card", async () => {
  const resolved = vi.fn(() => expect(m.remove).toHaveBeenCalledWith("owner", "accept:order", "same-K"))
  let items = [accept]
  m.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true }
    : path.includes("/same-K?") ? { ...accept, status: "COMPLETED", outcome: "REJECTED" } : { items, totalPages: 1 })
  render(<OrderCommandDiscoveryProvider onResolved={resolved}><State /></OrderCommandDiscoveryProvider>)
  await screen.findByText("1 known"); items = []; await poll()
  expect(m.remove).toHaveBeenCalledWith("owner", "accept:order", "same-K")
  expect(resolved).toHaveBeenCalledTimes(1)
})
