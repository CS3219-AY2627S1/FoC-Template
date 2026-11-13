import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { PendingOrderCommands } from "@/components/orders/pending-order-commands"

const mocks = vi.hoisted(() => ({ api: vi.fn(), loading: false }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: { uid: "owner" }, loading: mocks.loading }) }))
vi.mock("@/hooks/use-visible-polling", async () => {
  const { useEffect } = await import("react")
  return { ORDER_POLL_INTERVAL_MS: 5000, useVisiblePolling: (callback: (signal: AbortSignal) => Promise<void>, enabled: boolean) => {
    useEffect(() => {
      const controller = new AbortController()
      if (enabled) void callback(controller.signal)
      return () => controller.abort()
    }, [callback, enabled])
  } }
})
beforeEach(() => { vi.clearAllMocks(); mocks.loading = false })
it("shows saved pending actions even when there is no order card, with Continue only for authorization", async () => {
  mocks.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: true }
    : { items: [
      { commandId: "K", kind: "ACCEPT", status: "PENDING", reason: "RETRY_SCHEDULED", message: "Safely retrying.", attemptCount: 2 },
      { commandId: "A", kind: "ABORT", status: "PENDING", reason: "AUTHORIZATION_REQUIRED", message: "Authorization needed." },
    ], totalPages: 1 })
  render(<PendingOrderCommands onResolved={vi.fn()} />)
  expect(await screen.findByText("Accepting errand")).toBeInTheDocument()
  expect(screen.getByText(/Safely retrying.*Attempt 2/)).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /^retry/i })).not.toBeInTheDocument()
  const buttons = screen.getAllByRole("button", { name: "Continue with authorization" })
  expect(buttons).toHaveLength(1)
  fireEvent.click(buttons[0])
  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/orders/commands/A/resume?userId=owner", { method: "POST" }))
})
it("does not call a protected endpoint until auth is ready", async () => {
  mocks.loading = true
  render(<PendingOrderCommands onResolved={vi.fn()} />)
  expect(mocks.api).not.toHaveBeenCalled()
})
it("does not offer Continue in a deployment where recovery is disabled", async () => {
  mocks.api.mockImplementation(async (path: string) => path.endsWith("capabilities") ? { enabled: false }
    : { items: [{ commandId: "K", kind: "CREATE", status: "PENDING", reason: "AUTHORIZATION_REQUIRED", message: "Saved for recovery." }], totalPages: 1 })
  render(<PendingOrderCommands onResolved={vi.fn()} />)
  expect(await screen.findByText("Posting request")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Continue with authorization" })).not.toBeInTheDocument()
})
