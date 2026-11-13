"use client"

import { useId } from "react"

import { Label } from "@/components/ui/label"
import { StatusSelect } from "./status-select"
import { formatOrderStatus, type OrderMode, type OrderStatus } from "@/lib/orders"

const ALL_STATUSES = "all"
const STATUSES: Record<OrderMode, OrderStatus[]> = {
  requester: [
    "OPEN", "ACCEPTED", "IN_PROGRESS", "PICKED_UP", "DELIVERED",
    "COMPLETED", "CANCELLED", "EXPIRED",
  ],
  courier: [
    "ACCEPTED", "IN_PROGRESS", "PICKED_UP", "DELIVERED", "COMPLETED", "ABORTED",
  ],
}

export function OrderStatusFilter({ mode, value, label, onChange }: {
  mode: OrderMode
  value: OrderStatus | null
  label: string
  onChange: (status: OrderStatus | null) => void
}) {
  const id = useId()
  const items = { [ALL_STATUSES]: "All statuses", ...Object.fromEntries(STATUSES[mode].map((status) => [status, formatOrderStatus(status)])) }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={id}>Status</Label>
      <StatusSelect id={id} aria-label={label} className="min-w-40" value={value ?? ALL_STATUSES}
        onChange={event => onChange(event.target.value === ALL_STATUSES ? null : event.target.value as OrderStatus)}>
        {Object.entries(items).map(([status, text]) => <option key={status} value={status}>{text}</option>)}
      </StatusSelect>
    </div>
  )
}
