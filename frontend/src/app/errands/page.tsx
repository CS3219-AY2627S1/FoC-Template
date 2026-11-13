"use client"

import { useMemo } from "react"
import { toast } from "sonner"

import { OrderCard } from "@/components/orders/order-card"
import { OrderCommandDiscoveryProvider } from "@/components/orders/order-command-discovery"
import { PendingErrandCards } from "@/components/orders/pending-errand-cards"
import { PendingOrderCommands } from "@/components/orders/pending-order-commands"
import { RequireAuth } from "@/components/require-auth"
import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useOrderCommand } from "@/hooks/use-order-command"
import { OrderCommandNotice } from "@/components/orders/order-command-notice"
import { useOrderList } from "@/hooks/use-order-list"
import { useSupplierNames } from "@/hooks/use-supplier-names"
import { buildOrderActionPayload, orderAvailablePath, type Order } from "@/lib/orders"

export default function ErrandsPage() {
  const { user } = useAuth()
  const { orders, loading, error, refresh, updateOrders } = useOrderList(orderAvailablePath())
  const supplierIds = useMemo(() => orders.flatMap((order) => [order.pickupSupplierId, order.deliverySupplierId]), [orders])
  const { names: supplierNames, ready: supplierNamesReady } = useSupplierNames(supplierIds)
  const availableOrders = useMemo(() => user ? orders.filter((order) => order.requesterId !== user.uid) : orders, [orders, user])

  function accepted(updated: Order) {
    updateOrders((current) => current.filter((item) => item.id !== updated.id))
    void refresh()
    toast.success("Errand accepted")
  }

  return (
    <RequireAuth>
      <OrderCommandDiscoveryProvider onResolved={() => void refresh()}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <div><p className="text-sm text-muted-foreground">Available for delivery</p><h1 className="text-2xl font-semibold tracking-tight">Browse errands</h1><p className="mt-1 text-muted-foreground">Accept an open request, then manage it from My Errands.</p></div>
        <PendingOrderCommands onResolved={() => void refresh()} />
        <PendingErrandCards displayedOrders={availableOrders} />
        {error && <p role="status" className="text-xs text-muted-foreground">Could not refresh errands. We will try again.</p>}
        {loading || !supplierNamesReady ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-52" /><Skeleton className="h-52" /></div> : availableOrders.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">No open errands are available right now.</CardContent></Card> : <div className="grid gap-4 md:grid-cols-2">{availableOrders.map((order) => <OrderCard key={order.id} order={order} supplierNames={supplierNames} actions={<AcceptOrderButton order={order} onAccepted={accepted} />} />)}</div>}
      </div>
      </OrderCommandDiscoveryProvider>
    </RequireAuth>
  )
}

function AcceptOrderButton({ order, onAccepted }: { order: Order; onAccepted: (order: Order) => void }) {
  const { user } = useAuth()
  const command = useOrderCommand(`accept:${order.id}`, onAccepted, (message) => toast.error(message))
  async function accept() {
    if (!user) return
    try { await command.run("ACCEPT", `/api/orders/${order.id}/accept`, buildOrderActionPayload(user.uid, order.version)) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not accept this errand.") }
  }
  return <div className="space-y-2">
    <Button size="sm" onClick={() => void accept()} disabled={!command.ready || command.pending}>{command.pending ? "Acceptance pending…" : "Accept errand"}</Button>
    <OrderCommandNotice {...command} />
  </div>
}
