"use client"

import { useState } from "react"
import { toast } from "sonner"

import { QuarterHourDateTimePicker } from "@/components/orders/quarter-hour-date-time-picker"
import { OrderCommandNotice } from "@/components/orders/order-command-notice"
import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApi } from "@/hooks/use-api"
import { useOrderCommand } from "@/hooks/use-order-command"
import { invalidateCreditBalance } from "@/lib/credit-balance-events"
import { ApiError } from "@/lib/api"
import { isQuarterHourDateTime, minOrderExpiryDateTimeLocal, quarterHourDateTimeLocal, type Order } from "@/lib/orders"

const inputClass = "h-9 rounded-lg border bg-transparent px-3 text-sm"

export function RepostControls({ order, onUpdated }: { order: Order; onUpdated: (order: Order) => void }) {
  const api = useApi()
  const { user } = useAuth()
  const [expiryError, setExpiryError] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ message: string; version: number } | null>(null)
  const failureMessage = failure && order.version <= failure.version
    ? failure.message : order.repostFailureMessage
  const [creditAmount, setCreditAmount] = useState(String(order.offeredCredits))
  const [duration, setDuration] = useState(String(order.deliveryTimeLimitMinutes))
  const [description, setDescription] = useState(order.itemDescription)
  const [expiresAt, setExpiresAt] = useState(() => quarterHourDateTimeLocal(new Date(Math.max(new Date(order.expiresAt).getTime() + 2 * 60 * 60_000, Date.now() + 30 * 60_000))))
  const command = useOrderCommand(`repost:${order.id}`, (updated) => {
    onUpdated(updated)
    invalidateCreditBalance()
    toast.success("Order reposted")
  }, (message) => {
    setFailure({ message, version: order.version })
    // The committed failure changes the original version. Polling also recovers this read.
    void api<Order>(`/api/orders/${order.id}`).then(onUpdated).catch(() => {})
  })
  const busy = command.pending
  const disabled = busy || !command.ready
  const saved = command.savedInput
  const displayedDescription = saved ? String(saved.itemDescription) : description
  const displayedCredits = saved ? String(saved.offeredCredits) : creditAmount
  const displayedDuration = saved ? String(saved.deliveryTimeLimitMinutes) : duration
  const displayedExpiry = saved?.expiresAt ? quarterHourDateTimeLocal(new Date(String(saved.expiresAt))) : expiresAt

  async function manualRepost() {
    if (!user || disabled) return
    const invalidFields = [
      !description.trim() ? "Describe what you need." : description.trim().length > 100 ? "Description must be 100 characters or fewer." : null,
      !Number.isSafeInteger(Number(creditAmount)) || Number(creditAmount) < 1 ? "Offered credits must be a whole number of at least 1." : null,
      !Number.isSafeInteger(Number(duration)) || Number(duration) < 15 ? "Delivery time must be a whole number of at least 15 minutes." : null,
    ].filter(Boolean)
    if (invalidFields.length) {
      setFailure({ message: invalidFields.join(" "), version: order.version })
      return
    }
    if (!isQuarterHourDateTime(expiresAt)) {
      setExpiryError("Choose expiry minutes of 00, 15, 30, or 45.")
      toast.error("Choose expiry minutes of 00, 15, 30, or 45.")
      return
    }
    if (new Date(expiresAt).getTime() < Date.now() + 30 * 60_000) {
      setExpiryError("Order expiry must be at least 30 minutes from now. Choose a later time.")
      toast.error("Order expiry must be at least 30 minutes from now. Choose a later time.")
      return
    }
    setExpiryError(null)
    setFailure(null)
    try {
      await command.run("REPOST", `/api/orders/${order.id}/repost`, {
          commandId: crypto.randomUUID(),
          actorId: user.uid,
          expectedVersion: order.version,
          itemDescription: description.trim(),
          offeredCredits: Number(creditAmount),
          deliveryTimeLimitMinutes: Number(duration),
          expiresAt: new Date(expiresAt).toISOString(),
      })
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "UNKNOWN"
      const message = code === "INSUFFICIENT_CREDITS"
        ? "Repost failed: insufficient available credits."
        : code === "FORBIDDEN" || code === "UNAUTHENTICATED"
          ? "Repost could not be authorized. Please sign in again."
          : code === "VALIDATION_ERROR"
            ? error instanceof ApiError ? error.details?.map(detail => detail.message).join(" ") || error.message : "Repost failed: check the request details."
            : code === "CONFLICT"
              ? "This request could not be reposted. Refresh and check its status."
              : "Could not repost right now. Please try again later."
      setFailure({ message, version: order.version })
      if (error instanceof ApiError) setExpiryError(error.details?.find(detail => detail.field === "expiresAt")?.message ?? null)
      // Failure recording changes the original's version. Refresh it before
      // another manual attempt; polling/reload can also read this durable result.
      if (code !== "UNAUTHENTICATED" && code !== "FORBIDDEN") {
        try {
          const original = await api<Order>(`/api/orders/${order.id}`)
          onUpdated(original)
        } catch {
          // Keep the short local message if this read also fails; polling recovers.
        }
      }
    }
  }

  if (order.status === "OPEN") {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Automatic repost</CardTitle>
          <CardDescription>Automatic repost is selected when an order is created. It cannot be enabled or changed after posting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.automaticRepostEnabled ? (
            <>
              <p className="text-sm font-medium">Automatic repost was configured when this order was created.</p>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <p><span className="text-muted-foreground">Repost time</span><br />{order.repostDueAt ? new Date(order.repostDueAt).toLocaleString() : "Not available"}</p>
                <p><span className="text-muted-foreground">Repost expiry</span><br />{order.repostExpiresAt ? new Date(order.repostExpiresAt).toLocaleString() : "Not available"}</p>
                <p><span className="text-muted-foreground">Repost credits</span><br />{order.repostCreditAmount ?? 0}</p>
                <p><span className="text-muted-foreground">Delivery minutes</span><br />{order.repostDeliveryDurationMinutes ?? 0}</p>
              </div>
              <p className="text-xs text-muted-foreground">These settings cannot be changed after posting.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Automatic repost was not enabled when this order was created and cannot be enabled later.</p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (order.status !== "EXPIRED" || order.repostedOrderId) return null

  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Review and repost</CardTitle>
        <CardDescription>This expired order has not been reposted. Review the details before creating one linked repost.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!busy && failureMessage && <p role="alert" className="text-xs text-destructive">{failureMessage}</p>}
        <OrderCommandNotice {...command} />
        <label className="space-y-1 text-sm"><Label htmlFor={`description-${order.id}`}>Description</Label><Input id={`description-${order.id}`} disabled={disabled} className={inputClass} value={displayedDescription} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-sm"><Label htmlFor={`manual-credits-${order.id}`}>Credits</Label><Input id={`manual-credits-${order.id}`} disabled={disabled} type="number" min="1" className={inputClass} value={displayedCredits} onChange={(event) => setCreditAmount(event.target.value)} /></label>
          <label className="space-y-1 text-sm"><Label htmlFor={`manual-duration-${order.id}`}>Delivery minutes</Label><Input id={`manual-duration-${order.id}`} disabled={disabled} type="number" min="15" className={inputClass} value={displayedDuration} onChange={(event) => setDuration(event.target.value)} /></label>
          <div className="space-y-1 sm:col-span-3"><QuarterHourDateTimePicker id={"manual-expires-" + order.id} disabled={disabled} label="New expiry" min={minOrderExpiryDateTimeLocal()} invalid={!!expiryError} describedBy={`manual-expiry-help-${order.id}`} value={displayedExpiry} onChange={(value) => { setExpiresAt(value); setExpiryError(null) }} /><p id={`manual-expiry-help-${order.id}`} className={expiryError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{expiryError || "New expiry must be at least 30 minutes from now. Choose minutes 00, 15, 30, or 45."}</p></div>
        </div>
        <Button size="sm" onClick={() => void manualRepost()} disabled={disabled}>{busy ? "Reposting…" : "Create repost"}</Button>
      </CardContent>
    </Card>
  )
}
