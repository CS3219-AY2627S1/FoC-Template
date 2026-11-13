"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"))
const minutes = ["00", "15", "30", "45"]

type QuarterHourDateTimePickerProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  required?: boolean
  disabled?: boolean
  describedBy?: string
  invalid?: boolean
}

export function QuarterHourDateTimePicker({
  id, label, value, onChange, min, required, disabled, describedBy, invalid,
}: QuarterHourDateTimePickerProps) {
  const [date = "", time = "00:00"] = value.split("T")
  const [hour = "00", minute = "00"] = time.split(":")

  function changeTime(nextHour: string, nextMinute: string) {
    if (date) onChange(date + "T" + nextHour + ":" + nextMinute)
  }

  return (
    <div className="min-w-0 space-y-1 text-sm" role="group" aria-labelledby={id + "-label"} aria-describedby={describedBy}>
      <Label id={id + "-label"} htmlFor={id + "-date"}>{label}</Label>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_5rem]">
        <Input id={id + "-date"} type="date" aria-label={label + " date"} aria-describedby={describedBy} aria-invalid={invalid}
          required={required} disabled={disabled} min={min?.slice(0, 10)} className="col-span-2 h-9 sm:col-span-1"
          value={date} onChange={(event) => onChange(event.target.value ? event.target.value + "T" + hour + ":" + minute : "")} />
        <Select value={hour} disabled={disabled} required={required} onValueChange={(next) => changeTime(String(next ?? "00"), minute)}>
          <SelectTrigger aria-label={label + " hour"} aria-invalid={invalid} aria-describedby={describedBy} className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{hours.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={minute} disabled={disabled} required={required} onValueChange={(next) => changeTime(hour, String(next ?? "00"))}>
          <SelectTrigger aria-label={label + " minutes"} aria-invalid={invalid} aria-describedby={describedBy} className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{minutes.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  )
}
