import { cleanup, render, screen } from "@testing-library/react"
import { vi, afterEach, expect, it } from "vitest"

import LoginPage from "./page"

afterEach(() => {
  cleanup()
})

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    resendVerificationEmail: vi.fn(),
  }),
}))

it("renders the login form inside the login page", () => {
  render(<LoginPage />)

  expect(screen.getByText("Sign in", { selector: '[data-slot="card-title"]' })).toBeInTheDocument()
  expect(screen.getByLabelText("Email")).toBeInTheDocument()
  expect(screen.getByLabelText("Password")).toBeInTheDocument()
})