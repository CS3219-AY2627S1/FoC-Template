// AI-assisted (Claude), reviewed and tested by Maliha
import { useState } from "react"
import type { Order } from "../App"
import StatusBadge from "../components/StatusBadge"
import { useOrder } from "../hooks/useOrder"

interface Props {
  initialOrder: Order
  currentUserId: string
  onBack: () => void
  onAccepted: (order: Order) => void
  onDelivered: (order: Order) => void
}

export default function OrderDetailsPage({ initialOrder, currentUserId, onBack, onAccepted, onDelivered }: Props) {
  const { order, actionError, busy, run } = useOrder(initialOrder)
  const [showAcceptModal, setShowAcceptModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)

  const isRequester = order.requesterId === currentUserId
  const isCourier   = order.courierId   === currentUserId
  const isOpen      = order.status === "open"
  const canAccept   = !isRequester && !isCourier && isOpen

  const accept = async () => {
    setShowAcceptModal(false)
    const updated = await run("accept")
    if (updated) onAccepted(updated)
  }

  const deliver = async () => {
    const updated = await run("deliver")
    if (updated) onDelivered(updated)
  }

  const cancel = async () => {
    setShowCancelModal(false)
    if (await run("cancel")) onBack()
  }

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
            <p className="text-sm font-semibold text-[#162A46] truncate">{order.pickupLocation}</p>
            <p className="text-xs text-[#3F6B5A] truncate">{order.pickupStore}</p>
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
            <p className="text-sm font-semibold text-[#162A46] truncate">{order.deliveryLocation}</p>
            <p className="text-xs text-[#3F6B5A]">&nbsp;</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-[#9CA3AF] border-t border-[#E4E8E6] pt-4 mb-4">
          {["Pickup", "Deliver", "Complete"].map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={i === 0 ? "text-[#1A4A36] font-medium" : ""}>{s}</span>
              {i < 2 && <span className="text-[#E4E8E6]">→</span>}
            </span>
          ))}
        </div>

        <div className="space-y-2.5">
          {[
            { label: "Instructions",   value: order.description },
            { label: "Deadline",       value: order.deadline },
            { label: "Credits",        value: `${order.credits} credits` },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-4">
              <span className="text-xs text-[#3F6B5A] w-24 flex-shrink-0 pt-0.5">{label}</span>
              <span className="text-xs text-[#1B2522] flex-1 font-medium">{value}</span>
            </div>
          ))}
        </div>
      </div>

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
          <p className="text-xs text-[#1A4A36] font-medium">You are the courier — head to {order.pickupLocation} to pick up.</p>
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
            disabled={busy}
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
              onClick={() => run("pickup")}
              disabled={busy}
              className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-50 transition-colors"
            >
              Mark as Picked Up
            </button>
          )}
          {order.status === "picked-up" && (
            <button
              onClick={deliver}
              disabled={busy}
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
                disabled={busy}
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