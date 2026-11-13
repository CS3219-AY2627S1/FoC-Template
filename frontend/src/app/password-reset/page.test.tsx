import { cleanup, render, screen } from "@testing-library/react"
import { vi, afterEach, expect, it } from "vitest"

import PasswordResetPage from "./page"

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
    sendFirebasePasswordResetEmail: vi.fn(),
  }),
}))

it("renders the password reset form inside the password reset page", () => {
  render(<PasswordResetPage />)

  expect(screen.getByText("Forgot password?")).toBeInTheDocument()
  expect(screen.getByLabelText("Email")).toBeInTheDocument()

  expect(
    screen.getByRole("button", { name: "Send reset link" }),
  ).toBeInTheDocument()

  expect(
    screen.getByRole("button", { name: "Back to sign in" }),
  ).toBeInTheDocument()
})