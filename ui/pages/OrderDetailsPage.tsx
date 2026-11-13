// AI-assisted (Claude Opus 5.5), 2026-11-12: progress row follows status, full details, pickup place name; see ui/ai-usage/usage-log.md, entry 002
// AI-assisted (Claude Opus 5.5), 2026-11-12: pass order status to the chat; see ui/ai-usage/usage-log.md, entry 003
// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: UI order editing, credit-history details, confirmation wrapping, and regression checks.
// Human review pending. Exact prompts and verification: ui/ai-usage/ui-order-fix.md.
// ChatGPT (Codex), 2026-11-03: Single-order retrieval with approved visibility rules; review pending; see order-service/usage-log.md.
// ChatGPT (Codex), 2026-11-02: Mirror backend requester exclusion for courier actions; review pending; see ../../order-service/usage-log.md.
// AI-assisted (Claude), reviewed and tested by Maliha
import { useRef, useState } from "react"
import type { Order } from "../App"
import ChatPanel from "../components/ChatPanel"
import { editOrder, getOrder, newRequestKey, isValidOrderDeadline, orderError, type OrderPatch } from "../api/orders"
import StatusBadge from "../components/StatusBadge"
import { useOrder } from "../hooks/useOrder"
import { mapsLink, usePickupPlace } from "../hooks/usePickupPlace"

// how far along the errand is, for the Pickup → Deliver → Complete row
const JOURNEY = ["Pickup", "Deliver", "Complete"] as const
function journeyStep(status: Order["status"]) {
  if (status === "picked-up") return 1
  if (status === "delivered") return 2
  return 0
}

interface Props {
  initialOrder: Order
  currentUserId: string
  onBack: () => void
  onAccepted: (order: Order) => void
  onDelivered: (order: Order) => void
}

export default function OrderDetailsPage({ initialOrder, currentUserId, onBack, onAccepted, onDelivered }: Props) {
  const { order, setOrder, actionError, busy, loadError, run } = useOrder(initialOrder)
  const [showAcceptModal, setShowAcceptModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)


  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editMessage, setEditMessage] = useState("")
  const [draft, setDraft] = useState({ requestDetails: "", credits: 1, expiryTime: "" })
  const retry = useRef<{ payload: string; key: string } | null>(null)
  const startEdit = () => {
    const date = new Date(order.expiryTime ?? "")
    const local = Number.isFinite(+date)
      ? new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""
    setDraft({ requestDetails: order.description, credits: order.credits, expiryTime: local })
    setEditMessage("")
    setEditing(true)
  }
  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || busy) return
    const timestamp = new Date(draft.expiryTime).getTime()
    if (!draft.requestDetails.trim() || !Number.isInteger(draft.credits) || draft.credits < 1
      || !isValidOrderDeadline(timestamp, Date.now())) {
      setEditMessage("Enter instructions, a positive whole credit amount, and a deadline at least one hour from now.")
      return
    }
    const patch: OrderPatch = { ...draft, expiryTime: new Date(timestamp).toISOString() }
    const payload = JSON.stringify(patch)
    if (retry.current?.payload !== payload) retry.current = { payload, key: newRequestKey() }
    setSaving(true)
    setEditMessage("")
    try {
      const result = await editOrder(order.id, patch, retry.current.key)
      if (result.pending) {
        setEditMessage("Your edit is pending credit confirmation. Retry these same details to check it, or reopen the order later.")
      } else {
        setOrder(await getOrder(order.id))
        setEditing(false)
        setEditMessage("Order updated.")
        retry.current = null
      }
    } catch (error) {
      setEditMessage(orderError(error))
    } finally {
      setSaving(false)
    }
  }

  const pickupPlace = usePickupPlace(order)
  const pickupMap = mapsLink(order.pickupLocation)
  const step = journeyStep(order.status)
  const ended = order.status === "cancelled" || order.status === "expired"

  const isRequester = order.requesterId === currentUserId
  const isCourier   = !isRequester && order.courierId === currentUserId
  const isOpen      = order.status === "open"
  const canAccept   = !isRequester && !isCourier && isOpen

  const accept = async () => {
    setShowAcceptModal(false)
    const updated = await run("accept")
    if (updated) onAccepted(updated)
  }

  const deliver = async () => {
    if (!isCourier || order.status !== "picked-up") return
    const updated = await run("deliver")
    if (updated) onDelivered(updated)
  }

  const pickup = async () => {
    if (!isCourier || order.status !== "accepted") return
    await run("pickup")
  }

  const cancel = async () => {
    setShowCancelModal(false)
    if (await run("cancel")) onBack()
  }

  if (loadError) return (
    <div className="mx-auto max-w-lg p-6">
      <p role="alert">{loadError}</p>
      <button onClick={onBack}>Back to Orders</button>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-lg px-3 py-5 sm:px-6 sm:py-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-[#3F6B5A] hover:text-[#1A4A36] mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[#162A46]">Errand Details</h1>
        <StatusBadge status={order.status} />
      </div>

      {/* Journey card */}
      <div className="bg-white border border-[#E4E8E6] rounded-xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="text-center min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-[#E8F1ED] flex items-center justify-center mx-auto mb-1.5">
              <svg className="w-4.5 h-4.5 text-[#1A4A36]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            </div>
            <p className="text-[10px] font-semibold text-[#3F6B5A] uppercase tracking-wider mb-0.5">Pickup</p>
            <p className="text-sm font-semibold text-[#162A46] break-words">{order.pickupStore}</p>
            {pickupPlace && <p className="text-xs text-[#3F6B5A] break-words">{pickupPlace}</p>}
            {pickupMap && (
              <a href={pickupMap} target="_blank" rel="noreferrer" className="text-[11px] text-[#1A4A36] underline">Open in Maps</a>
            )}
          </div>

          <div className="flex items-center gap-1 px-1 flex-shrink-0 pb-4">
            <div className="w-10 h-px bg-[#E4E8E6]" />
            <svg className="w-4 h-4 text-[#3F6B5A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <div className="w-10 h-px bg-[#E4E8E6]" />
          </div>

          <div className="text-center min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-[#162A46]/8 flex items-center justify-center mx-auto mb-1.5">
              <svg className="w-4.5 h-4.5 text-[#162A46]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <p className="text-[10px] font-semibold text-[#3F6B5A] uppercase tracking-wider mb-0.5">Deliver</p>
            <p className="text-sm font-semibold text-[#162A46] break-words">{order.deliveryLocation}</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-[#9CA3AF] border-t border-[#E4E8E6] pt-4 mb-4">
          {ended ? (
            <span>This errand was {order.status}.</span>
          ) : JOURNEY.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={i <= step ? "text-[#1A4A36] font-medium" : ""}>
                {i < step || order.status === "delivered" ? "✓ " : ""}{s}
              </span>
              {i < JOURNEY.length - 1 && <span className="text-[#E4E8E6]">→</span>}
            </span>
          ))}
        </div>

        <div className="space-y-2.5">
          {[
            { label: "Instructions",   value: order.description },
            { label: "Deliver by",     value: order.deadline },
            { label: "Credits",        value: `${order.credits} credits` },
            { label: "Posted",         value: order.createdAt },
            { label: "Courier",        value: order.courierName ?? "Not accepted yet" },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-4">
              <span className="text-xs text-[#3F6B5A] w-24 flex-shrink-0 pt-0.5">{label}</span>
              <span className="text-xs text-[#1B2522] min-w-0 flex-1 font-medium whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {editMessage && <p role="status" className="mb-4 text-sm text-[#3F6B5A]">{editMessage}</p>}
      {isRequester && isOpen && (
        editing ? <form onSubmit={saveEdit} className="bg-white border border-[#E4E8E6] rounded-xl p-5 mb-4 space-y-3">
          <h2 className="font-semibold text-[#162A46]">Edit order</h2>
          <label className="block text-sm">Instructions
            <textarea required value={draft.requestDetails} disabled={saving}
              onChange={e => setDraft({ ...draft, requestDetails: e.target.value })}
              className="block w-full border rounded p-2 mt-1" />
          </label>
          <label className="block text-sm">Credits offered
            <input type="number" required min="1" max="2147483647" step="1" value={draft.credits} disabled={saving}
              onChange={e => setDraft({ ...draft, credits: Number(e.target.value) })}
              className="block w-full border rounded p-2 mt-1" />
          </label>
          <label className="block text-sm">Deadline
            <input type="datetime-local" required value={draft.expiryTime} disabled={saving}
              onChange={e => setDraft({ ...draft, expiryTime: e.target.value })}
              className="block w-full border rounded p-2 mt-1" />
          </label>
          <p className="text-xs text-[#3F6B5A]">The deadline must be at least one hour from now. Credit changes update your reservation.</p>
          <div className="flex gap-3">
            <button type="submit" disabled={saving || busy} className="rounded-lg bg-[#1A4A36] text-white px-4 py-2 disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className="px-4 py-2">Close editor</button>
          </div>
        </form> : <button onClick={startEdit} disabled={busy || saving} className="w-full mb-4 py-2.5 border border-[#E4E8E6] rounded-lg text-sm font-medium">Edit order</button>
      )}

      {/* Requester */}
      <div className="bg-white border border-[#E4E8E6] rounded-xl p-4 mb-5">
        <p className="text-xs text-[#3F6B5A] mb-3 font-medium">Requested by</p>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#162A46] text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
            {order.requesterName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#162A46]">{order.requesterName}</p>
            <p className="text-xs text-[#3F6B5A]">NUS Student</p>
          </div>
        </div>
      </div>

      {/* State banners */}
      {isRequester && isOpen && (
        <div className="bg-[#F7F9F8] border border-[#E4E8E6] rounded-lg px-4 py-3 mb-4 text-center">
          <p className="text-xs text-[#3F6B5A]">This is your request — you cannot accept it.</p>
        </div>
      )}
      {!isOpen && !isRequester && !isCourier && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 mb-4 text-center">
          <p className="text-xs text-amber-700 font-medium">This request is no longer open.</p>
        </div>
      )}
      {isCourier && order.status === "accepted" && (
        <div className="bg-[#E8F1ED] border border-[#1A4A36]/10 rounded-lg px-4 py-3 mb-4 text-center">
          <p className="text-xs text-[#1A4A36] font-medium">You are the courier — head to {order.pickupStore}{pickupPlace ? ` (${pickupPlace})` : ""} to pick up.</p>
        </div>
      )}
      {isCourier && order.status === "picked-up" && (
        <div className="bg-[#E8F1ED] border border-[#1A4A36]/10 rounded-lg px-4 py-3 mb-4 text-center">
          <p className="text-xs text-[#1A4A36] font-medium">Item picked up — deliver to {order.deliveryLocation}.</p>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-center text-xs text-red-600">{actionError}</p>
      )}

      {/* Chat between the two people on the errand, once a courier has it */}
      {(isRequester || isCourier) && order.courierId && <ChatPanel orderId={order.id} status={order.status} />}

      {/* ── ACTION AREA ── */}

      {/* Stranger viewing an open request → Accept */}
      {canAccept && (
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-2.5 border border-[#E4E8E6] bg-white text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => setShowAcceptModal(true)}
            disabled={busy || saving || editing}
            className="flex-1 py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-50 transition-colors"
          >
            Accept Request
          </button>
        </div>
      )}

      {/* Courier actions */}
      {isCourier && (
        <div className="space-y-3">
          {order.status === "accepted" && (
            <button
              onClick={pickup}
              disabled={busy || saving || editing}
              className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-50 transition-colors"
            >
              Mark as Picked Up
            </button>
          )}
          {order.status === "picked-up" && (
            <button
              onClick={deliver}
              disabled={busy || saving || editing}
              className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-50 transition-colors"
            >
              Mark as Delivered
            </button>
          )}
          <button
            onClick={onBack}
            className="w-full py-2.5 border border-[#E4E8E6] bg-white text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {/* Requester actions */}
      {isRequester && (
        <div className="space-y-3">
          {/* Open: cancel */}
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="flex-1 py-2.5 border border-[#E4E8E6] bg-white text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
            >
              Back
            </button>
            {isOpen && (
              <button
                onClick={() => setShowCancelModal(true)}
                disabled={busy || saving || editing}
                className="flex-1 py-2.5 border border-red-100 text-red-500 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Cancel Request
              </button>
            )}
          </div>
        </div>
      )}

      {/* Back only for non-open, non-participant */}
      {!canAccept && !isCourier && !isRequester && (
        <button
          onClick={onBack}
          className="w-full py-2.5 border border-[#E4E8E6] bg-white text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
        >
          Back
        </button>
      )}

      {/* Accept modal */}
      {showAcceptModal && (
        <div
          className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setShowAcceptModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#162A46] mb-2">Accept this errand?</h3>
            <p className="text-sm text-[#3F6B5A] mb-5 leading-relaxed">
              {"You'll be responsible for collecting and delivering this request on time."}
            </p>
            <div className="bg-[#F7F9F8] border border-[#E4E8E6] rounded-lg px-4 py-3 mb-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#3F6B5A]">{order.pickupStore} → {order.deliveryLocation}</span>
                <span className="font-semibold text-[#1A4A36]">{order.credits} credits</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAcceptModal(false)}
                className="flex-1 py-2.5 border border-[#E4E8E6] text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={accept}
                className="flex-1 py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] transition-colors"
              >
                Accept Errand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setShowCancelModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#162A46] mb-2">Cancel this request?</h3>
            <p className="text-sm text-[#3F6B5A] mb-6 leading-relaxed">
              Your reserved credits will be returned to your balance.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 border border-[#E4E8E6] text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={cancel}
                className="flex-1 py-2.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
              >
                Cancel Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
