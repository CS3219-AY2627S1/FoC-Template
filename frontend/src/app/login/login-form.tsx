"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"
import { FirebaseError } from "firebase/app"

import { useAuth } from "@/components/providers/auth-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { PasswordRequirements } from "./password-requirements"

type Mode = "sign-in" | "sign-up"

const FIREBASE_MESSAGES: Record<string, string> = {
  "auth/wrong-password": "Incorrect password.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Choose a stronger password.",
  "auth/password-does-not-meet-requirements": "Your password doesn't meet the requirements listed below the password field.",
  "auth/operation-not-allowed": "Email sign-up is not enabled for this app. Please contact the team.",
  "auth/admin-restricted-operation": "New accounts can't be created right now. Please contact the team.",
  "auth/user-not-found": "No account of this email has been found. Please create an account.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Could not reach the sign-in service. Check your connection.",
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") {
    return "Email is not verified."
  }
  if (error instanceof FirebaseError) {
    // Include the code for anything unexpected so it can be diagnosed.
    return FIREBASE_MESSAGES[error.code] ?? `Sign-in failed (${error.code}). Please try again.`
  }
  return "Something went wrong. Please try again."
}

// Only allow same-site relative redirects after sign-in.
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/"
}

export function LoginForm() {
  const { signIn, signUp, resendVerificationEmail } = useAuth()
  const router = useRouter()
  const next = safeNext(useSearchParams().get("next"))

  const [mode, setMode] = useState<Mode>("sign-in")

  // Regular field states
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Field state for sign up
  const [confirmPassword, setConfirmPassword] = useState("")

  // Email verification states
  const [verificationPending, setVerificationPending] = useState(false)
  const [resending, setResending] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [passwordValid, setPasswordValid] = useState(true)
  const onPasswordValidity = useCallback((valid: boolean) => setPasswordValid(valid), [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    setVerificationMessage(null)
    setVerificationPending(false)

    try {
      if (mode === "sign-in") {
        try {
          await signIn(email.trim(), password)
          router.replace(next)
        } catch (err) {
          if (err instanceof Error && err.message === "EMAIL_NOT_VERIFIED") {
            setVerificationPending(true)
          } else {
            throw err
          }
        }
      } else { 
        if (!firstName.trim() || !lastName.trim()) {
          setError("Please enter your first and last name.")
          return
        }

        if (password !== confirmPassword) {
          setError("Passwords do not match.")
          return
        }

        const username = `${firstName.trim()} ${lastName.trim()}`

        await signUp(email.trim(), password, username)

        // Change page back to sign in
        setMode("sign-in")
        setFirstName("")
        setLastName("")
        setPassword("")
        setConfirmPassword("")

        setVerificationPending(true)
        setVerificationMessage(
          `A verification email has been sent to ${email.trim()}.`,
        )
      }
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResendVerification() {
    setResending(true)
    setVerificationMessage(null)
    setError(null)

    try {
      await resendVerificationEmail(email.trim(), password)
      setVerificationMessage(
        `A new verification email has been sent to ${email.trim()}.`,
      )
    } catch (err) {
      if (err instanceof Error && err.message === "EMAIL_ALREADY_VERIFIED") {
        setVerificationPending(false)
        setVerificationMessage(
          "Your email is already verified. You can sign in now.",
        )
      } else {
        setError(describeError(err))
      }
    } finally {
      setResending(false)
    }
  }

  const isSignIn = mode === "sign-in"

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{isSignIn ? "Sign in" : "Create an account"}</CardTitle>
        <CardDescription>
          {isSignIn ? "Use your campus email to continue." : "Sign up to request and deliver campus errands."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {verificationMessage && (
              <Alert>
                <AlertDescription>{verificationMessage}</AlertDescription>
              </Alert>
            )}
            {verificationPending && isSignIn && (
              <div className="w-full space-y-3">
                <p className="text-sm text-muted-foreground">
                  Please verify your email before signing in.
                </p>
                <p className="text-sm text-muted-foreground">
                  Check your inbox and spam folder, then enter your password and use the button below to resend
                  the verification email if necessary.
                </p>
              <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={resending || submitting || !email.trim() || !password}
                  onClick={handleResendVerification}
                >
                  {resending ? "Sending email…" : "Resend verification email"}
                </Button>
              </div>
            )}
            {!isSignIn && (
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="firstName">First name</FieldLabel>
                  <Input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="First name"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                  <Input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Last name"
                  />
                </Field>
              </div>
            )}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="e0123456@u.nus.edu"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete={isSignIn ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {isSignIn && 
                <div className="flex justify-start">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="px-0"
                    onClick={() => {router.push("/password-reset")}}
                  >
                    Forgot password?
                  </Button>
                </div>
              }
              {!isSignIn && <PasswordRequirements password={password} onValidityChange={onPasswordValidity} />}
            </Field>
            {!isSignIn && (
              <Field>
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete={"new-password"}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-destructive">
                    Passwords do not match.
                  </p>
                )}
              </Field>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" 
            className="w-full" 
            disabled={submitting || !email || !password || (!isSignIn && !passwordValid && password !== confirmPassword)}>
            {submitting ? "Please wait…" : isSignIn ? "Sign in" : "Create account"}
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              setMode(isSignIn ? "sign-up" : "sign-in")
              setError(null)
              setVerificationMessage(null)
              setVerificationPending(false)
              setPassword("")
              setPasswordValid(true)
            }}
          >
            {isSignIn ? "New here? Create an account" : "Already have an account? Sign in"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}