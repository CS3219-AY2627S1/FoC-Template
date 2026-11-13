"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FirebaseError } from "firebase/app"

import { useAuth } from "@/components/providers/auth-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

// User not found does not expose missing users for security reasons
const FIREBASE_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-not-found": "Something went wrong. Please try again.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Could not reach the sign-in service. Check your connection.",
}

function describeError(error: unknown): string {
  if (error instanceof FirebaseError) {
    // Include the code for anything unexpected so it can be diagnosed.
    return FIREBASE_MESSAGES[error.code] ?? `Sign-in failed (${error.code}). Please try again.`
  }
  return "Something went wrong. Please try again."
}

export function PasswordResetForm() {
  const { sendFirebasePasswordResetEmail } = useAuth()
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)

    try {
      await sendFirebasePasswordResetEmail(email.trim())
      setMessage(
        "A password reset link will be sent. Please check your inbox and spam folder."
      )
    } catch (err) {
      setError(describeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Forgot password?</CardTitle>
        <CardDescription>
          Enter the email address associated with your account.
          We will send you a link to reset your password.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {message && (
              <Alert>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
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
          </FieldGroup>
        </CardContent>

        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !email.trim()}
          >
            {submitting ? "Sending email…" : "Send reset link"}
          </Button>

          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => router.push("/login")}
          >
            Back to sign in
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}