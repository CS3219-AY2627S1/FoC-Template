import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { FirebaseError } from "firebase/app"

import EditProfilePage from "@/app/profile/edit/page"

const mocks = vi.hoisted(() => ({
  api: vi.fn(), replace: vi.fn(), push: vi.fn(),
  verify: vi.fn(), reload: vi.fn(), reauthenticate: vi.fn(), password: vi.fn(),
  credential: vi.fn(), freshToken: vi.fn(),
  auth: { user: null as null | { uid: string; email: string; emailVerified: boolean; getIdToken: ReturnType<typeof vi.fn> }, loading: false },
}))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.api }))
vi.mock("@/components/providers/auth-provider", () => ({ useAuth: () => mocks.auth }))
vi.mock("@/components/providers/config-provider", () => ({ useConfig: () => ({ apiBaseUrl: "" }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }))
vi.mock("firebase/auth", () => ({
  verifyBeforeUpdateEmail: mocks.verify, reload: mocks.reload,
  EmailAuthProvider: { credential: mocks.credential },
  reauthenticateWithCredential: mocks.reauthenticate, updatePassword: mocks.password,
}))
vi.mock("@/app/login/password-requirements", () => ({ PasswordRequirements: () => null }))

const profile = { username: "Anna", email: "anna@example.com" }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.loading = false
  mocks.auth.user = { uid: "anna", email: profile.email, emailVerified: true, getIdToken: mocks.freshToken }
  mocks.api.mockResolvedValue(profile)
  mocks.freshToken.mockResolvedValue("fresh-token")
  mocks.verify.mockResolvedValue(undefined)
  mocks.reload.mockResolvedValue(undefined)
  mocks.reauthenticate.mockResolvedValue(undefined)
  mocks.password.mockResolvedValue(undefined)
  mocks.credential.mockReturnValue("credential")
})
afterEach(cleanup)

async function loaded() {
  render(<EditProfilePage />)
  expect(await screen.findByLabelText("Username")).toHaveValue("Anna")
}

async function requestEmail() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } })
  fireEvent.click(screen.getByRole("button", { name: "Send verification email" }))
  await screen.findByRole("button", { name: "I've verified my email" })
}

it("loads own profile with the current identity-only auth context and displays the delete-account control", async () => {
  await loaded()
  expect(mocks.api).toHaveBeenCalledWith("/api/users/me", expect.objectContaining({ signal: expect.any(AbortSignal) }))
  expect(screen.getByLabelText("Email")).toHaveValue(profile.email)
  expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument()
})

it("waits for authentication and redirects signed-out users without a profile call", async () => {
  mocks.auth.loading = true
  const view = render(<EditProfilePage />)
  expect(mocks.api).not.toHaveBeenCalled()
  mocks.auth.loading = false
  mocks.auth.user = null
  view.rerender(<EditProfilePage />)
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"))
  expect(mocks.api).not.toHaveBeenCalled()
})

it("offers profile-load retry without enabling the form on failure", async () => {
  mocks.api.mockRejectedValueOnce(new Error("User Service unavailable."))
  render(<EditProfilePage />)
  expect(await screen.findByText("User Service unavailable.")).toBeInTheDocument()
  expect(screen.queryByLabelText("Username")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(await screen.findByLabelText("Username")).toHaveValue("Anna")
})

it("saves only the trimmed username through the existing authenticated self API", async () => {
  await loaded()
  mocks.api.mockResolvedValueOnce({ ...profile, username: "Anna New" })
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "  Anna New  " } })
  fireEvent.click(screen.getByRole("button", { name: "Save username" }))
  expect(await screen.findByText("Username updated successfully.")).toBeInTheDocument()
  expect(mocks.api).toHaveBeenLastCalledWith("/api/users/me", { method: "PUT", body: { username: "Anna New" } })
  expect(screen.getByLabelText("Username")).toHaveValue("Anna New")
})

it("keeps username input and shows a rejected save without false success", async () => {
  await loaded()
  mocks.api.mockRejectedValueOnce(new Error("Sign in to continue."))
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "New Name" } })
  fireEvent.click(screen.getByRole("button", { name: "Save username" }))
  expect(await screen.findByText("Sign in to continue.")).toBeInTheDocument()
  expect(screen.queryByText("Username updated successfully.")).not.toBeInTheDocument()
  expect(screen.getByLabelText("Username")).toHaveValue("New Name")
})

it("does not save an unverified email to User Service", async () => {
  await loaded()
  await requestEmail()
  fireEvent.click(screen.getByRole("button", { name: "I've verified my email" }))
  expect(await screen.findByText(/has not been verified yet/)).toBeInTheDocument()
  expect(mocks.verify).toHaveBeenCalledWith(mocks.auth.user, "new@example.com")
  expect(mocks.api).toHaveBeenCalledTimes(1)
  expect(mocks.freshToken).not.toHaveBeenCalled()
})

it("refreshes the token and saves the verified Firebase email before reporting success", async () => {
  await loaded()
  await requestEmail()
  mocks.reload.mockImplementationOnce(async () => {mocks.auth.user!.email = "new@example.com"})
  mocks.api.mockImplementationOnce(async (path, options) => {
    expect(path).toBe("/api/users/me/email-sync")
    expect(mocks.freshToken).toHaveBeenCalledWith(true)
    expect(options).toEqual({method: "POST", body: {},})
    return {...profile, email: "new@example.com"}
  })
  fireEvent.click(screen.getByRole("button", { name: "I've verified my email" }))
  expect(await screen.findByText("Your email has been updated and saved successfully.")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "I've verified my email" })).not.toBeInTheDocument()
})

it("keeps email synchronization retryable if User Service rejects the save", async () => {
  await loaded()
  await requestEmail()
  mocks.reload.mockImplementationOnce(async () => { mocks.auth.user!.email = "new@example.com" })
  mocks.api.mockRejectedValueOnce(new Error("Profile save unavailable."))
  fireEvent.click(screen.getByRole("button", { name: "I've verified my email" }))
  expect(await screen.findByText("Profile save unavailable.")).toBeInTheDocument()
  expect(screen.queryByText("Your email has been updated and saved successfully.")).not.toBeInTheDocument()
  mocks.api.mockResolvedValueOnce({ ...profile, email: "new@example.com" })
  fireEvent.click(screen.getByRole("button", { name: "I've verified my email" }))
  expect(await screen.findByText("Your email has been updated and saved successfully.")).toBeInTheDocument()
})

it("requires recent Firebase authentication before updating the password", async () => {
  await loaded()
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "Old123!" } })
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "New123!" } })
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "New123!" } })
  mocks.password.mockImplementationOnce(async () => { expect(mocks.reauthenticate).toHaveBeenCalledWith(mocks.auth.user, "credential") })
  fireEvent.click(screen.getByRole("button", { name: "Change Password" }))
  expect(await screen.findByText("Password changed successfully.")).toBeInTheDocument()
  expect(mocks.password).toHaveBeenCalledWith(mocks.auth.user, "New123!")
  expect(mocks.api).toHaveBeenCalledTimes(1)
})

it("does not update the password after failed reauthentication", async () => {
  await loaded()
  mocks.reauthenticate.mockRejectedValueOnce(
    new FirebaseError(
      "auth/wrong-password",
      "The password is invalid."
    )
  )
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "Old123!" } })
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "New123!" } })
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "New123!" } })
  fireEvent.click(screen.getByRole("button", { name: "Change Password" }))
  expect(await screen.findByText("Your current password is incorrect.")).toBeInTheDocument()
  expect(mocks.password).not.toHaveBeenCalled()
})

it("isolates drafts and aborts the old profile load when the account changes", async () => {
  let finish!: (value: typeof profile) => void
  let oldSignal!: AbortSignal
  mocks.api.mockImplementationOnce((_path, options) => {
    oldSignal = options.signal
    return new Promise(resolve => { finish = resolve })
  })
  const view = render(<EditProfilePage />)
  await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1))
  mocks.auth.user = { ...mocks.auth.user!, uid: "beth", email: "beth@example.com" }
  mocks.api.mockResolvedValueOnce({ username: "Beth", email: "beth@example.com" })
  view.rerender(<EditProfilePage />)
  expect(await screen.findByLabelText("Username")).toHaveValue("Beth")
  expect(oldSignal.aborted).toBe(true)
  await act(async () => finish(profile))
  expect(screen.getByLabelText("Username")).toHaveValue("Beth")
})

it("does not synchronize the old account's email after switching accounts mid-verification", async () => {
  await loaded()
  await requestEmail()
  const originalUser = mocks.auth.user!
  let finish!: () => void
  mocks.reload.mockImplementationOnce(() => new Promise<void>(resolve => {
    finish = () => { originalUser.email = "new@example.com"; resolve() }
  }))
  fireEvent.click(screen.getByRole("button", { name: "I've verified my email" }))
  await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1))
  mocks.auth.user = { ...originalUser, uid: "beth", email: "beth@example.com" }
  mocks.api.mockResolvedValueOnce({ username: "Beth", email: "beth@example.com" })
  cleanup()
  render(<EditProfilePage />)
  expect(await screen.findByLabelText("Username")).toHaveValue("Beth")
  await act(async () => finish())
  expect(mocks.api).toHaveBeenCalledTimes(2)
  expect(mocks.freshToken).not.toHaveBeenCalled()
})
