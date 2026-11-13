import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { RepostControls } from "@/components/orders/repost-controls"
import type { OrderCommandIntent, OrderCommandStatus } from "@/lib/order-commands"
import type { Order } from "@/lib/orders"
import { updateRequesterOrderList } from "@/lib/orders"

const m = vi.hoisted(() => ({ api: vi.fn(), saved: null as OrderCommandIntent | null,
  poll: null as null | (() => Promise<void>), result: null as OrderCommandStatus | null, lost: false }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => m.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: { uid: "owner" }, loading: false }) }))
vi.mock("@/lib/order-command-storage", () => ({
  readOrderIntent: async () => m.saved,
  writeOrderIntent: async (_account: string, _scope: string, input: OrderCommandIntent) => { m.saved ??= input; return m.saved },
  removeOrderIntent: async () => { m.saved = null },
}))
vi.mock("@/hooks/use-visible-polling", () => ({ ORDER_POLL_INTERVAL_MS: 5000,
  useVisiblePolling: (callback: () => Promise<void>, enabled: boolean) => { m.poll = enabled ? callback : null } }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const original: Order = { id: "old", requesterId: "owner", courierId: null, itemDescription: "task", status: "EXPIRED",
  pickupSupplierId: "p", deliverySupplierId: "d", offeredCredits: 5, deliveryTimeLimitMinutes: 15, version: 2,
  createdAt: "2026-10-10T00:00:00Z", expiresAt: "2026-10-10T01:00:00Z", originalOrderId: null, repostedOrderId: null }
beforeEach(() => {
  vi.clearAllMocks(); m.saved = null; m.poll = null; m.lost = false
  m.result = { commandId: "R", kind: "REPOST", orderId: "old", status: "PENDING", reason: "RETRY_SCHEDULED", message: "Outcome not confirmed. We will safely retry this request." }
  m.api.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path.endsWith("capabilities")) return { enabled: true }
    if (path === "/api/orders/old") return { ...original, version: 3, repostFailureMessage: m.result?.message }
    if (options?.method === "POST" && m.lost) throw new Error("lost reply")
    return m.result
  })
})
afterEach(cleanup)
it("keeps frozen manual input through timeout/reload and replaces the old card only on success", async () => {
  const updated = vi.fn()
  const first = render(<RepostControls order={original} onUpdated={updated} />)
  await waitFor(() => expect(screen.getByRole("button", { name: "Create repost" })).toBeEnabled())
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "edited task" } })
  m.lost = true
  fireEvent.click(screen.getByRole("button", { name: "Create repost" }))
  await waitFor(() => expect(m.saved?.kind).toBe("REPOST"))
  const key = m.saved!.key
  expect(m.saved!.path).toBe("/api/orders/commands/old/repost")
  expect(updated).not.toHaveBeenCalled()
  first.unmount()
  render(<RepostControls order={original} onUpdated={updated} />)
  await waitFor(() => expect(screen.getByRole("button", { name: "Reposting…" })).toBeDisabled())
  expect(screen.getByLabelText("Description")).toHaveValue("edited task")
  expect(screen.getByLabelText("Description")).toBeDisabled()
  const successor: Order = { ...original, id: "new", originalOrderId: "old", status: "OPEN", itemDescription: "edited task" }
  m.result = { commandId: key, kind: "REPOST", status: "COMPLETED", outcome: "SUCCESS", result: successor }
  await act(async () => { await m.poll?.() })
  expect(m.saved).toBeNull()
  expect(updated).toHaveBeenCalledWith(successor)
  expect(updateRequesterOrderList([original], successor)).toEqual([successor])
})
it("only terminal insufficient credits releases pending and refreshes the saved expired message/version", async () => {
  const updated = vi.fn()
  render(<RepostControls order={original} onUpdated={updated} />)
  await waitFor(() => expect(screen.getByRole("button", { name: "Create repost" })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: "Create repost" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Reposting…" })).toBeDisabled())
  expect(updated).not.toHaveBeenCalled()
  m.result = { commandId: m.saved!.key, kind: "REPOST", status: "COMPLETED", outcome: "REJECTED",
    reason: "INSUFFICIENT_CREDITS", message: "Repost failed: insufficient available credits." }
  await act(async () => { await m.poll?.() })
  await waitFor(() => expect(updated).toHaveBeenCalledWith(expect.objectContaining({ id: "old", status: "EXPIRED", version: 3 })))
  expect(screen.getByRole("alert")).toHaveTextContent("Repost failed: insufficient available credits.")
  expect(screen.getByRole("button", { name: "Create repost" })).toBeEnabled()
  expect(m.saved).toBeNull()
  expect(screen.queryByRole("button", { name: /Continue/ })).not.toBeInTheDocument()
})
