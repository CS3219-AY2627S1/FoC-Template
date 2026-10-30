// AI-assisted (Claude), reviewed and tested by Maliha
import type { Order } from "../App"
import StatusBadge from "../components/StatusBadge"
import { useOrder } from "../hooks/useOrder"

interface Props {
  initialOrder: Order
  onDelivered: (order: Order) => void
  onBack: () => void
}

// delivered is the last step, there's no separate requester confirm
const STEPS = ["Accepted", "Picked Up", "Delivered"] as const

function stepIndex(status: Order["status"]): number {
  if (status === "picked-up") return 1
  if (status === "delivered") return 2
  return 0
}

export default function AcceptedOrderPage({ initialOrder, onDelivered, onBack }: Props) {
  const { order, actionError, busy, run } = useOrder(initialOrder)

  const current = stepIndex(order.status)

  const deliver = async () => {
    const updated = await run("deliver")
    if (updated) onDelivered(updated)
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
        Back to Orders
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[#162A46]">Active Errand</h1>
        <StatusBadge status={order.status} />
      </div>

      {/* Progress tracker */}
      <div className="bg-white border border-[#E4E8E6] rounded-xl p-6 mb-4">
        <div className="flex items-start">
          {STEPS.map((step, i) => (
            <div key={step} className={`flex items-start ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors ${
                    i < current
                      ? "bg-[#1A4A36] text-white"
                      : i === current
                      ? "bg-[#1A4A36] text-white ring-4 ring-[#E8F1ED]"
                      : "bg-[#F7F9F8] border border-[#E4E8E6] text-[#9CA3AF]"
                  }`}
                >
                  {i < current ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <p
                  className={`text-[10px] mt-2 font-medium text-center whitespace-nowrap ${
                    i <= current ? "text-[#1A4A36]" : "text-[#9CA3AF]"
                  }`}
                >
                  {step}
                </p>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mt-4 mx-2 transition-colors ${
                    i < current ? "bg-[#1A4A36]" : "bg-[#E4E8E6]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Order info */}
      <div className="bg-white border border-[#E4E8E6] rounded-xl p-5 mb-4">
        <h3 className="text-xs font-semibold text-[#162A46] uppercase tracking-wider mb-4">Errand info</h3>
        <div className="space-y-2.5">
          {[
            { label: "Requester",      value: order.requesterName },
            { label: "Pickup",         value: `${order.pickupStore} · ${order.pickupLocation}` },
            { label: "Deliver to",     value: order.deliveryLocation },
            { label: "Instructions",   value: order.description },
            { label: "Credits to earn",value: `${order.credits} credits` },
            { label: "Deadline",       value: order.deadline },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-4">
              <span className="text-xs text-[#3F6B5A] w-28 flex-shrink-0 pt-0.5">{label}</span>
              <span className="text-xs text-[#1B2522] flex-1 font-medium leading-relaxed">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-center text-xs text-red-600">{actionError}</p>
      )}

      {/* Contextual action */}
      {order.status === "accepted" && (
        <button
          onClick={() => run("pickup")}
          disabled={busy}
          className="w-full py-3 bg-[#1A4A36] text-white text-sm font-medium rounded-xl hover:bg-[#163D2C] disabled:opacity-50 transition-colors"
        >
          Mark as Picked Up
        </button>
      )}
      {order.status === "picked-up" && (
        <div className="space-y-3">
          <div className="bg-[#E8F1ED] border border-[#1A4A36]/10 rounded-lg px-4 py-3 text-xs text-[#1A4A36] font-medium text-center">
            Item has been picked up. Head to {order.deliveryLocation}.
          </div>
          <button
            onClick={deliver}
            disabled={busy}
            className="w-full py-3 bg-[#1A4A36] text-white text-sm font-medium rounded-xl hover:bg-[#163D2C] disabled:opacity-50 transition-colors"
          >
            Mark as Delivered
          </button>
        </div>
      )}
      {order.status === "delivered" && (
        <div className="bg-[#E8F1ED] border border-[#1A4A36]/10 rounded-xl px-5 py-4 text-center">
          <p className="text-sm font-semibold text-[#1A4A36] mb-0.5">Errand completed</p>
          <p className="text-xs text-[#3F6B5A]">+{order.credits} credits added to your balance</p>
        </div>
      )}
    </div>
  )
}