
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import DeleteAccountButton from "@/components/users/delete-account-button"

const mocks = vi.hoisted(() => ({
  getIdToken: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  onError: vi.fn(),
  user: { uid: "anna", email: "anna@u.nus.edu" },
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    user: mocks.user,
    getIdToken: mocks.getIdToken,
    signOut: mocks.signOut,
  }),
}))

vi.mock("@/components/providers/config-provider", () => ({
  useConfig: () => ({ apiBaseUrl: "" }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getIdToken.mockResolvedValue("fresh-token")
  mocks.signOut.mockResolvedValue(undefined)
  vi.stubGlobal("fetch", vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("renders the delete-account button", () => {
  render(<DeleteAccountButton onError={mocks.onError} />)

  expect(
    screen.getByRole("button", { name: "Delete account" })
  ).toBeInTheDocument()
})

it("opens the confirmation dialog when the delete button is clicked", () => {
  render(<DeleteAccountButton onError={mocks.onError} />)

  fireEvent.click(screen.getByRole("button", { name: "Delete account" }))

  expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  expect(
    screen.getByText("Are you sure you want to permanently delete your account? This action cannot be undone.")
  ).toBeInTheDocument()
})

it("does not delete the account when confirmation is cancelled", () => {
  render(<DeleteAccountButton onError={mocks.onError} />)

  fireEvent.click(screen.getByRole("button", { name: "Delete account" }))
  fireEvent.click(screen.getByRole("button", { name: "Keep account" }))

  expect(fetch).not.toHaveBeenCalled()
  expect(mocks.getIdToken).not.toHaveBeenCalled()
  expect(mocks.onError).not.toHaveBeenCalled()
})

it("deletes the account, signs out and redirects on success", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(null, { status: 204 })
  )

  render(<DeleteAccountButton onError={mocks.onError} />)

  fireEvent.click(screen.getByRole("button", { name: "Delete account" }))
  fireEvent.click(screen.getByRole("button", { name: "Yes, delete account" }))

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/api/users/me", {
      method: "DELETE",
      headers: { Authorization: "Bearer fresh-token" },
    })
  })

  await waitFor(() => {
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith("/login")
  })

  expect(mocks.onError).not.toHaveBeenCalled()
})

it("displays the server error and keeps the dialog open when deletion fails", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({ detail: "Cannot disable user with active orders" }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }
    )
  )

  render(<DeleteAccountButton onError={mocks.onError} />)

  fireEvent.click(screen.getByRole("button", { name: "Delete account" }))
  fireEvent.click(screen.getByRole("button", { name: "Yes, delete account" }))

  await waitFor(() => {
    expect(mocks.onError).toHaveBeenCalledWith(
      "Cannot disable user with active orders"
    )
  })

  expect(mocks.signOut).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(screen.getByRole("alertdialog")).toBeInTheDocument()
})