import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { FirebaseError } from "firebase/app"

import { PasswordResetForm } from "./password-reset-form"

const mocks = vi.hoisted(() => ({
  sendFirebasePasswordResetEmail: vi.fn(),
  push: vi.fn(),
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    sendFirebasePasswordResetEmail: mocks.sendFirebasePasswordResetEmail,
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mocks.sendFirebasePasswordResetEmail.mockResolvedValue(undefined)
})

it("renders the password reset form", () => {
  render(<PasswordResetForm />)

  expect(screen.getByText("Forgot password?")).toBeInTheDocument()
  expect(
    screen.getByText(
      "Enter the email address associated with your account. We will send you a link to reset your password.",
    ),
  ).toBeInTheDocument()

  expect(screen.getByLabelText("Email")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Back to sign in" })).toBeInTheDocument()
})

it("disables the submit button when the email is empty", () => {
  render(<PasswordResetForm />)

  expect(screen.getByRole("button", { name: "Send reset link" })).toBeDisabled()
})

it("enables the submit button when an email is entered", () => {
  render(<PasswordResetForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})

  expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled()
})

it("sends a password reset email using the trimmed email address", async () => {
  render(<PasswordResetForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: " anna@example.com " }})
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }))

  await waitFor(() => {
    expect(mocks.sendFirebasePasswordResetEmail).toHaveBeenCalledWith("anna@example.com")
  })

  expect(await screen.findByText("A password reset link will be sent. Please check your inbox and spam folder.")).toBeInTheDocument()
})

it("shows a generic error when the password reset request fails because the user does not exist", async () => {
  mocks.sendFirebasePasswordResetEmail.mockRejectedValue(
    new FirebaseError("auth/user-not-found", "User not found"),
  )

  render(<PasswordResetForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "unknown@example.com" }})
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }),)

  expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument()
})

it("shows an error when the email address is invalid", async () => {
  mocks.sendFirebasePasswordResetEmail.mockRejectedValue(
    new FirebaseError("auth/invalid-email", "Invalid email"),
  )

  render(<PasswordResetForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "invalid-email@invalid.com" }})
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }))

  expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument()
})

it("shows an error when too many password reset requests are made", async () => {
  mocks.sendFirebasePasswordResetEmail.mockRejectedValue(
    new FirebaseError("auth/too-many-requests", "Too many requests"),
  )

  render(<PasswordResetForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }),)

  expect(await screen.findByText("Too many attempts. Please wait a moment and try again.")).toBeInTheDocument()
})

it("shows an error when the authentication service cannot be reached", async () => {
  mocks.sendFirebasePasswordResetEmail.mockRejectedValue(
    new FirebaseError(
      "auth/network-request-failed",
      "Network request failed",
    ),
  )

  render(<PasswordResetForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" },})
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }))

  expect(await screen.findByText("Could not reach the sign-in service. Check your connection.")).toBeInTheDocument()
})

it("shows a fallback error for unexpected errors", async () => {
  mocks.sendFirebasePasswordResetEmail.mockRejectedValue(
    new Error("Unexpected error"),
  )

  render(<PasswordResetForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }))

  expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument()
})

it("clears the previous error when another request is submitted successfully", async () => {
  mocks.sendFirebasePasswordResetEmail
    .mockRejectedValueOnce(
      new FirebaseError("auth/invalid-email", "Invalid email"),
    )
    .mockResolvedValueOnce(undefined)

  render(<PasswordResetForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }))

  expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }))

  expect(await screen.findByText("A password reset link will be sent. Please check your inbox and spam folder.")).toBeInTheDocument()
  expect(screen.queryByText("Enter a valid email address.")).not.toBeInTheDocument()
})

it("navigates back to the login page", () => {
  render(<PasswordResetForm />)

  fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }))

  expect(mocks.push).toHaveBeenCalledWith("/login")
})