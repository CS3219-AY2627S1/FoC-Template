// AI-assisted (Claude), reviewed and tested by Maliha
import { useEffect, useState } from "react"
import { getFlags, reviewFlag, type Flag } from "../../api/chat"
import { TableMessage, tdCls, thCls } from "./table"

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

// Chat messages caught by chat-service's content filter (F10.5)
export default function FlagsSection() {
  const [flags, setFlags]       = useState<Flag[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState("")
  const [showReviewed, setShowReviewed] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError("")
    getFlags(showReviewed)
      .then(setFlags)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load flagged messages."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [showReviewed])

  const markReviewed = (id: string) => {
    setSavingId(id)
    reviewFlag(id)
      .then(load)
      // 404 = someone else already reviewed it, a reload shows that too
      .catch(load)
      .finally(() => setSavingId(null))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-[#162A46]">Flagged Chat Messages</h2>
        <label className="flex items-center gap-2 text-xs text-[#3F6B5A] cursor-pointer">
          <input
            type="checkbox"
            checked={showReviewed}
            onChange={(e) => setShowReviewed(e.target.checked)}
            className="accent-[#1A4A36]"
          />
          Show reviewed
        </label>
      </div>

      <div className="bg-white border border-[#E4E8E6] rounded-xl overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {["User", "Message", "Action", "Order", "When", ""].map((h) => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(loading || error || flags.length === 0) ? (
              <TableMessage
                colSpan={6}
                loading={loading}
                loadingText="Loading flagged messages…"
                error={error}
                onRetry={load}
                emptyText={showReviewed ? "Nothing has been flagged." : "No messages waiting for review."}
              />
            ) : flags.map((f, i) => (
              <tr key={f.id} className={i < flags.length - 1 ? "border-b border-[#E4E8E6]" : ""}>
                <td className={`${tdCls} font-medium whitespace-nowrap`}>{f.userName}</td>
                {/* original text, before masking, so admins can judge it */}
                <td className={`${tdCls} max-w-xs break-words`}>{f.originalText}</td>
                <td className={tdCls}>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    f.action === "blocked" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                  }`}>
                    {f.action}
                  </span>
                </td>
                <td className={`${tdCls} font-mono text-[11px] text-[#3F6B5A]`}>#{f.orderId.slice(0, 8)}</td>
                <td className={`${tdCls} text-[#9CA3AF] whitespace-nowrap`}>{when(f.flaggedAt)}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  {f.reviewedAt ? (
                    <span className="text-[#9CA3AF]">Reviewed</span>
                  ) : (
                    <button
                      onClick={() => markReviewed(f.id)}
                      disabled={savingId === f.id}
                      className="text-xs font-medium text-[#3F6B5A] hover:text-[#1A4A36] disabled:opacity-50"
                    >
                      Mark reviewed
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}