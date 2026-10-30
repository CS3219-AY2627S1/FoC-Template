// AI-assisted (Claude), reviewed and tested by Maliha
import { useEffect, useState } from "react"
import type { User, Page } from "../App"
import { CATEGORIES, categoryLabel, supplierLocation, type Category } from "../api/suppliers"
import { createOrder, orderError, type NewOrder } from "../api/orders"
import { useSuppliers } from "../hooks/useSuppliers"

const DELIVERY_LOCATIONS = [
  "PGP", "PGPR Block A", "PGPR Block B", "PGPR Block E",
  "UTown Residence", "KEVII Hall", "Kent Ridge Hall",
  "Raffles Hall", "Eusoff Hall", "Sheares Hall",
]

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const DELIVERY_TIMES = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4)
  const minute = (index % 4) * 15
  return {
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    label: `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`,
  }
})

interface Props {
  user: User
  onNavigate: (page: Page) => void
  onCreated: (pending: boolean) => void
}

const inputCls =
  "w-full px-3.5 py-2.5 border border-[#E4E8E6] rounded-lg text-sm text-[#1B2522] bg-white focus:outline-none focus:border-[#1A4A36] focus:ring-1 focus:ring-[#1A4A36] transition-colors placeholder-[#9CA3AF]"

export default function CreateRequestPage({ user, onNavigate, onCreated }: Props) {
  const [step, setStep] = useState(1)
  const [now, setNow] = useState(() => Date.now())
  const [deliveryDate, setDeliveryDate] = useState(() => localDateValue(new Date()))
  const [deliveryTime, setDeliveryTime] = useState("")
  const [deadlineError, setDeadlineError] = useState("")

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const deliveryDates = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + index)
    return {
      value: localDateValue(date),
      label: `${index === 0 ? "Today · " : ""}${date.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}`,
    }
  })
  const deadlineTimestamp = deliveryDate && deliveryTime
    ? new Date(`${deliveryDate}T${deliveryTime}:00`).getTime()
    : NaN
  const deadlineValid = Number.isFinite(deadlineTimestamp) && deadlineTimestamp > now
  const deadlineLabel = Number.isFinite(deadlineTimestamp)
    ? new Date(deadlineTimestamp).toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : ""
  const validateDeadline = () => {
    const currentTime = Date.now()
    setNow(currentTime)
    if (!Number.isFinite(deadlineTimestamp) || deadlineTimestamp <= currentTime) {
      setDeadlineError("Choose a delivery date and time later than right now.")
      return false
    }
    setDeadlineError("")
    return true
  }
  // order-service needs the real supplier id, so suppliers have to come from supplier-service
  const { suppliers, error: suppliersError, query, category, search, filter, retry } = useSuppliers()

  const [form, setForm] = useState({
    pickupLocation: "",
    supplierId: "",
    supplier: "",
    deliveryLocation: "",
    description: "",
    credits: 4,
  })

  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }))
  // if the balance didn't load, let order-service decide whether there are enough credits
  const creditsAfter = user.credits === null ? null : user.credits - form.credits
  const notEnough = creditsAfter !== null && creditsAfter < 0

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  // reuse the key if the exact same request is retried, so it can't get created twice
  const [lastAttempt, setLastAttempt] = useState<{ body: string; key: string } | null>(null)

  const handleSubmit = async () => {
    if (!validateDeadline()) { setStep(2); return }
    const order: NewOrder = {
      supplierId: form.supplierId,
      destination: form.deliveryLocation,
      requestDetails: form.description.trim(),
      credits: form.credits,
      expiryTime: new Date(deadlineTimestamp).toISOString(),
    }
    const body = JSON.stringify(order)
    const key = lastAttempt?.body === body ? lastAttempt.key : crypto.randomUUID()
    setLastAttempt({ body, key })

    setSubmitting(true)
    setSubmitError("")
    try {
      const { pending } = await createOrder(order, key)
      onCreated(pending)
    } catch (err) {
      setSubmitError(orderError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const step1Valid = !!form.pickupLocation && !!form.supplier
  const step2Valid = !!form.deliveryLocation && form.description.trim().length > 0 && deadlineValid

  return (
    <div className="mx-auto w-full max-w-lg px-3 py-5 sm:px-6 sm:py-8">
      {/* Back */}
      <button
        onClick={() => (step > 1 ? setStep(step - 1) : onNavigate("orders"))}
        className="flex items-center gap-1.5 text-sm text-[#3F6B5A] hover:text-[#1A4A36] mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {step > 1 ? "Back" : "Back to Orders"}
      </button>

      {/* Header */}
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-[#162A46] mb-0.5">Create a Request</h1>
        <p className="text-sm text-[#3F6B5A]">Step {step} of 3</p>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1 rounded-full flex-1 transition-colors duration-300 ${
              s <= step ? "bg-[#1A4A36]" : "bg-[#E4E8E6]"
            }`}
          />
        ))}
      </div>

      {/* Step 1 — Pickup */}
      {step === 1 && (
        <div className="space-y-5">
          <h2 className="text-base font-semibold text-[#162A46]">Pickup details</h2>
          <p className="text-sm text-[#3F6B5A]">Find a campus supplier or facility. Selecting one sets your pickup location.</p>
          <div>
            <label htmlFor="supplier-search" className="block text-xs font-medium text-[#1B2522] mb-1.5">Search suppliers</label>
            <input
              id="supplier-search"
              type="search"
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search by name or campus location…"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="supplier-category" className="block text-xs font-medium text-[#1B2522] mb-1.5">Category</label>
            <select id="supplier-category" value={category} onChange={(e) => filter(e.target.value as Category | "")} className={inputCls}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {form.supplier && (
            <div className="rounded-lg border border-[#1A4A36]/20 bg-[#E8F1ED] px-4 py-3" role="status">
              <p className="text-xs font-semibold text-[#1A4A36]">Selected: {form.supplier}</p>
              <p className="mt-1 text-xs text-[#3F6B5A]">Pickup location: {form.pickupLocation}</p>
            </div>
          )}
          <fieldset className="min-w-0">
            <legend className="mb-3 text-xs font-medium text-[#3F6B5A]">Choose a supplier{suppliers && !suppliersError ? ` · ${suppliers.length} found` : ""}</legend>
            <div className="grid max-h-80 grid-cols-1 gap-3 overflow-y-auto px-1 py-2 [scrollbar-gutter:stable]">
              {!suppliersError && suppliers?.map((supplier) => {
                const id = String(supplier.supplierId)
                const location = supplierLocation(supplier)
                const label = `${supplier.name} @ ${location}`
                const selected = form.supplierId === id
                return (
                  <label key={id} className={`flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border px-4 py-4 sm:px-5 transition-colors ${selected ? "border-[#1A4A36] bg-[#E8F1ED]" : "border-[#E4E8E6] bg-white hover:border-[#3F6B5A]"}`}>
                    <input
                      type="radio"
                      name="supplier"
                      value={id}
                      checked={selected}
                      onChange={() => setForm((previous) => ({ ...previous, supplierId: id, supplier: label, pickupLocation: location }))}
                      className="h-4 w-4 shrink-0 accent-[#1A4A36]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#162A46]">{supplier.name}</span>
                      <span className="mt-1 block text-xs text-[#3F6B5A]">{location} · {categoryLabel(supplier.type)}</span>
                    </span>
                  </label>
                )
              })}
              {(!suppliers || suppliersError) && (
                <div className="rounded-xl border border-[#E4E8E6] bg-white p-6 text-center">
                  <p className="text-xs text-[#3F6B5A]">{suppliersError || "Loading suppliers…"}</p>
                  {suppliersError && <button type="button" onClick={retry} className="mt-3 text-xs font-semibold text-[#1A4A36] underline">Try again</button>}
                </div>
              )}
              {suppliers && !suppliersError && suppliers.length === 0 && (
                <div className="rounded-xl border border-[#E4E8E6] bg-white p-6 text-center">
                  <p className="text-sm font-medium text-[#162A46]">No suppliers found</p>
                  <p className="mt-1 text-xs text-[#3F6B5A]">Try another name, location, or category.</p>
                  <button type="button" onClick={() => filter("")} className="mt-3 text-xs font-semibold text-[#1A4A36] underline">Clear filters</button>
                </div>
              )}
            </div>
          </fieldset>
          <button
            onClick={() => setStep(2)}
            disabled={!step1Valid}
            className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 2 — Delivery */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-base font-semibold text-[#162A46]">Delivery details</h2>
          <div>
            <label className="block text-xs font-medium text-[#1B2522] mb-1.5">Delivery location</label>
            <select
              value={form.deliveryLocation}
              onChange={(e) => set("deliveryLocation", e.target.value)}
              className={inputCls}
            >
              <option value="">Select delivery location</option>
              {DELIVERY_LOCATIONS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#1B2522] mb-1.5">
              Request details / instructions
            </label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. One iced latte, medium, no sugar. Please check the order before leaving."
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>
          <fieldset className="min-w-0">
            <legend className="mb-3 text-xs font-medium text-[#1B2522]">Preferred delivery / deadline</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="delivery-date" className="mb-1.5 block text-xs text-[#3F6B5A]">Date</label>
                <select id="delivery-date" value={deliveryDate} onChange={(e) => { setDeliveryDate(e.target.value); setDeliveryTime(""); setDeadlineError("") }} className={inputCls}>
                  {!deliveryDates.some((date) => date.value === deliveryDate) && <option value={deliveryDate} disabled>Select a new date</option>}
                  {deliveryDates.map((date) => <option key={date.value} value={date.value}>{date.label}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor="delivery-time" className="mb-1.5 block text-xs text-[#3F6B5A]">Time</label>
                <select id="delivery-time" value={deliveryTime} onChange={(e) => { setDeliveryTime(e.target.value); setDeadlineError("") }} className={inputCls} aria-describedby="deadline-help" aria-invalid={!!deliveryTime && !deadlineValid}>
                  <option value="">Select time</option>
                  {DELIVERY_TIMES.map((time) => <option key={time.value} value={time.value} disabled={new Date(`${deliveryDate}T${time.value}:00`).getTime() <= now}>{time.label}</option>)}
                </select>
              </div>
            </div>
            <p id="deadline-help" className="mt-2 text-xs text-[#3F6B5A]">Next 30 days, in 15-minute intervals. Times use your local time zone.</p>
            {!DELIVERY_TIMES.some((time) => new Date(`${deliveryDate}T${time.value}:00`).getTime() > now) && <p className="mt-2 text-xs text-amber-700">No times remain for this date. Choose a later date.</p>}
            {(deadlineError || (deliveryTime && !deadlineValid)) && <p role="alert" className="mt-2 text-xs text-red-600">{deadlineError || "This time has passed. Choose a later delivery time."}</p>}
          </fieldset>
          <button
            onClick={() => { if (validateDeadline()) setStep(3) }}
            disabled={!step2Valid}
            className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 3 — Credits & Confirm */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="text-base font-semibold text-[#162A46]">Credits &amp; confirmation</h2>

          {/* Credits picker */}
          <div>
            <label className="block text-xs font-medium text-[#1B2522] mb-3">Credits offered</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => set("credits", Math.max(1, form.credits - 1))}
                className="w-10 h-10 border border-[#E4E8E6] rounded-lg flex items-center justify-center hover:bg-[#F7F9F8] text-xl text-[#1B2522] transition-colors"
              >
                −
              </button>
              <div className="flex-1 text-center">
                <span className="text-3xl font-semibold text-[#162A46]">{form.credits}</span>
                <span className="text-sm text-[#3F6B5A] ml-1.5">credits</span>
              </div>
              <button
                onClick={() => set("credits", user.credits === null ? form.credits + 1 : Math.min(user.credits, form.credits + 1))}
                className="w-10 h-10 border border-[#E4E8E6] rounded-lg flex items-center justify-center hover:bg-[#F7F9F8] text-xl text-[#1B2522] transition-colors"
              >
                +
              </button>
            </div>
            <div className="flex justify-between mt-3 text-xs text-[#3F6B5A]">
              <span>Available: <strong className="text-[#162A46]">{user.credits ?? "–"}</strong> credits</span>
              <span className={notEnough ? "text-red-500 font-medium" : ""}>
                Remaining: <strong>{creditsAfter ?? "–"}</strong> credits
              </span>
            </div>
            {user.credits === null && (
              <p className="text-xs text-[#3F6B5A] mt-1.5">Couldn't load your balance right now.</p>
            )}
            {notEnough && (
              <p className="text-xs text-red-500 mt-1.5">Insufficient credits.</p>
            )}
          </div>

          {/* Summary card */}
          <div className="bg-white border border-[#E4E8E6] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E4E8E6]">
              <p className="text-xs font-semibold text-[#162A46] uppercase tracking-wider">Summary</p>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              {[
                { label: "Pickup",       value: form.supplier },
                { label: "Deliver to",   value: form.deliveryLocation },
                { label: "Instructions", value: form.description },
                { label: "Deadline",     value: deadlineLabel },
                { label: "Credits",      value: `${form.credits} credits reserved` },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-4">
                  <span className="text-xs text-[#3F6B5A] w-20 flex-shrink-0 pt-0.5">{label}</span>
                  <span className="text-xs text-[#1B2522] flex-1 font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-[#3F6B5A] flex items-start gap-1.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Credits will be reserved when this request is created.
          </p>

          {!deadlineValid && <p role="alert" className="text-xs text-red-600">Your delivery time has passed. Go back to choose a later date and time.</p>}
          {submitError && <p role="alert" className="text-xs text-red-600">{submitError}</p>}
          <button
            onClick={handleSubmit}
            disabled={notEnough || !deadlineValid || submitting}
            className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Placing request…" : "Place Request"}
          </button>
        </div>
      )}
    </div>
  )
}