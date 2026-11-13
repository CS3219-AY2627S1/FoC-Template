"use client"

import { Clock3Icon, MapPinIcon, WalletCardsIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Order } from "@/lib/orders"
import { formatOrderStatus } from "@/lib/orders"

export type OrderCardData = Pick<Order, "itemDescription" | "pickupSupplierId" | "deliverySupplierId" | "offeredCredits" | "deliveryTimeLimitMinutes" | "expiresAt" | "status">
export function OrderCard({ order, supplierNames = {}, actions, footer }: { order: OrderCardData; supplierNames?: Record<string, string>; actions?: React.ReactNode; footer?: React.ReactNode }) {
  const pickupSupplier = supplierNames[order.pickupSupplierId] ?? "Location unavailable"
  const deliverySupplier = supplierNames[order.deliverySupplierId] ?? "Location unavailable"

  return (
    <Card className="rounded-xl">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">{order.itemDescription}</CardTitle>
        </div>
        <Badge variant={order.status === "OPEN" ? "default" : "outline"}>{formatOrderStatus(order.status)}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <span className="flex items-center gap-2"><MapPinIcon className="size-4" />{pickupSupplier} → {deliverySupplier}</span>
          <span className="flex items-center gap-2"><WalletCardsIcon className="size-4" />{order.offeredCredits} credits</span>
          <span className="flex items-center gap-2"><Clock3Icon className="size-4" />{order.deliveryTimeLimitMinutes} minute limit</span>
          <span>Expires {new Date(order.expiresAt).toLocaleString()}</span>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        {footer}
      </CardContent>
    </Card>
  )
}
