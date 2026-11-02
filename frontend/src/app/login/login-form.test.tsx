/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated tests for the user login page.
 * Author review: I reviewed for correctness and edited where needed.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { FirebaseError } from "firebase/app"

import { LoginForm } from "./login-form"

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  resendVerificationEmail: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  getSearchParam: vi.fn(),
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({
    signIn: mocks.signIn,
    signUp: mocks.signUp,
    resendVerificationEmail: mocks.resendVerificationEmail,
  }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    push: mocks.push,
  }),
  useSearchParams: () => ({
    get: mocks.getSearchParam,
  }),
}))

// Keep these tests focused on LoginForm rather than password-rule internals.
vi.mock("./password-requirements", () => ({
  PasswordRequirements: () => <div>Password requirements</div>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mocks.signIn.mockResolvedValue(undefined)
  mocks.signUp.mockResolvedValue(undefined)
  mocks.resendVerificationEmail.mockResolvedValue(undefined)
  mocks.getSearchParam.mockReturnValue(null)
})

it("renders the sign-in form by default", () => {
  render(<LoginForm />)

  expect(screen.getByText("Sign in", { selector: '[data-slot="card-title"]' })).toBeInTheDocument()
  expect(screen.getByLabelText("Email")).toBeInTheDocument()
  expect(screen.getByLabelText("Password")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()

  expect(screen.queryByLabelText("First name")).not.toBeInTheDocument()
  expect(screen.queryByLabelText("Last name")).not.toBeInTheDocument()
})

it("signs in and redirects to the default page", async () => {
  render(<LoginForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "Password123!" }})
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
  
  await waitFor(() => {
    expect(mocks.signIn).toHaveBeenCalledWith("anna@example.com", "Password123!")
    expect(mocks.replace).toHaveBeenCalledWith("/")
  })
})

it("redirects to a valid next URL after signing in", async () => {
  mocks.getSearchParam.mockReturnValue("/profile")

  render(<LoginForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "Password123!" }})

  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledWith("/profile")
  })
})

it("rejects an unsafe external next URL", async () => {
  mocks.getSearchParam.mockReturnValue("//example.com")

  render(<LoginForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "Password123!" }})

  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

  await waitFor(() => {
    expect(mocks.replace).toHaveBeenCalledWith("/")
  })
})

it("shows an error when sign-in fails", async () => {
  mocks.signIn.mockRejectedValue(
    new FirebaseError("auth/wrong-password", "Wrong password"),
  )

  render(<LoginForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "WrongPassword123!" }})

  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

  expect(await screen.findByText("Incorrect password.")).toBeInTheDocument()
  expect(mocks.replace).not.toHaveBeenCalled()
})

it("navigates to the password reset page", () => {
  render(<LoginForm />)

  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }))

  expect(mocks.push).toHaveBeenCalledWith("/password-reset")
})

it("switches to sign-up mode and displays the additional fields", () => {
  render(<LoginForm />)

  fireEvent.click(
    screen.getByRole("button", { name: "New here? Create an account" }),
  )

  expect(screen.getByText("Create an account")).toBeInTheDocument()
  expect(screen.getByLabelText("First name")).toBeInTheDocument()
  expect(screen.getByLabelText("Last name")).toBeInTheDocument()
  expect(screen.getByLabelText("Confirm password")).toBeInTheDocument()
  expect(screen.getByText("Password requirements")).toBeInTheDocument()
})

it("signs up with the combined first and last name", async () => {
  render(<LoginForm />)

  fireEvent.click(screen.getByRole("button", { name: "New here? Create an account" }))

  fireEvent.change(screen.getByLabelText("First name"), {target: { value: " Anna " }})
  fireEvent.change(screen.getByLabelText("Last name"), {target: { value: " Tan " }})
  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "Password123!" }})
  fireEvent.change(screen.getByLabelText("Confirm password"), {target: { value: "Password123!" }})

  fireEvent.click(screen.getByRole("button", { name: "Create account" }))

  await waitFor(() => {
    expect(mocks.signUp).toHaveBeenCalledWith("anna@example.com", "Password123!", "Anna Tan")
  })

  expect(await screen.findByText("A verification email has been sent to anna@example.com.")).toBeInTheDocument()

  // The form returns to sign-in mode after successful registration.
  expect(screen.getByText("Sign in", { selector: '[data-slot="card-title"]' })).toBeInTheDocument()
  expect(screen.queryByLabelText("First name")).not.toBeInTheDocument()
})

it("does not sign up when the passwords do not match", async () => {
  render(<LoginForm />)

  fireEvent.click(screen.getByRole("button", { name: "New here? Create an account" }))

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "Password123!" }})
  fireEvent.change(screen.getByLabelText("Confirm password"), {target: { value: "DifferentPassword123!" }})

  fireEvent.click(screen.getByRole("button", { name: "Create account" }))

  expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument()
  expect(mocks.signUp).not.toHaveBeenCalled()
})

it("shows a Firebase error when sign-up fails", async () => {
  mocks.signUp.mockRejectedValue(
    new FirebaseError(
      "auth/email-already-in-use",
      "Email already registered",
    ),
  )

  render(<LoginForm />)

  fireEvent.click(screen.getByRole("button", { name: "New here? Create an account" }))

  fireEvent.change(screen.getByLabelText("First name"), {target: { value: "Anna" }})
  fireEvent.change(screen.getByLabelText("Last name"), {target: { value: "Tan" }})
  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "Password123!" }})
  fireEvent.change(screen.getByLabelText("Confirm password"), {target: { value: "Password123!" }})

  fireEvent.click(screen.getByRole("button", { name: "Create account" }))

  expect(
    await screen.findByText("An account with this email already exists."),
  ).toBeInTheDocument()
})

it("shows the verification prompt when sign-in requires email verification", async () => {
  mocks.signIn.mockRejectedValue(new Error("EMAIL_NOT_VERIFIED"))

  render(<LoginForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "Password123!" }})

  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

  expect(await screen.findByText("Please verify your email before signing in.")).toBeInTheDocument()

  expect(screen.getByRole("button", { name: "Resend verification email" })).toBeInTheDocument()

  expect(mocks.replace).not.toHaveBeenCalled()
})

it("resends the verification email", async () => {
  mocks.signIn.mockRejectedValue(new Error("EMAIL_NOT_VERIFIED"))

  render(<LoginForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "Password123!" }})

  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

  const resendButton = await screen.findByRole("button", {
    name: "Resend verification email",
  })

  fireEvent.click(resendButton)

  await waitFor(() => {
    expect(mocks.resendVerificationEmail).toHaveBeenCalledWith("anna@example.com", "Password123!")
  })

  expect(await screen.findByText("A new verification email has been sent to anna@example.com.")).toBeInTheDocument()
})

it("informs the user if their email is already verified when resending", async () => {
  mocks.signIn.mockRejectedValue(new Error("EMAIL_NOT_VERIFIED"))
  mocks.resendVerificationEmail.mockRejectedValue(
    new Error("EMAIL_ALREADY_VERIFIED"),
  )

  render(<LoginForm />)

  fireEvent.change(screen.getByLabelText("Email"), {target: { value: "anna@example.com" }})
  fireEvent.change(screen.getByLabelText("Password"), {target: { value: "Password123!" }})

  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))

  fireEvent.click(await screen.findByRole("button", {name: "Resend verification email"}))

  expect(await screen.findByText("Your email is already verified. You can sign in now.")).toBeInTheDocument()

  expect(screen.queryByRole("button", { name: "Resend verification email" })).not.toBeInTheDocument()
})