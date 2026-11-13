"use client"

import { CalendarIcon } from "lucide-react"

export function AdminOrderDateRange({ fromDate = "", toDate = "", onChange }: {
  fromDate?: string
  toDate?: string
  onChange: (fromDate: string, toDate: string) => void
}) {
  function picker(value: string, label: string, change: (value: string) => void) {
    return <label className="relative flex h-7 w-32 items-center justify-between gap-2 rounded-md border bg-background px-2 text-sm focus-within:ring-2 focus-within:ring-ring sm:w-36" title={label}>
      <span className={value ? undefined : "text-muted-foreground"}>{value ? value.split("-").reverse().join("/") : "DD/MM/YYYY"}</span>
      <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input type="date" aria-label={label} title={label} value={value} onChange={(event) => change(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full" />
    </label>
  }
  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Order creation date range" title="Filter by order creation date">
    {picker(fromDate, "Orders created on or after", (value) => onChange(value, toDate))}
    <span className="text-sm text-muted-foreground">to</span>
    {picker(toDate, "Orders created on or before", (value) => onChange(fromDate, value))}
  </div>
}
