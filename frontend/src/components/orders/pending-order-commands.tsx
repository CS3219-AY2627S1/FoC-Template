"use client"

import { useMemo } from "react"
import { OrderCommandDiscoveryProvider, useOrderCommandDiscovery } from "@/components/orders/order-command-discovery"
import { OrderCommandNotice } from "@/components/orders/order-command-notice"
import { useSupplierNames } from "@/hooks/use-supplier-names"

/** Submitted details, not fabricated new orders. Missing target details retain a safe fallback. */
export function PendingOrderCommands({ onResolved }: { onResolved: () => void }) {
  const discovery = useOrderCommandDiscovery()
  if (!discovery) return <OrderCommandDiscoveryProvider onResolved={onResolved}><Summaries /></OrderCommandDiscoveryProvider>
  return <Summaries />
}
function Summaries() {
  const discovery = useOrderCommandDiscovery()!
  const commands = discovery.items.filter((command) => command.kind === "CREATE" || command.kind === "REPOST" || !command.displayDetails?.orderStatus)
  const ids = useMemo(() => commands.flatMap((command) => command.displayDetails ? [command.displayDetails.pickupSupplierId, command.displayDetails.deliverySupplierId] : []), [commands])
  const { names } = useSupplierNames(ids)
  if (!commands.length) return null
  const labels = { CREATE: "Posting request", ACCEPT: "Accepting errand", ABORT: "Aborting errand", REPOST: "Reposting request" }
  return <section aria-label="Pending requests" className="space-y-3 rounded-xl border p-4">
    <h2 className="text-sm font-medium">Requests in progress</h2>
    {commands.map((command) => <div key={command.commandId} className="space-y-2 break-words rounded-lg border p-3">
      <p className="text-sm font-medium">{command.kind ? labels[command.kind] : "Processing request"}</p>
      {command.displayDetails && <div className="space-y-1 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{command.displayDetails.itemDescription}</p>
        <p>{names[command.displayDetails.pickupSupplierId] ?? "Location unavailable"} → {names[command.displayDetails.deliverySupplierId] ?? "Location unavailable"}</p>
        <p>{command.displayDetails.offeredCredits} credits · {command.displayDetails.deliveryTimeLimitMinutes} minute limit</p>
        <p>New expiry {new Date(command.displayDetails.expiresAt).toLocaleString()}</p>
      </div>}
      <OrderCommandNotice message={`${command.message ?? "Your request is pending."}${command.attemptCount ? ` Attempt ${command.attemptCount}.` : ""}`}
        needsAuthorization={discovery.enabled && !discovery.busy && command.reason === "AUTHORIZATION_REQUIRED"}
        continueRecovery={() => discovery.resume(command)} />
    </div>)}
  </section>
}
