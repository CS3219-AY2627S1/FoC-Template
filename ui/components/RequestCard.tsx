import type { Order } from "../App"
import StatusBadge from "../components/StatusBadge"

interface CardActions {
  onCancel?: () => void
  onMarkPickedUp?: () => void
  onMarkDelivered?: () => void
}

export default function RequestCard({ order, onClick, actions = {}, busy = false }: { order: Order; onClick: () => void; actions?: CardActions; busy?: boolean }) {
  const { onCancel, onMarkPickedUp, onMarkDelivered } = actions
  const hasDeliveryAction = onMarkPickedUp || onMarkDelivered

  const btn = (label: string, handler: () => void, variant: "green" | "red" | "outline" = "outline") => {
    const cls = {
      green:   "text-white bg-[#1A4A36] border border-[#1A4A36] hover:bg-[#163D2C]",
      red:     "text-red-500 border border-red-100 hover:bg-red-50 hover:text-red-600",
      outline: "text-[#1A4A36] border border-[#E4E8E6] hover:bg-[#E8F1ED]",
    }[variant]
    return (
      <button
        onClick={(e) => { e.stopPropagation(); handler() }}
        disabled={busy}
        className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 ${cls}`}
      >
        {label}
      </button>
    )
  }

  return (
    <article
      onClick={onClick}
      className="flex min-w-0 flex-col bg-white border border-[#E4E8E6] rounded-xl p-4 hover:border-[#3F6B5A] hover:shadow-sm transition-all cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-[#162A46] min-w-0">
          <span className="truncate">{order.pickupStore}</span>
          <svg className="w-3.5 h-3.5 text-[#3F6B5A] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          <span className="truncate">{order.deliveryLocation}</span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <p className="text-xs text-[#3F6B5A] mb-3 line-clamp-2">{order.description}</p>

      {/* Footer row */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-[#162A46] text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
              {order.requesterName.charAt(0)}
            </div>
            <span className="text-xs text-[#3F6B5A]">{order.requesterName.split(" ")[0]}</span>
          </div>
          <span className="text-xs text-[#9CA3AF]">by {order.deadline}</span>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <span className="text-sm font-semibold text-[#1A4A36]">{order.credits} cr</span>

          {/* Delivery actions (my-deliveries tab) */}
          {onMarkPickedUp && btn("Mark Picked Up", onMarkPickedUp, "green")}
          {onMarkDelivered && btn("Mark Delivered", onMarkDelivered, "green")}

          {/* Default: view details when no primary action */}
          {!hasDeliveryAction && (
            <span className="text-xs font-medium text-[#1A4A36] border border-[#E4E8E6] px-2.5 py-1 rounded-md hover:bg-[#E8F1ED] transition-colors">
              View Details
            </span>
          )}

          {/* Cancel (my-requests, still open) */}
          {onCancel && btn("Cancel", onCancel, "red")}
        </div>
      </div>
    </article>
  )
}