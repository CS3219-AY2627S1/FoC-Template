import type { Metadata } from "next"
import { Suspense } from "react"

import { PasswordResetForm } from "./password-reset-form"

export const metadata: Metadata = { title: "Password reset" }

export default function PasswordResetPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <Suspense>
        <PasswordResetForm />
      </Suspense>
    </div>
  )
}
