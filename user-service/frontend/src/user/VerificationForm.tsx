// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import type { Session } from '@relay/contracts'
import { VerificationComponent } from '../components/VerificationComponent'

export function VerificationForm({
  email,
  password,
  onVerified,
  onBack,
  backLabel,
}: {
  email: string
  password: string
  onVerified: (profileCreated: boolean) => void | Promise<void>
  onBack: () => void
  backLabel?: string
}) {
  return (
    <div className="user-form">
      <div className="user-form-heading">
        <h1>Check your inbox</h1>
        <p>
          We sent a 6-digit code to <strong>{email}</strong>.
        </p>
      </div>
      <VerificationComponent
        email={email}
        password={password}
        onVerified={onVerified}
        onBack={onBack}
        backLabel={backLabel}
      />
    </div>
  )
}
