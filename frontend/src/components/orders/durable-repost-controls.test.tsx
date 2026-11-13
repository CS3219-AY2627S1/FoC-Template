import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { RepostControls } from "@/components/orders/repost-controls"
import type { Order } from "@/lib/orders"

const m = vi.hoisted(() => ({ run: vi.fn(), resume: vi.fn(), pending: true, auth: false, ready: true, api: vi.fn() }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => m.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: { uid: "owner" } }) }))
vi.mock("@/hooks/use-order-command", () => ({ useOrderCommand: () => ({ run: m.run, pending: m.pending,
  ready: m.ready, needsAuthorization: m.auth, continueRecovery: m.resume,
  message: m.pending ? "Processing your request. Please wait." : null }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const original: Order = { id: "old", requesterId: "owner", courierId: null, itemDescription: "task", status: "EXPIRED",
  pickupSupplierId: "p", deliverySupplierId: "d", offeredCredits: 5, deliveryTimeLimitMinutes: 15, version: 2,
  createdAt: "2026-10-10T00:00:00Z", expiresAt: "2026-10-10T01:00:00Z", originalOrderId: null, repostedOrderId: null }
beforeEach(() => { vi.clearAllMocks(); m.pending = true; m.auth = false; m.ready = true })
afterEach(cleanup)
it("disables the repost button and all edited fields for restored pending work", () => {
  render(<RepostControls order={original} onUpdated={vi.fn()} />)
  expect(screen.getByRole("button", { name: "Reposting…" })).toBeDisabled()
  expect(screen.getByLabelText("Description")).toBeDisabled()
  expect(screen.getByLabelText("Credits")).toBeDisabled()
  expect(screen.getByLabelText("Delivery minutes")).toBeDisabled()
  expect(screen.getByLabelText("New expiry date")).toBeDisabled()
  expect(screen.getByRole("combobox", { name: "New expiry minutes" })).toBeDisabled()
  expect(screen.queryByRole("button", { name: /Continue/ })).not.toBeInTheDocument()
})
it("offers Continue only for authorization while keeping the normal action disabled", () => {
  m.auth = true
  render(<RepostControls order={original} onUpdated={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "Continue with authorization" }))
  expect(m.resume).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("button", { name: "Reposting…" })).toBeDisabled()
})
it("submits REPOST through the shared command hook with only existing manual fields", () => {
  m.pending = false
  render(<RepostControls order={original} onUpdated={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "Create repost" }))
  expect(m.run).toHaveBeenCalledWith("REPOST", "/api/orders/old/repost", expect.objectContaining({
    actorId: "owner", expectedVersion: 2, itemDescription: "task", offeredCredits: 5,
  }))
})
