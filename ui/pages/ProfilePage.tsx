// AI-assisted (Claude), reviewed and tested by Maliha
// AI-assisted (Claude Opus 5.5), 2026-11-12: show account role next to the name; see ui/ai-usage/usage-log.md, entry 002
// AI-assisted (Claude Opus 5.5), 2026-11-12: merge with main, one delete-account button; see ui/ai-usage/usage-log.md, entry 004
// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: UI order editing, credit-history details, confirmation wrapping, and regression checks.
// Human review pending. Exact prompts and verification: ui/ai-usage/ui-order-fix.md.
import { useEffect, useState } from "react"
import type { User, Order, Page } from "../App"
import { deleteError, deleteMe } from "../api/users"
import { formatTime, listOrders } from "../api/orders"
import { creditChange, creditDescription, loadVisibleCreditHistory, type CreditEntry } from "../api/credits"
import { updateMe, type ApiUser } from "../api/users"

interface Props {
  user: User
  onNavigate: (page: Page) => void
  onLogout: () => void
  onUpdated: (user: ApiUser) => void
  onResetPassword: () => Promise<void>
}

export default function ProfilePage({ user, onNavigate, onLogout, onUpdated, onResetPassword }: Props) {
  const [resetError, setResetError] = useState("")
  const [resetting, setResetting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editMessage, setEditMessage] = useState("")
  const [draft, setDraft] = useState({ firstName: "", lastName: "", username: "" })
  const [myRequests, setMyRequests]     = useState<Order[]>([])
  const [myDeliveries, setMyDeliveries] = useState<Order[]>([])
  const [history, setHistory]           = useState<CreditEntry[] | null>(null)

  // delete account: confirm -> (error | done message) -> logged out
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [deleteMsg, setDeleteMsg]         = useState("")
  const [deletedMsg, setDeletedMsg]       = useState("")

  const closeDelete = () => {
    setConfirmDelete(false)
    setDeleteMsg("")
  }

  const deleteAccount = async () => {
    setDeleting(true)
    setDeleteMsg("")
    try {
      setDeletedMsg(await deleteMe())
      setConfirmDelete(false)
    } catch (err) {
      setDeleteMsg(deleteError(err))
    } finally {
      setDeleting(false)
    }
  }

  // stats just stay at 0 if order-service isn't up
  useEffect(() => {
    listOrders("requested").then(setMyRequests).catch(() => {})
    listOrders("assigned").then(setMyDeliveries).catch(() => {})
    loadVisibleCreditHistory(10).then(setHistory).catch(() => setHistory(null))
  }, [])

  const delivered = myDeliveries.filter((o) => o.status === "delivered")
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)
  const inputCls = "block w-full border border-[#E4E8E6] rounded-lg px-3 py-2 mt-1 text-sm text-[#1B2522] focus:outline-none focus:border-[#1A4A36]"

  const startEdit = () => {
    setDraft({ firstName: user.firstName, lastName: user.lastName, username: user.username })
    setEditMessage("")
    setEditing(true)
  }

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    const profile = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      username: draft.username.trim(),
    }
    if (!profile.firstName || !profile.lastName || !profile.username) {
      setEditMessage("Enter a first name, last name, and username.")
      return
    }
    setSaving(true)
    setEditMessage("")
    try {
      onUpdated(await updateMe(profile))
      setEditing(false)
      setEditMessage("Profile updated.")
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : "Could not update your profile.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#162A46]">My Profile</h1>
      </div>

      {/* Profile card */}
      <div className="relative bg-white border border-[#E4E8E6] rounded-xl p-6 mb-4">
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit profile"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-[#E4E8E6] text-[#3F6B5A] hover:bg-[#F7F9F8] hover:text-[#1A4A36] flex items-center justify-center"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.862 4.487" />
            </svg>
          </button>
        )}
        <div className="flex items-start gap-4 pr-10">
          <div className="w-14 h-14 rounded-full bg-[#162A46] text-white text-lg font-semibold flex items-center justify-center flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <h2 className="text-base font-semibold text-[#162A46]">{user.name}</h2>
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                user.isAdmin ? "bg-[#162A46] text-white" : "bg-[#E8F1ED] text-[#1A4A36]"
              }`}>
                {user.isAdmin ? "Administrator" : "User"}
              </span>
            </div>
            <p className="text-sm text-[#3F6B5A] truncate">@{user.username}</p>
            <p className="text-sm text-[#3F6B5A] mb-3 truncate">{user.email}</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-[#162A46]/75 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                {user.totalCredits ?? "–"} Total
              </div>
              <div className="flex items-center gap-1.5 bg-[#E8F1ED] text-[#1A4A36] text-xs font-semibold px-3 py-1.5 rounded-full">
                {user.credits ?? "–"} Available
              </div>
              <div className="flex items-center gap-1.5 bg-[#F7F9F8] border border-[#E4E8E6] text-[#3F6B5A] text-xs font-semibold px-3 py-1.5 rounded-full">
                {user.reservedCredits ?? "–"} Reserved
              </div>
              <span className="text-xs text-[#9CA3AF]">Member since {user.memberSince}</span>
            </div>
          </div>
        </div>
        {editMessage && <p role="status" className={`mt-4 text-sm ${editing ? "text-red-600" : "text-[#3F6B5A]"}`}>{editMessage}</p>}
        {editing ? (
          <form onSubmit={saveProfile} className="mt-4 space-y-3 border-t border-[#E4E8E6] pt-4">
            <label className="block text-sm text-[#1B2522]">First name
              <input required value={draft.firstName} disabled={saving} onChange={e => setDraft({ ...draft, firstName: e.target.value })} className={inputCls} />
            </label>
            <label className="block text-sm text-[#1B2522]">Last name
              <input required value={draft.lastName} disabled={saving} onChange={e => setDraft({ ...draft, lastName: e.target.value })} className={inputCls} />
            </label>
            <label className="block text-sm text-[#1B2522]">Username
              <input required value={draft.username} disabled={saving} onChange={e => setDraft({ ...draft, username: e.target.value })} className={inputCls} />
            </label>
            <p className="text-xs text-[#3F6B5A]">Email stays {user.email}.</p>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="rounded-lg bg-[#1A4A36] text-white px-4 py-2 text-sm disabled:opacity-50">{saving ? "Saving…" : "Save profile"}</button>
              <button type="button" disabled={saving} onClick={() => { setEditing(false); setEditMessage("") }} className="px-4 py-2 text-sm text-[#3F6B5A]">Cancel</button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Requests created",  value: myRequests.length },
          { label: "Errands completed", value: delivered.length },
          { label: "Credits earned",    value: delivered.reduce((sum, o) => sum + o.credits, 0) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-[#E4E8E6] rounded-xl p-4 text-center">
            <p className="text-xl font-semibold text-[#162A46]">{value}</p>
            <p className="text-xs text-[#3F6B5A] mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent requests */}
      <div className="bg-white border border-[#E4E8E6] rounded-xl mb-3 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E4E8E6]">
          <h3 className="text-sm font-semibold text-[#162A46]">Recent Requests</h3>
        </div>
        {myRequests.length === 0 ? (
          <p className="text-xs text-[#3F6B5A] text-center py-6">No requests yet</p>
        ) : (
          myRequests.slice(0, 3).map((order, i) => (
            <div
              key={order.id}
              className={`flex items-center justify-between px-5 py-3 ${i < Math.min(myRequests.length, 3) - 1 ? "border-b border-[#E4E8E6]" : ""}`}
            >
              <div className="min-w-0">
                <p className="text-sm text-[#1B2522] font-medium truncate">
                  {order.pickupStore} → {order.deliveryLocation}
                </p>
                <p className="text-xs text-[#3F6B5A]">By {order.deadline}</p>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded ml-3 flex-shrink-0 uppercase tracking-wider ${
                  order.status === "delivered"
                    ? "bg-[#E8F1ED] text-[#1A4A36]"
                    : order.status === "open"
                    ? "bg-[#E8F1ED] text-[#1A4A36]"
                    : "bg-blue-50 text-blue-700"
                }`}
              >
                {order.status}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Recent deliveries */}
      <div className="bg-white border border-[#E4E8E6] rounded-xl mb-3 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E4E8E6]">
          <h3 className="text-sm font-semibold text-[#162A46]">Recent Deliveries</h3>
        </div>
        {myDeliveries.length === 0 ? (
          <p className="text-xs text-[#3F6B5A] text-center py-6">No deliveries yet</p>
        ) : (
          myDeliveries.slice(0, 3).map((order, i) => (
            <div
              key={order.id}
              className={`flex items-center justify-between px-5 py-3 ${i < Math.min(myDeliveries.length, 3) - 1 ? "border-b border-[#E4E8E6]" : ""}`}
            >
              <div className="min-w-0">
                <p className="text-sm text-[#1B2522] font-medium truncate">
                  {order.pickupStore} → {order.deliveryLocation}
                </p>
                <p className="text-xs text-[#3F6B5A]">By {order.deadline}</p>
              </div>
              <span className="text-sm font-semibold text-[#1A4A36] ml-3 flex-shrink-0">
                +{order.credits} cr
              </span>
            </div>
          ))
        )}
      </div>

      {/* Credit history */}
      <div className="bg-white border border-[#E4E8E6] rounded-xl mb-6 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E4E8E6]">
          <h3 className="text-sm font-semibold text-[#162A46]">Credit History</h3>
        </div>
        {!history || history.length === 0 ? (
          <p className="text-xs text-[#3F6B5A] text-center py-6">
            {history ? "No credit activity yet" : "Couldn't load credit history"}
          </p>
        ) : (
          history.map((entry, i) => {
            const change = creditChange(entry)
            const gained = change > 0
            return (
              <div
                key={entry.id}
                className={`flex items-center justify-between px-5 py-3 ${i < history.length - 1 ? "border-b border-[#E4E8E6]" : ""}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    gained ? "bg-[#E8F1ED]" : "bg-[#F7F9F8] border border-[#E4E8E6]"
                  }`}>
                    <span className={`text-[10px] font-bold ${gained ? "text-[#1A4A36]" : "text-[#3F6B5A]"}`}>
                      {gained ? "+" : "−"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-[#1B2522] break-words">{creditDescription(entry, [...myRequests, ...myDeliveries])}</p>
                    <p className="text-xs text-[#9CA3AF]">{formatTime(entry.createdAt)}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ml-4 flex-shrink-0 ${gained ? "text-[#1A4A36]" : "text-[#1B2522]"}`}>
                  {gained ? "+" : "−"}{Math.abs(change)}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Actions */}
      {resetError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{resetError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          disabled={resetting}
          onClick={() => {
            setResetError("")
            setResetting(true)
            onResetPassword().catch((err) => {
              setResetError(err instanceof Error ? err.message : "Could not send a code.")
              setResetting(false)
            })
          }}
          className="flex-1 py-2.5 border border-[#E4E8E6] bg-white text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] disabled:opacity-60"
        >
          {resetting ? "Sending code…" : "Reset password"}
        </button>
        <button
          onClick={onLogout}
          className="flex-1 py-2.5 border border-red-100 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
        >
          Log out
        </button>
      </div>

      <button
        onClick={() => setConfirmDelete(true)}
        className="w-full mt-6 py-2 text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
      >
        Delete account
      </button>

      {/* Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4" onClick={closeDelete}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#162A46] mb-2">Delete your account?</h3>
            <p className="text-sm text-[#3F6B5A] mb-5 leading-relaxed">
              You'll be logged out and your account will be closed. You can't do this while you still have
              requests or errands in progress.
            </p>
            {deleteMsg && (
              <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600">{deleteMsg}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={closeDelete}
                className="flex-1 py-2.5 border border-[#E4E8E6] text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
              >
                Keep account
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Done. user-service already ended the session, so OK just logs out here */}
      {deletedMsg && (
        <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <h3 className="text-base font-semibold text-[#162A46] mb-2">Account deleted</h3>
            <p className="text-sm text-[#3F6B5A] mb-5 leading-relaxed">{deletedMsg}</p>
            <button
              onClick={onLogout}
              className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}