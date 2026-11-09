"use client"

import type { FormEvent } from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { QuarterHourDateTimePicker } from "@/components/orders/quarter-hour-date-time-picker"
import { SupplierSelector } from "@/components/orders/supplier-selector"
import { RequireAuth } from "@/components/require-auth"
import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useOrderCommand } from "@/hooks/use-order-command"
import { OrderCommandNotice } from "@/components/orders/order-command-notice"
import { ApiError } from "@/lib/api"
import { buildCreateOrderPayload, minOrderExpiryDateTimeLocal, quarterHourDateTimeLocal, validateCreateOrderFields, type CreateOrderForm, type OrderFieldErrors } from "@/lib/orders"
import { invalidateCreditBalance } from "@/lib/credit-balance-events"

const inputClass = "h-9 rounded-lg border bg-transparent px-3 text-sm"
const localDate = (hoursFromNow: number) => quarterHourDateTimeLocal(new Date(Date.now() + hoursFromNow * 60 * 60_000))

const initialForm = (): CreateOrderForm => ({
  itemDescription: "",
  pickupSupplierId: "",
  deliverySupplierId: "",
  offeredCredits: 1,
  deliveryTimeLimitMinutes: 15,
  expiresAt: localDate(1),
  automaticRepost: false,
  repostDueAt: localDate(2),
  repostExpiresAt: localDate(3),
  repostCreditAmount: 1,
  repostDeliveryDurationMinutes: 15,
})

export default function NewRequestPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [form, setForm] = useState(initialForm)
  const [busy, setBusy] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<OrderFieldErrors>({})
  const command = useOrderCommand("create", () => {
    invalidateCreditBalance()
    toast.success("Order posted")
    router.push("/my-requests")
  }, (message) => { setPostError(message); toast.error(message) })

  function update<K extends keyof CreateOrderForm>(key: K, value: CreateOrderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[key]
      if (key === "pickupSupplierId") delete next.deliverySupplierId
      if (key === "expiresAt") delete next.repostDueAt
      if (key === "repostDueAt") delete next.repostExpiresAt
      if (key === "automaticRepost") {
        delete next.repostDueAt
        delete next.repostExpiresAt
        delete next.repostCreditAmount
        delete next.repostDeliveryDurationMinutes
      }
      return next
    })
    setPostError(null)
  }

  function fieldProps(field: keyof CreateOrderForm) {
    return { "aria-invalid": !!fieldErrors[field], "aria-describedby": fieldErrors[field] ? `${field}-error` : undefined }
  }

  function fieldError(field: keyof CreateOrderForm) {
    return fieldErrors[field] ? <p id={`${field}-error`} className="text-xs text-destructive">{fieldErrors[field]}</p> : null
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || command.pending || !command.ready) return
    const errors = validateCreateOrderFields(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length) {
      setPostError(null)
      toast.error(Object.values(errors)[0])
      return
    }
    setPostError(null)
    setBusy(true)
    try {
      await command.run("CREATE", "/api/orders", buildCreateOrderPayload(form, user.uid))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not post this request."
      const details: OrderFieldErrors = {}
      const other: string[] = []
      for (const detail of error instanceof ApiError ? error.details ?? [] : []) {
        if (detail.field && Object.hasOwn(form, detail.field) && detail.field !== "automaticRepost") {
          details[detail.field as keyof CreateOrderForm] = detail.message
        } else other.push(detail.message)
      }
      setFieldErrors(details)
      setPostError(other.length ? other.join(" ") : Object.keys(details).length ? null : message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <RequireAuth>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <div><p className="text-sm text-muted-foreground">Request service</p><h1 className="text-2xl font-semibold tracking-tight">Post a campus request</h1><p className="mt-1 text-muted-foreground">Describe the errand and reserve credits before it becomes available.</p></div>
        {(postError || Object.keys(fieldErrors).length > 0) && <Alert variant="destructive" role="alert"><AlertTitle>Request could not be posted</AlertTitle><AlertDescription>{postError && <p>{postError}</p>}{Object.values(fieldErrors).length > 0 && <ul className="list-disc pl-4">{Object.entries(fieldErrors).map(([field, message]) => <li key={field}><a href={`#${field}-error`}>{message}</a></li>)}</ul>}</AlertDescription></Alert>}
        <form noValidate onSubmit={(event) => void submit(event)} className="space-y-6" aria-label="Post request form">
          <fieldset disabled={busy || command.pending || !command.ready} className="contents">
          <Card><CardHeader><CardTitle>Request details</CardTitle><CardDescription>Select suppliers from the active Supplier Service catalogue.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2"><Label htmlFor="item-description">What do you need?</Label><Input id="item-description" {...fieldProps("itemDescription")} required maxLength={100} className={inputClass} value={form.itemDescription} onChange={(event) => update("itemDescription", event.target.value)} placeholder="Pick up a parcel from the campus store" />{fieldError("itemDescription")}</label>
            {(["pickupSupplierId", "deliverySupplierId"] as const).map((field) => {
              const pickup = field === "pickupSupplierId"
              const label = pickup ? "Pickup supplier" : "Delivery supplier"
              const id = pickup ? "pickup-supplier" : "delivery-supplier"
              return <div key={field} className="space-y-1 text-sm"><Label htmlFor={id}>{label}</Label>
                <SupplierSelector id={id} label={label} value={form[field]} onChange={(value) => update(field, value)}
                  disabled={busy || command.pending || !command.ready} {...fieldProps(field)} />{fieldError(field)}</div>
            })}
            <label className="space-y-1 text-sm"><Label htmlFor="credits">Offered credits</Label><Input id="credits" {...fieldProps("offeredCredits")} required type="number" min="1" className={inputClass} value={form.offeredCredits} onChange={(event) => update("offeredCredits", Number(event.target.value))} />{fieldError("offeredCredits")}</label>
            <label className="space-y-1 text-sm"><Label htmlFor="delivery-limit">Delivery time limit (minutes)</Label><Input id="delivery-limit" {...fieldProps("deliveryTimeLimitMinutes")} required type="number" min="15" className={inputClass} value={form.deliveryTimeLimitMinutes} onChange={(event) => update("deliveryTimeLimitMinutes", Number(event.target.value))} />{fieldError("deliveryTimeLimitMinutes")}</label>
            <div className="space-y-1 sm:col-span-2"><QuarterHourDateTimePicker id="expires-at" label="Order expiry" required min={minOrderExpiryDateTimeLocal()} invalid={!!fieldErrors.expiresAt} describedBy={fieldErrors.expiresAt ? "expiry-help expiresAt-error" : "expiry-help"} value={form.expiresAt} onChange={(value) => update("expiresAt", value)} />{fieldError("expiresAt")}<p id="expiry-help" className="text-xs text-muted-foreground">Choose an expiry at least 30 minutes from now. Minutes must be 00, 15, 30, or 45.</p></div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Automatic repost</CardTitle><CardDescription>Optional NTH4 behavior. The new order is created and credited only when the repost is due.</CardDescription></CardHeader><CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.automaticRepost} onChange={(event) => update("automaticRepost", event.target.checked)} />Enable automatic repost if no courier accepts</label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><QuarterHourDateTimePicker id="repost-due" label="Repost time" disabled={!form.automaticRepost} required={form.automaticRepost} min={form.expiresAt} invalid={!!fieldErrors.repostDueAt} describedBy={fieldProps("repostDueAt")["aria-describedby"]} value={form.repostDueAt} onChange={(value) => update("repostDueAt", value)} />{fieldError("repostDueAt")}</div>
              <div className="space-y-1 sm:col-span-2"><QuarterHourDateTimePicker id="repost-expiry" label="Repost expiry" disabled={!form.automaticRepost} required={form.automaticRepost} min={Number.isNaN(new Date(form.repostDueAt).getTime()) ? undefined : minOrderExpiryDateTimeLocal(new Date(form.repostDueAt))} invalid={!!fieldErrors.repostExpiresAt} describedBy={fieldErrors.repostExpiresAt ? "repost-expiry-help repostExpiresAt-error" : "repost-expiry-help"} value={form.repostExpiresAt} onChange={(value) => update("repostExpiresAt", value)} />{fieldError("repostExpiresAt")}<p id="repost-expiry-help" className="text-xs text-muted-foreground">Repost time must be at or after the original expiry. Repost expiry must be at least 30 minutes after repost time; choose minutes 00, 15, 30, or 45.</p></div>
              <label className="space-y-1 text-sm"><Label htmlFor="repost-credits">Repost credits</Label><Input id="repost-credits" {...fieldProps("repostCreditAmount")} type="number" min="1" disabled={!form.automaticRepost} className={inputClass} value={form.repostCreditAmount} onChange={(event) => update("repostCreditAmount", Number(event.target.value))} />{fieldError("repostCreditAmount")}</label>
              <label className="space-y-1 text-sm"><Label htmlFor="repost-duration">Repost delivery minutes</Label><Input id="repost-duration" {...fieldProps("repostDeliveryDurationMinutes")} type="number" min="15" disabled={!form.automaticRepost} className={inputClass} value={form.repostDeliveryDurationMinutes} onChange={(event) => update("repostDeliveryDurationMinutes", Number(event.target.value))} />{fieldError("repostDeliveryDurationMinutes")}</label>
            </div>
          </CardContent></Card>
          <Button type="submit" disabled={busy || command.pending || !command.ready || !form.pickupSupplierId || !form.deliverySupplierId}>{busy || command.pending ? "Request pending…" : "Post request"}</Button>
          </fieldset>
        </form>
        <OrderCommandNotice {...command} />
      </div>
    </RequireAuth>
  )
}
