"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAdminApi } from "@/hooks/use-admin-api"
import { useAdminPage } from "@/hooks/use-admin-page"
import { ADMIN_ACTION_ELIGIBLE_STATUSES, type AdminOrder, type AdminOrderAction } from "@/lib/admin-api"
import { AdminLoadState, CopyId } from "./admin-ui"

export function canResolveOrder(order: AdminOrder) {
  return ADMIN_ACTION_ELIGIBLE_STATUSES.includes(order.status)

}

export function AdminOrderActionBar({ order, onAction, onClear, onApplyPenalty, children, className }: {
  order: AdminOrder | null
  onAction: (action: AdminOrderAction) => void
  onApplyPenalty?: () => void
  onClear?: () => void
  children?: React.ReactNode
  className?: string
}) {
  return <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1.5", className)} aria-label="Order actions">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="destructive" disabled={!order || !canResolveOrder(order)} onClick={() => onAction("cancel")}>Cancel order</Button>
      {onApplyPenalty && <Button size="sm" variant="outline" disabled={!order || !order.courierId || !canResolveOrder(order)} onClick={onApplyPenalty}>Apply penalty</Button>}
      {order && onClear && <Button size="icon-xs" variant="ghost" onClick={onClear} aria-label="Clear selection" title="Clear selection"><XIcon /></Button>}
    </div>
    {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
  </div>
}

const policyLabels: Record<string, string> = {
  ACCEPTED_TASK_CANCELLATION: "Accepted task cancellation",
  OVERDUE_DELIVERY: "Overdue delivery",
  WRONG_LOCATION_DELIVERY: "Wrong location delivery",
  COURIER_UNRESPONSIVE: "Courier unresponsive",
  ITEM_MISHANDLING_OR_DAMAGE: "Item mishandling or damage",
  DELIBERATE_ITEM_RETENTION_OR_THEFT: "Deliberate item retention or theft",
}

export function AdminOrderResolutionDialog({ order, action, onClose, onResolved }: {
  order: AdminOrder
  action: AdminOrderAction
  onClose: () => void
  onResolved: (order: AdminOrder) => void
}) {
  const api = useAdminApi()
  const load = useCallback((signal: AbortSignal) => api.penaltyPolicies(signal), [api])
  const { data: policies, loading, error, refresh } = useAdminPage(load)
  const [choice, setChoice] = useState<"none" | "apply" | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [custom, setCustom] = useState("")
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [failure, setFailure] = useState<string | null>(null)
  const reasons = Object.fromEntries(["Requester requested cancellation", "Courier unable to fulfil", "Errand can no longer be fulfilled", "Report investigation resolved", "Other reason"].map(value => [value, value]))
  const explanation = reason === "Other reason" ? custom.trim() : reason ?? ""
  const highest = Math.max(0, ...(policies ?? []).filter((policy) => selected === policy.policy).map((policy) => policy.penaltyAmount))
  const valid = choice !== null && explanation.length > 0 && explanation.length <= 1000
    && (choice === "none" || (Boolean(order.courierId) && !loading && !error && highest > 0))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid || submitting.current) return
    submitting.current = true
    setBusy(true)
    setFailure(null)
    try {
      const result = await api.resolveOrder(order.id, action, {
        requesterId: order.requesterId, courierId: order.courierId,
        appliedPenalties: choice === "apply" && selected ? [selected] : [], resolutionReason: explanation,
      })
      toast.success("Order updated. Funding and any selected penalty will be processed asynchronously.")
      onResolved(result)
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "The order could not be updated. Please retry.")
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !submitting.current) onClose() }}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl" showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle>Cancel this order?</DialogTitle>
        <DialogDescription>Refund the reserved credits to the requester. This action can cancel a held order and cannot be undone.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4 pr-1">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
          <CopyId id={order.id} />
          <p>{order.offeredCredits} credits will be refunded.</p>
          {order.appliedPenalty && <p>Stored penalty: {policyLabels[order.appliedPenalty] ?? order.appliedPenalty} · {order.appliedPenaltyAmount} points</p>}
          {order.isCompletionHold && <p>This order has an ongoing report/completion hold. Your decision overrides the completion restriction and preserves the hold history.</p>}
        </div>
        <fieldset disabled={busy} className="space-y-3">
          <legend className="mb-2 text-sm font-medium">Courier penalty</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="penalty-choice" checked={choice === "none"} onChange={() => setChoice("none")} />No penalty</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="penalty-choice" disabled={!order.courierId} checked={choice === "apply"} onChange={() => setChoice("apply")} />Apply penalty</label>
          {!order.courierId && <p className="text-sm text-muted-foreground">No courier is assigned, so a courier penalty cannot be applied.</p>}
          {choice === "apply" && <div className="space-y-3 rounded-lg border p-3">
            <AdminLoadState loading={loading} error={error} empty={policies?.length === 0} retry={refresh} />
            {policies && [...policies].sort((a, b) => a.penaltyAmount - b.penaltyAmount).map(({ policy, penaltyAmount }) => <label key={policy} className="flex items-start justify-between gap-3 text-sm">
              <span className="flex items-start gap-2"><input className="mt-1" type="radio" name="cancellation-policy" checked={selected === policy}
                onChange={() => setSelected(policy)} />
                {policyLabels[policy] ?? policy.replaceAll("_", " ").toLowerCase()}</span>
              <span className="shrink-0 text-muted-foreground">{penaltyAmount} points</span>
            </label>)}
            <p className="text-sm text-muted-foreground">Choose one penalty case. Only the highest selected amount is requested.</p>
          </div>}
        </fieldset>
        <fieldset disabled={busy} className="space-y-3">
          <div className="space-y-2"><Label>Admin reason</Label>
            <Select items={reasons} value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Admin reason" className="w-full"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
              <SelectContent>{Object.keys(reasons).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {reason === "Other reason" && <div className="space-y-2"><Label htmlFor="admin-resolution-reason">Custom reason</Label>
            <Textarea id="admin-resolution-reason" value={custom} onChange={(event) => setCustom(event.target.value)} maxLength={1000} required placeholder="Explain the decision for this order" />
            <p className="text-xs text-muted-foreground">{custom.length}/1000 characters</p>
          </div>}
        </fieldset>
        {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Go back</Button>
          <Button type="submit" variant="destructive" disabled={!valid || busy}>
            {busy ? "Saving…" : "Confirm cancellation"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
