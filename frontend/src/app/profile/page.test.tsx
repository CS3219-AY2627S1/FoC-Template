/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated tests for the profile summary and credit transaction history integration.
 * Author review: I reviewed for correctness and edited where needed.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import ProfilePage from "@/app/profile/page"

const mocks = vi.hoisted(() => ({
  api: vi.fn().mockResolvedValue({ email: "anna@example.com",
    roles: ["requester", "courier"], penalty: 2, isCourierSuspended: false }),
  replace: vi.fn(),
  push: vi.fn(),
}))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => ({ user: { uid: "anna" }, loading: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }))
vi.mock("@/components/credits/transaction-history", () => ({ TransactionHistory: () => <section>Transaction history</section> }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

it("renders the responsive profile summary alongside transaction history", async () => {
  render(<ProfilePage />)
  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith("/api/users/me", expect.anything()))
  expect(screen.queryByText("Account name")).toBeInTheDocument()
  expect(await screen.findByText("anna@example.com")).toBeInTheDocument()
  expect(screen.getByText("requester")).toBeInTheDocument()
  expect(screen.getByText("Active")).toBeInTheDocument()
  expect(screen.getByText("2 penalties")).toBeInTheDocument()
  expect(screen.getByText("Transaction history")).toBeInTheDocument()
})

it("opens the compatible own-profile edit page", async () => {
  render(<ProfilePage />)
  await screen.findByText("anna@example.com")
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }))
  expect(mocks.push).toHaveBeenCalledWith("/profile/edit")
})
