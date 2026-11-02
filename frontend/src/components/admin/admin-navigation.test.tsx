import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppShell } from "@/components/app-shell"

const mocks = vi.hoisted(() => ({ pathname: "/", enter: vi.fn(), leave: vi.fn(), count: 0, replace: vi.fn() }))
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname, useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a> }))
vi.mock("@/components/admin/admin-mode-provider", () => ({
  AdminModeProvider: ({ children }: { children: ReactNode }) => children,
  useAdminMode: () => ({ checking: false, enter: mocks.enter, leave: mocks.leave }),
}))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({
  user: { uid: "user-a", email: "demo@u.nus.edu" }, signOut: vi.fn(),
}) }))
vi.mock("@/components/providers/config-provider", () => ({ useConfig: () => ({ environment: "local" }) }))
vi.mock("@/hooks/use-credit-balance", () => ({ useCreditBalance: () => ({
  balance: { usableBalance: 10, reservedBalance: 0, totalBalance: 10 }, refresh: vi.fn(), loading: false, error: null,
}) }))
vi.mock("@/hooks/use-report-response-count", () => ({ useReportResponseCount: () => mocks.count }))

afterEach(() => { mocks.count = 0; mocks.replace.mockClear(); cleanup() })

describe("Admin navigation", () => {
  it("replaces normal user tabs and Post Request with only admin tabs", () => {
    mocks.pathname = "/admin/orders"
    render(<AppShell>Admin content</AppShell>)
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/admin/reports")
    expect(screen.getByRole("link", { name: "Orders" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Suppliers" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "My Requests" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Post Request" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Normal Mode" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument()
  })

  it("preserves normal navigation and exposes the Admin Mode button", () => {
    mocks.pathname = "/"
    render(<AppShell>Normal content</AppShell>)
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Browse Errands" })).toHaveAttribute("href", "/errands")
    expect(screen.getByRole("link", { name: "Report an Issue" })).toHaveAttribute("href", "/reporting")
    expect(screen.getByRole("link", { name: "My Requests" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Admin Mode" })).toBeInTheDocument()
  })
  it("shows the unanswered-report count in normal navigation and hides it in admin mode", () => {
    mocks.pathname = "/reporting"; mocks.count = 0
    const view = render(<AppShell><textarea aria-label="Report draft" defaultValue="" /></AppShell>)
    fireEvent.change(screen.getByLabelText("Report draft"), { target: { value: "Keep my draft" } })
    mocks.count = 3
    view.rerender(<AppShell><textarea aria-label="Report draft" defaultValue="" /></AppShell>)
    expect(screen.getByLabelText("Report draft")).toHaveValue("Keep my draft")
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.getByLabelText("3 reports awaiting your response")).toHaveTextContent("3")
    expect(screen.getByRole("link", { name: /Report an Issue/ })).toHaveAttribute("href", "/reporting?tab=against-me")
    view.unmount(); mocks.pathname = "/admin/reports"
    render(<AppShell>Admin content</AppShell>)
    expect(screen.queryByLabelText("3 reports awaiting your response")).not.toBeInTheDocument()
  })

})
