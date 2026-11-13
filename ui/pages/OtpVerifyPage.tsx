// AI-assisted (Claude Opus 5.5), 2026-11-12: all password problems in one warning, show/hide toggle; see ui/ai-usage/usage-log.md, entry 002
import React, { useState } from "react"
import { completeResetPassword, verifyRegister } from "../api/users"
import PasswordInput from "../components/PasswordInput"
import { passwordRequirements } from "./SignupPage"

export type OtpKind = "register" | "reset"

interface Props {
  kind: OtpKind
  email: string
  onVerified: () => void
  onBack: () => void
}

// list every problem at once, same as sign up
const passwordProblems = (password: string, confirm: string) => {
  const problems = passwordRequirements(password)
  if (password !== confirm) problems.push("Passwords don't match.")
  return problems
}

export default function OtpVerifyPage({ kind, email, onVerified, onBack }: Props) {
  const [otp, setOtp] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const needsPassword = kind !== "register"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problems = needsPassword ? passwordProblems(password, confirm) : []
    if (!/^\d{6}$/.test(otp)) problems.unshift("Enter the 6-digit code.")
    if (problems.length) { setErrors(problems); return }
    setErrors([])
    setLoading(true)
    try {
      if (kind === "register") await verifyRegister(email, otp)
      else await completeResetPassword(otp, password)
      onVerified()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Verification failed."])
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    "w-full px-3.5 py-2.5 border border-[#E4E8E6] rounded-lg text-sm text-[#1B2522] placeholder-[#9CA3AF] bg-white focus:outline-none focus:border-[#1A4A36] focus:ring-1 focus:ring-[#1A4A36]"

  return (
    <div className="min-h-screen bg-[#F7F9F8] flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-[#E4E8E6] rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-[#162A46] mb-1">Enter your code</h2>
        <p className="text-sm text-[#3F6B5A] mb-5">
          {kind === "register" && `Verify ${email} to create the account.`}
          {kind === "reset" && "Set a new password for the account you are logged into."}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#1B2522] mb-1.5">6-digit code</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" className={inputCls} />
          </div>
          {needsPassword && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#1B2522] mb-1.5">New password</label>
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1B2522] mb-1.5">Confirm password</label>
                <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
              </div>
            </>
          )}
          {errors.length > 0 && (
            <ul role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 space-y-1">
              {errors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-60">
            {loading ? "Checking…" : kind === "register" ? "Create account" : "Update password"}
          </button>
        </form>
        <button onClick={onBack} className="w-full mt-3 py-2.5 text-xs text-[#3F6B5A] hover:text-[#1A4A36]">
          Back
        </button>
      </div>
    </div>
  )
}
