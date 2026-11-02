"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { verifyBeforeUpdateEmail, reload, EmailAuthProvider, reauthenticateWithCredential, updatePassword, type User } from "firebase/auth"
import { FirebaseError } from "firebase/app"

import { useAuth } from "@/components/providers/auth-provider"
import { useApi } from "@/hooks/use-api"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { DeleteAccountButton } from "@/components/users/delete-account-button"

import { PasswordRequirements } from "../../login/password-requirements"

type UserProfile = { email: string; username?: string | null }

const FIREBASE_MESSAGES: Record<string, string> = {
  "auth/wrong-password": "Your current password is incorrect.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Please choose a stronger password.",
  "auth/password-does-not-meet-requirements": "Your password doesn't meet the requirements listed below the password field.",
  "auth/operation-not-allowed": "Email sign-up is not enabled for this app. Please contact the team.",
  "auth/admin-restricted-operation": "New accounts can't be created right now. Please contact the team.",
  "auth/user-not-found": "No account of this email has been found. Please create an account.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Could not reach the sign-in service. Check your connection.",
  "auth/requires-recent-login": "Please sign in again before changing your password.",
}

function describeError(error: unknown): string {
    if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") {
        return "Email is not verified."
    }
    if (error instanceof FirebaseError) {
        // Include the code for anything unexpected so it can be diagnosed.
        return FIREBASE_MESSAGES[error.code] ?? `Authentication failed (${error.code}). Please try again.`
    }

    if (error instanceof Error) {
        return error.message
    }

    return "Something went wrong. Please try again."
}

export default function EditProfilePage() {
    const { user, loading } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!loading && !user) router.replace("/login")
    }, [loading, user, router])

    if (loading || !user) return <div className="px-4 py-8" role="status">Loading...</div>

    // A different signed-in account must not inherit another account's drafts.
    return <EditProfileForm key={user.uid} user={user} />
}

function EditProfileForm({ user }: { user: User }) {
    const api = useApi()
    const router = useRouter()
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [profileLoading, setProfileLoading] = useState(true)
    const [profileError, setProfileError] = useState<string | null>(null)
    const active = useRef(false)

    const [saving, setSaving] = useState(false)

    // Username field states
    const [username, setUsername] = useState("")
    const [usernameMessage, setUsernameMessage] = useState("")
    const [usernameError, setUsernameError] = useState<string | null>(null)

    // Email verification states
    const [email, setEmail] = useState("")
    const [emailVerificationSent, setEmailVerificationSent] = useState(false)
    const [emailMessage, setEmailMessage] = useState("")
    const [emailVerifiedMessage, setEmailVerifiedMessage] = useState("")
    const [pendingEmail, setPendingEmail] = useState("")
    const [sendingVerification, setSendingVerification] = useState(false)
    const [checkingVerification, setCheckingVerification] = useState(false)
    const [emailError, setEmailError] = useState<string | null>(null)

    // Password states
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [changingPassword, setChangingPassword] = useState(false)
    const [passwordMessage, setPasswordMessage] = useState("")
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [passwordValid, setPasswordValid] = useState(true)
    const onPasswordValidity = useCallback((valid: boolean) => setPasswordValid(valid), [])

    // Delete states
    const [deleteError, setDeleteError] = useState("");

    const loadProfile = useCallback(async (signal?: AbortSignal) => {
        setProfileLoading(true)
        setProfileError(null)
        try {
            const data = await api<UserProfile>("/api/users/me", { signal })
            if (!signal?.aborted) {
                setProfile(data)
                setUsername(data.username ?? "")
                setEmail(data.email)
            }
        } catch (err) {
            if (!signal?.aborted) setProfileError(err instanceof Error ? err.message : "Unable to load profile.")
        } finally {
            if (!signal?.aborted) setProfileLoading(false)
        }
    }, [api])

    useEffect(() => {
        active.current = true
        const controller = new AbortController()
        const initial = window.setTimeout(() => void loadProfile(controller.signal), 0)
        return () => {
            active.current = false
            window.clearTimeout(initial)
            controller.abort()
        }
    }, [loadProfile])

    async function handleSaveUsername(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setUsernameError(null)
        setSaving(true)
        setUsernameMessage("")

        try {
            const trimmed = username.trim()
            if (trimmed.length < 3 || trimmed.length > 30) {
                throw new Error("Username must be between 3 and 30 characters.")
            }
            const saved = await api<UserProfile>("/api/users/me", {
                method: "PUT", body: { username: trimmed },
            })
            setProfile(saved)
            setUsername(saved.username ?? trimmed)
            
            setUsernameMessage("Username updated successfully.")
        } catch (err) {
            setUsernameError(err instanceof Error ? err.message : "Failed to update profile.")
        } finally {
            setSaving(false)
        }
    }

    async function handleCancel() {
        setEmailError(null)
        setUsernameError(null)
        setPasswordError(null)

        setEmailMessage("")
        setEmailVerifiedMessage("")
        setPasswordMessage("")
        setUsernameMessage("")

        setSaving(false)

        router.push("/profile")
    }

    async function handleEmailChange() {
        try {
            if (!user) {
                throw new Error("You must be signed in.")
            }

            setEmailVerifiedMessage("")
            setEmailMessage("")
            setEmailError(null)

            const newEmail = email.trim()

            if (!newEmail) {
                throw new Error("Please enter an email address.")
            }

            if (newEmail.toLowerCase() === (user.email ?? "").toLowerCase()) {
                throw new Error("This is already your current email address.")
            }

            setSendingVerification(true)
            
            await verifyBeforeUpdateEmail(user, newEmail)

            setPendingEmail(newEmail)
            setEmailVerificationSent(true)
            setEmailMessage(
                "Verification email sent. Verify the new address before returning."
            )
        } catch (err) {
            setEmailError(describeError(err))
        } finally {
            setSendingVerification(false)
        }
    }

    async function handleCheckEmailVerification() {
        setEmailMessage("")
        setEmailVerifiedMessage("Checking verification status...")
        setEmailError(null)
        setCheckingVerification(true)

        try {
            if (!pendingEmail) throw new Error("Please request an email verification first.")
            // Refresh the Firebase user's state
            await reload(user)
            if (!active.current) return

            const currentEmail = user.email ?? ""

            if (currentEmail.toLowerCase() !== pendingEmail.toLowerCase() || !user.emailVerified) {
                setEmailVerifiedMessage("")
                throw new Error("Your email has not been verified yet. Please check your inbox.")
            }

            // GET /me only reads the stored profile on this branch. Persist the
            // verified identity email through the existing authenticated self API.
            await user.getIdToken(true)
            if (!active.current) return
            const saved = await api<UserProfile>("/api/users/me/email-sync", {
                method: "POST", body: {},
            })
            if (saved.email.toLowerCase() !== currentEmail.toLowerCase()) {
                throw new Error("Your verified email has not been saved to your profile. Please try again.")
            }
            setProfile(saved)

            setEmail(currentEmail)
            setPendingEmail("")
            setEmailVerificationSent(false)
            setEmailVerifiedMessage("Your email has been updated and saved successfully.")
        } catch (err) {
            setEmailVerifiedMessage("")
            setEmailError(describeError(err))
        } finally {
            setCheckingVerification(false)
        }
    }

    async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault() 
        setPasswordMessage("") 
        setPasswordError("")

        // Check user's email to not be null here
        // as EmailAuthProvider uses user.email
        if (!user || !user.email) { 
            setPasswordError("You must be signed in to change your password.") 
            return 
        }

        if (!currentPassword) { 
            setPasswordError("Please fill in your current password.") 
            return 
        }

        if (!newPassword) { 
            setPasswordError("Please enter a new password to change to.") 
            return 
        }

        if (!confirmPassword) { 
            setPasswordError("Please confirm your new password.") 
            return 
        }

        if (newPassword !== confirmPassword) { 
            setPasswordError("The new passwords do not match.") 
            return 
        } 
        
        if (currentPassword === newPassword) { 
            setPasswordError("Your new password must be different.") 
            return 
        }

        setChangingPassword(true)

        try { 
            // Verify the current password
            const credential = EmailAuthProvider.credential(user.email, currentPassword) 
            await reauthenticateWithCredential(user, credential) 
            if (!active.current) return

            // Update the password in Firebase Authentication
            await updatePassword(user, newPassword)
            setCurrentPassword("") 
            setNewPassword("") 
            setConfirmPassword("") 
            setPasswordMessage("Password changed successfully.") 
        } catch (error: unknown) { 
            // Display the corresponding error message to user
            console.error("Password change failed:", error) 
            setPasswordError(describeError(error))
        } finally { 
            setChangingPassword(false)
        }
    }

    async function handleDeleteError(message: string) {
        console.log("Error received:", message)
        setDeleteError(message);
    }

  if (profileLoading) {
    return <div className="flex min-h-screen items-center justify-center px-4 py-8">
              <Card className="w-full max-w-sm">
                <CardHeader>
                  <CardTitle className="text-xl">{"Loading..."}</CardTitle>
                </CardHeader>
              </Card>
            </div>
  }

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center px-4 py-8">
              <Card className="w-full max-w-sm">
                <CardHeader>
                  <CardTitle className="text-xl">{"Unable to load profile."}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-sm text-destructive" role="alert">{profileError}</p>
                  <Button variant="outline" onClick={() => void loadProfile()}>Try again</Button>
                </CardContent>
              </Card>
            </div>
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{"My Profile"}</CardTitle>
        </CardHeader>

        <CardContent>
            <div className="w-full pt-4">
                <form id="edit-email-form" className="space-y-4">
                    <Field>
                        <FieldLabel htmlFor="email">Email</FieldLabel>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="Enter an email here."
                        />
                    </Field>
                    <div className="space-y-2">
                        <Button 
                            type="button" 
                            disabled={!email.trim() || sendingVerification || checkingVerification}
                            onClick={handleEmailChange}
                        >    
                            {sendingVerification 
                                ? "Sending..."
                                : emailVerificationSent 
                                    ? "Resend verification email" 
                                    : "Send verification email"}
                        </Button>
                    </div>
                    {emailError && (
                        <p className="text-sm text-destructive" role="status">
                            {emailError}
                        </p>
                    )}
                    {emailMessage && (
                        <p className="text-sm text-muted-foreground" role="status">
                            {emailMessage}
                        </p>
                    )}
                    {emailVerifiedMessage && (
                        <p className="text-sm text-green-600" role="status">
                            {emailVerifiedMessage}
                        </p>
                    )}
                    {emailVerificationSent && (
                        <div className="space-y-2">
                            <Button 
                                type="button"
                                variant="outline"
                                disabled={checkingVerification || sendingVerification}
                                onClick={handleCheckEmailVerification}
                            >
                                I&apos;ve verified my email
                            </Button>
                        </div>
                    )}
                </form>
            </div>
            <div className="w-full pt-4">
                <form id="edit-username-form" onSubmit={handleSaveUsername} className="space-y-4">
                    <Field>
                    <FieldLabel htmlFor="username">Username</FieldLabel>
                        <Input
                            id="username"
                            type="text"
                            autoComplete="username"
                            required
                            minLength={3} 
                            maxLength={30}
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            placeholder="Enter a username here."
                        />
                    </Field>
                    {usernameError && ( 
                        <p className="text-sm text-destructive" role="status"> 
                            {usernameError}
                        </p> 
                    )}
                    {usernameMessage && ( 
                        <p className="text-sm text-green-600" role="status"> 
                            {usernameMessage}
                        </p> 
                    )}
                    <Button
                        type="submit"
                        form="edit-username-form"
                        className="w-fit"
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save username"}
                    </Button>
                </form>
            </div>
            <div className="w-full pt-4">
                <form id="edit-password-form" onSubmit={handleChangePassword} className="space-y-4">
                    <Field>
                    <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
                        <Input
                            id="currentPassword"
                            type="password"
                            autoComplete="current-password"
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                            disabled={changingPassword}
                            required
                        />
                    </Field> 
                    <Field>
                        <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                        <Input
                            id="newPassword"
                            type="password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            disabled={changingPassword}
                            required
                        />
                        {<PasswordRequirements password={newPassword} onValidityChange={onPasswordValidity} />}
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
                        <Input
                            id="confirmPassword"
                            type="password"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            disabled={changingPassword}
                            required
                        />
                        {<PasswordRequirements password={newPassword} onValidityChange={onPasswordValidity} />}
                    </Field>
                    {passwordError && (
                        <p className="text-sm text-destructive" role="alert">
                            {passwordError}
                        </p>
                    )} 
                    {passwordMessage && ( 
                        <p className="text-sm text-green-600" role="status"> 
                            {passwordMessage} 
                        </p> 
                    )} 
                    <Button 
                        type="submit" 
                        disabled={changingPassword || !passwordValid}
                    > 
                        {changingPassword ? "Changing Password..." : "Change Password"} 
                    </Button>
                </form>
            </div>
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-3">
            <p className="mt-1 mb-3 text-sm text-muted-foreground">
                Unsaved changes will be discarded.
            </p>
            <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  disabled={saving}
                  onClick={handleCancel}
                >
                  Exit
            </Button>
            <div className="w-full border-t pt-4">
                <p className="mt-1 mb-3 text-sm text-muted-foreground">
                    Permanently delete your account and its associated profile.
                    This action cannot be undone.
                </p>
                {deleteError && (
                    <div className="w-full pt-4">
                        <p className="text-sm text-destructive" role="alert">
                            {deleteError}
                        </p>
                    </div>
                )}
                <div className="w-full pt-4">
                    <DeleteAccountButton onError={handleDeleteError}/>
                </div>
            </div>
        </CardFooter>
      </Card>
    </div>
  )
}
