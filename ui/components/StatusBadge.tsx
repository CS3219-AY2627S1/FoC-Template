type Status = "open" | "accepted" | "picked-up" | "delivered" | "cancelled" | "expired"

const CONFIG: Record<Status, { label: string; cls: string }> = {
  open:        { label: "OPEN",       cls: "bg-[#E8F1ED] text-[#1A4A36]" },
  accepted:    { label: "ACCEPTED",   cls: "bg-blue-50 text-blue-700" },
  "picked-up": { label: "PICKED UP",  cls: "bg-amber-50 text-amber-700" },
  delivered:   { label: "DELIVERED",  cls: "bg-purple-50 text-purple-700" },
  cancelled:   { label: "CANCELLED",  cls: "bg-gray-100 text-gray-500" },
  expired:     { label: "EXPIRED",    cls: "bg-red-50 text-red-600" },
}

export default function StatusBadge({ status }: { status: Status }) {
  const { label, cls } = CONFIG[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider whitespace-nowrap ${cls}`}>
      {label}
    </span>
  )
}