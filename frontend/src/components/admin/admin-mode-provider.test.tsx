import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AdminGate, AdminModeProvider, useAdminMode } from "./admin-mode-provider"

const mocks = vi.hoisted(() => ({
  api: vi.fn(), push: vi.fn(), pathname: "/",
  config: { environment: "local", authEmulatorUrl: "http://localhost:9099" as string | null, adminApiMode: "mock" as "mock" | "live" },
  user: { uid: "user-a" } as { uid: string } | null,
}))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/config-provider", () => ({ useConfig: () => mocks.config }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }))
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname, useRouter: () => ({ push: mocks.push }),
}))

function Probe() {
  const admin = useAdminMode()
  return <><button onClick={() => void admin.enter()}>Enter</button><button onClick={admin.leave}>Leave</button>
    <span>{admin.allowed ? "Allowed" : "Denied"}</span>
    <AdminGate><p>Protected admin content</p></AdminGate></>
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.pathname = "/"; mocks.user = { uid: "user-a" }
  mocks.config = { environment: "local", authEmulatorUrl: "http://localhost:9099", adminApiMode: "mock" }
})
afterEach(cleanup)

describe("Admin mode authorization", () => {
  it("uses the real authenticated role-context on staging and requires the actual admin role", async () => {
    mocks.config = { environment: "staging", authEmulatorUrl: null, adminApiMode: "live" }
    mocks.api.mockResolvedValue({ userId: "user-a", roles: ["requester", "courier"] })
    render(<AdminModeProvider><Probe /></AdminModeProvider>)
    fireEvent.click(screen.getByText("Enter"))
    await screen.findByText("Only administrators can enter Admin Mode.")
    expect(mocks.api).toHaveBeenCalledWith("/api/users/role-context", { signal: undefined })
    expect(mocks.push).not.toHaveBeenCalled()
    expect(screen.queryByText("Protected admin content")).not.toBeInTheDocument()
  })

  it("uses real admin verification in local HTTP-peer mode despite the Auth emulator", async () => {
    mocks.config.adminApiMode = "live"
    mocks.api.mockResolvedValue({ userId: "user-a", roles: ["courier"] })
    render(<AdminModeProvider><Probe /></AdminModeProvider>)
    fireEvent.click(screen.getByText("Enter"))
    await screen.findByText("Only administrators can enter Admin Mode.")
    expect(mocks.api).toHaveBeenCalledWith("/api/users/role-context", { signal: undefined })
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("checks the current identity before entering and supports returning to normal mode", async () => {
    mocks.api.mockResolvedValue({ userId: "user-a", roles: ["admin"] })
    render(<AdminModeProvider><Probe /></AdminModeProvider>)
    expect(screen.queryByText("Protected admin content")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("Enter"))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/admin/orders"))
    expect(mocks.api.mock.calls[0][0]).toBe("/api/users/role-context")
    expect(screen.getByText("Protected admin content")).toBeInTheDocument()
    fireEvent.click(screen.getByText("Leave"))
    expect(mocks.push).toHaveBeenLastCalledWith("/")
    expect(screen.queryByText("Protected admin content")).not.toBeInTheDocument()
  })

  it.each([
    { userId: "user-a", roles: ["courier"] },
    { userId: "different-user", roles: ["admin"] },
  ])("denies non-admin or mismatched role-context identity", async (response) => {
    mocks.api.mockResolvedValue(response)
    render(<AdminModeProvider><Probe /></AdminModeProvider>)
    fireEvent.click(screen.getByText("Enter"))
    await screen.findByText("Only administrators can enter Admin Mode.")
    expect(mocks.push).not.toHaveBeenCalled()
    expect(screen.queryByText("Protected admin content")).not.toBeInTheDocument()
  })

  it("fails closed on direct navigation when the endpoint is unavailable", async () => {
    mocks.pathname = "/admin/users"
    mocks.api.mockRejectedValue(new Error("Demo endpoint unavailable"))
    render(<AdminModeProvider><Probe /></AdminModeProvider>)
    expect(await screen.findByText("Demo endpoint unavailable")).toBeInTheDocument()
    expect(screen.queryByText("Protected admin content")).not.toBeInTheDocument()
  })

  it("does not retain previous-user permissions or accept a late response", async () => {
    let resolve!: (value: unknown) => void
    mocks.api.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const view = render(<AdminModeProvider><Probe /></AdminModeProvider>)
    fireEvent.click(screen.getByText("Enter"))
    mocks.user = { uid: "user-b" }
    view.rerender(<AdminModeProvider><Probe /></AdminModeProvider>)
    await act(async () => resolve({ userId: "user-a", roles: ["admin"] }))
    expect(screen.queryByText("Protected admin content")).not.toBeInTheDocument()
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
