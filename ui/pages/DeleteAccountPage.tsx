// AI-assisted (Claude Opus 5.5), 2026-11-12: deleteMe now returns the message; see ui/ai-usage/usage-log.md, entry 004
import { useState } from "react"
import { deleteMe } from "../api/users"

interface Props {
  email: string
  onDeleted: (message: string) => void
  onBack: () => void
}

export default function DeleteAccountPage({ email, onDeleted, onBack }: Props) {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setError("")
    setLoading(true)
    try {
      const message = await deleteMe()
      localStorage.removeItem("token")
      onDeleted(message)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the account.")
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold text-[#162A46] mb-2">Delete account</h1>
      <p className="text-sm text-[#3F6B5A] mb-5 leading-relaxed">
        This deletes {email}. Re-registering with the same email within 4 years restores the previous credit balance, not the rest of the account.
      </p>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-2.5 border border-[#E4E8E6] rounded-lg text-sm">Cancel</button>
        <button onClick={handleDelete} disabled={loading} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm disabled:opacity-60">
          {loading ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </div>
  )
}
