"use client"

import { useMemo } from "react"
import { OrderCard } from "@/components/orders/order-card"
import { OrderCommandNotice } from "@/components/orders/order-command-notice"
import { useOrderCommandDiscovery } from "@/components/orders/order-command-discovery"
import { Button } from "@/components/ui/button"
import { useSupplierNames } from "@/hooks/use-supplier-names"
import type { Order } from "@/lib/orders"

/** Actual existing targets only. Incomplete CREATE/REPOST candidates are never Order cards. */
export function PendingErrandCards({ displayedOrders, kinds = ["ACCEPT", "ABORT"] }: {
  displayedOrders: (Pick<Order, "id" | "status"> & { attemptId?: string | null })[]; kinds?: string[]
}) {
  const discovery = useOrderCommandDiscovery()
  const commands = (discovery?.items ?? []).filter((command) => kinds.includes(command.kind ?? "") && command.orderId && command.displayDetails?.orderStatus
    && !displayedOrders.some((order) => !order.attemptId && order.status !== "ABORTED" && order.id === command.orderId))
  const ids = useMemo(() => commands.flatMap((command) => [command.displayDetails!.pickupSupplierId, command.displayDetails!.deliverySupplierId]), [commands])
  const { names } = useSupplierNames(ids)
  if (!commands.length) return null
  return <section aria-label="Errands with pending actions" className="grid gap-4 md:grid-cols-2">
    {commands.map((command) => <OrderCard key={command.commandId} order={{ ...command.displayDetails!, status: command.displayDetails!.orderStatus! }} supplierNames={names}
      actions={<div className="space-y-2">
        <Button size="sm" disabled>{command.kind === "ACCEPT" ? "Acceptance pending…" : "Abort pending…"}</Button>
        <OrderCommandNotice message={`${command.message ?? "Outcome not confirmed. Please wait."}${command.attemptCount ? ` Attempt ${command.attemptCount}.` : ""}`}
          needsAuthorization={!!discovery?.enabled && !discovery.busy && command.reason === "AUTHORIZATION_REQUIRED"}
          continueRecovery={() => discovery!.resume(command)} />
      </div>} />)}
  </section>
}
