"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RefreshCwIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { StatusSelect } from "@/components/orders/status-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAdminApi } from "@/hooks/use-admin-api"
import { useOrderDisplayNames } from "@/hooks/use-order-display-names"
import { useAdminPage } from "@/hooks/use-admin-page"
import { ADMIN_ACTION_ELIGIBLE_STATUSES, ADMIN_ORDER_STATUSES, type AdminOrder, type AdminOrderQuery, type AdminOrderAction } from "@/lib/admin-api"
import { formatOrderStatus, type OrderStatus } from "@/lib/orders"
import { AdminDetails, AdminFilterActions, AdminFilterForm, AdminHeading, AdminLoadState, AdminPagination, AdminRecordLink, CopyId, adminDate } from "./admin-ui"
import { AdminOrderActionBar, AdminOrderResolutionDialog } from "./admin-order-actions"
import { ApplyPenaltyDialog } from "./apply-penalty-dialog"
import { AdminOrderDateRange } from "./admin-order-date-range"
import { adminOrderDateBounds } from "@/lib/admin-order-dates"

function OrderDetails({ order }: { order: AdminOrder }) {
  const displayName = useOrderDisplayNames([order])
  const displayOrder = { ...order, requesterName: displayName("users", order.requesterId, order.requesterName), courierName: displayName("users", order.courierId, order.courierName), pickupSupplierName: displayName("suppliers", order.pickupSupplierId, order.pickupSupplierName), deliverySupplierName: displayName("suppliers", order.deliverySupplierId, order.deliverySupplierName) }
  const entries = Object.entries(displayOrder)
  const values = new Map(entries)
  const ordered = (keys: string[]): [string, unknown][] => keys.filter((key) => values.has(key)).map((key) => [key, values.get(key)])
  const people = ["requesterName", "requesterId", "courierName", "courierId"]
  const locations = ["pickupSupplierName", "pickupSupplierId", "deliverySupplierName", "deliverySupplierId"]
  const timing = ["status", "createdAt", "expiresAt", "deliveryTimeLimitMinutes", "deliveryDeadlineAt", "deliveredAt", "completedAt", "isOverdue", "isCompletionHold"]
  const resolution = ["appliedPenalty", "appliedPenaltyAmount", "appliedPenaltyAt", "appliedPenaltyBy", "appliedPenaltyReason", "adminResolutionReason", "adminPenaltyDecision", "adminPenaltyReason", "adminPenaltyAmount", "adminResolutionAt"]
  const retired = new Set(["overduePenaltyWaived", "overdueWaivedAt", "overdueWaivedBy", "overdueWaiverReason"])
  const information = ["id", "attemptId", "version", "offeredCredits", "itemDescription"]
  const groups: { title: string; fields: [string, unknown][] }[] = [
    { title: "Order information", fields: ordered(information) },
    { title: "People", fields: ordered(people) },
    { title: "Locations", fields: entries.filter(([key]) => locations.includes(key)) },
    { title: "Status and timing", fields: entries.filter(([key]) => timing.includes(key)) },
    { title: "Repost information", fields: entries.filter(([key]) => key.toLowerCase().includes("repost") || key === "originalOrderId") },
    { title: "Admin resolution", fields: ordered(resolution).filter(([key, value]) => value != null && value !== "" && (key !== "appliedPenaltyAmount" || Boolean(order.appliedPenalty))) },
  ]
  const grouped = new Set([...groups.flatMap((group) => group.fields.map(([key]) => key)), ...resolution, ...retired])
  const other = entries.filter(([key]) => !grouped.has(key))
  if (other.length) groups.push({ title: "Other information", fields: other })
  function field([key, value]: [string, unknown]): [string, React.ReactNode] {
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())
    const nameId = ({ requesterName: order.requesterId, courierName: order.courierId,
      pickupSupplierName: order.pickupSupplierId, deliverySupplierName: order.deliverySupplierId } as Record<string, string | null>)[key]
    if (key.endsWith("Name") && (people.includes(key) || locations.includes(key))) {
      return [label, <RecordLink key={key} kind={people.includes(key) ? "users" : "suppliers"} id={nameId} name={typeof value === "string" ? value : null} />]
    }
    const display = value == null ? "Not provided" : typeof value === "boolean" ? (value ? "Yes" : "No")
      : key.endsWith("At") && typeof value === "string" ? adminDate(value)
        : typeof value === "object" ? JSON.stringify(value) : String(value)
    return [label, key.endsWith("Id") || key === "id"
      ? <CopyId key={key} id={value as string | null} /> : display]
  }
  return <div className="grid gap-6 lg:grid-cols-2">
    {groups.map((group) => <Card key={group.title} className={["Repost information", "Admin resolution"].includes(group.title) ? "lg:col-span-2" : undefined}>
      <CardHeader><CardTitle><h2 className="text-xl">{group.title}</h2></CardTitle></CardHeader>
      <CardContent>{group.fields.length ? <AdminDetails fields={group.fields.map(field)} /> : <p className="text-sm text-muted-foreground">No information provided.</p>}</CardContent>
    </Card>)}
  </div>
}

function RecordLink({ id, name, kind, underlineOnHover = false }: { id: string | null; name: string | null; kind: "users" | "suppliers"; underlineOnHover?: boolean }) {
  if (!id) return <span className="text-muted-foreground">Unassigned</span>
  return <AdminRecordLink href={"/admin/" + kind + "/" + encodeURIComponent(id)} underlineOnHover={underlineOnHover} className="max-w-44" title={name || id}>
    {name || (kind === "users" ? "User unavailable" : "Supplier unavailable")}
  </AdminRecordLink>
}

function AdminOrderDetails({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const api = useAdminApi()
  const [applyingPenalty, setApplyingPenalty] = useState(false)
  const [action, setAction] = useState<AdminOrderAction | null>(null)
  const [resolved, setResolved] = useState<AdminOrder | null>(null)
  const load = useCallback((signal: AbortSignal) => api.order(orderId, signal), [api, orderId])
  const { data, loading, error, refresh } = useAdminPage(load)
  return <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
    <Button variant="outline" onClick={onBack}>Back to orders</Button>
    <AdminHeading title="Order details" description="Review all available information for the selected order." />
    <AdminLoadState loading={loading} error={error} empty={false} retry={refresh} />
    {(resolved ?? data) && <>
      <AdminOrderActionBar order={resolved ?? data} onAction={setAction} onApplyPenalty={() => setApplyingPenalty(true)} />
      <OrderDetails order={(resolved ?? data)!} />
      {applyingPenalty && <ApplyPenaltyDialog orderId={orderId} onClose={() => setApplyingPenalty(false)} onSaved={order => { setResolved(order); setApplyingPenalty(false) }} />}
      {action && <AdminOrderResolutionDialog order={(resolved ?? data)!} action={action} onClose={() => setAction(null)}
        onResolved={(order) => { setResolved(order); setAction(null) }} />}
    </>}
  </section>
}

export function AdminOrders({ initialOrderId, initialSearchOrderId = "" }: { initialOrderId?: string; initialSearchOrderId?: string }) {
  const router = useRouter()
  return initialOrderId
    ? <AdminOrderDetails key={initialOrderId} orderId={initialOrderId} onBack={() => router.push("/admin/orders")} />
    : <AdminOrderList key={initialSearchOrderId} initialSearchOrderId={initialSearchOrderId} />
}

function AdminOrderList({ initialSearchOrderId }: { initialSearchOrderId: string }) {
  const api = useAdminApi()
  const [query, setQuery] = useState<AdminOrderQuery>({ page: 1, status: null, orderId: initialSearchOrderId.trim() })
  const [orderId, setOrderId] = useState(initialSearchOrderId.trim())
  const [penaltyOrder, setPenaltyOrder] = useState<AdminOrder | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [resolution, setResolution] = useState<{ order: AdminOrder; action: AdminOrderAction } | null>(null)
  const load = useCallback(async (signal: AbortSignal) => {
    adminOrderDateBounds(query.fromDate, query.toDate)
    return api.orders(query, signal)
  }, [api, query])
  const { data, loading, error, refresh } = useAdminPage(load)
  const statuses = { all: "All statuses", ...Object.fromEntries(ADMIN_ORDER_STATUSES.map((status) => [status, formatOrderStatus(status)])) }
  const displayName = useOrderDisplayNames(data?.items ?? [])
  const selected = data?.items.find((order) => order.id === selectedId) ?? null
  function changeQuery(next: AdminOrderQuery) { setSelectedId(null); setQuery(next) }

  return <section className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
    {penaltyOrder && <ApplyPenaltyDialog orderId={penaltyOrder.id} onClose={() => setPenaltyOrder(null)} onSaved={() => { setPenaltyOrder(null); refresh() }} />}
    <AdminHeading title="Orders" description="View every order, across all statuses. Latest orders appear first." />
    <AdminFilterForm hasToggle onSubmit={(event) => {
      event.preventDefault(); changeQuery({ ...query, page: 1, orderId: orderId.trim() })
    }}>
      <div className="flex min-w-0 flex-col gap-2"><Label htmlFor="admin-order-status">Status</Label>
        <StatusSelect id="admin-order-status" aria-label="Order status" className="w-full" value={query.status ?? "all"}
          onChange={event => {
            const status = event.target.value === "all" ? null : event.target.value as OrderStatus
            const next = { ...query, page: 1, status }
            if (query.actionEligibleOnly && status && !ADMIN_ACTION_ELIGIBLE_STATUSES.includes(status)) next.actionEligibleOnly = false
            changeQuery(next)
          }}>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </StatusSelect>
      </div>
      <div className="flex min-w-0 flex-col gap-2"><Label htmlFor="admin-order-id">Order ID</Label>
        <Input className="h-10 min-w-0" id="admin-order-id" value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="Enter an exact Order ID" />
      </div>
      <Label className="col-span-2 flex h-10 w-fit cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm font-normal sm:col-span-1">
        <Switch checked={query.actionEligibleOnly ?? false} onCheckedChange={checked => changeQuery({
          ...query, page: 1, actionEligibleOnly: checked,
          status: checked && query.status && !ADMIN_ACTION_ELIGIBLE_STATUSES.includes(query.status) ? null : query.status,
        })} />
        Action-eligible orders
      </Label>
      <AdminFilterActions>
        <Button className="h-10" type="submit">Search</Button>
        <Button className="h-10" type="button" variant="outline" onClick={() => {
          setOrderId(""); changeQuery({ page: 1, status: null, orderId: "" })
        }}>Clear</Button>
      </AdminFilterActions>
    </AdminFilterForm>
    <div className="rounded-xl border">
      <AdminOrderActionBar order={selected} onApplyPenalty={() => { if (selected) setPenaltyOrder(selected) }} onClear={() => setSelectedId(null)} className="rounded-none rounded-t-xl border-0 border-b"
        onAction={(action) => { if (selected) setResolution({ order: selected, action }) }}>
        <AdminOrderDateRange fromDate={query.fromDate} toDate={query.toDate}
          onChange={(fromDate, toDate) => changeQuery({ ...query, page: 1, fromDate, toDate })} />
        <Button variant="ghost" size="icon-xs" aria-label="Refresh orders" title="Refresh orders" disabled={loading}
          onClick={() => changeQuery({ ...query })}><RefreshCwIcon className={loading ? "animate-spin" : undefined} /></Button>
      </AdminOrderActionBar>
      <AdminLoadState loading={loading} error={error} empty={data?.items.length === 0} retry={refresh} />
      {data && data.items.length > 0 && <div className="min-w-0 overflow-x-auto rounded-b-xl" tabIndex={0} aria-label="Orders table, scroll horizontally for more columns">
        <Table className="min-w-[1400px] text-sm">
          <TableHeader><TableRow><TableHead><span className="sr-only">Select</span></TableHead>{["Order ID", "Status", "Requester", "Courier", "Pickup", "Delivery", "Credits", "Completion hold", "Overdue", "Created", "Expires", ""].map((title, index) =>
            <TableHead key={index}>{title || <span className="sr-only">Details</span>}</TableHead>)}</TableRow></TableHeader>
          <TableBody className="font-normal [&_a]:font-normal">{data.items.map((order) => <TableRow key={order.id}
            className="cursor-pointer data-[state=selected]:bg-primary/15 data-[state=selected]:hover:bg-primary/20" tabIndex={0} aria-selected={selectedId === order.id} data-state={selectedId === order.id ? "selected" : undefined}
            onClick={(event) => { if (!(event.target as HTMLElement).closest("a,button,input,label")) setSelectedId(order.id) }}
            onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedId(order.id) } }}>
            <TableCell><input type="radio" name="selected-order" checked={selectedId === order.id} onChange={() => setSelectedId(order.id)} aria-label={"Select order " + order.id} /></TableCell>
            <TableCell className="w-48 min-w-48 whitespace-nowrap"><CopyId id={order.id} compact /></TableCell>
            <TableCell><Badge variant="outline" className="h-6 text-sm font-normal">{formatOrderStatus(order.status)}</Badge></TableCell>
            <TableCell><RecordLink underlineOnHover kind="users" id={order.requesterId} name={displayName("users", order.requesterId, order.requesterName)} /></TableCell>
            <TableCell><RecordLink underlineOnHover kind="users" id={order.courierId} name={displayName("users", order.courierId, order.courierName)} /></TableCell>
            <TableCell><RecordLink underlineOnHover kind="suppliers" id={order.pickupSupplierId} name={displayName("suppliers", order.pickupSupplierId, order.pickupSupplierName)} /></TableCell>
            <TableCell><RecordLink underlineOnHover kind="suppliers" id={order.deliverySupplierId} name={displayName("suppliers", order.deliverySupplierId, order.deliverySupplierName)} /></TableCell>
            <TableCell>{order.offeredCredits}</TableCell>
            <TableCell>{order.isCompletionHold ? "Yes" : "No"}</TableCell>
            <TableCell>{order.isOverdue == null ? "Unknown" : order.isOverdue ? "Yes" : "No"}</TableCell>
            <TableCell>{adminDate(order.createdAt)}</TableCell>
            <TableCell>{adminDate(order.expiresAt)}</TableCell>
            <TableCell><Link className={buttonVariants({ size: "sm", variant: "outline" })}
              href={"/admin/orders/" + encodeURIComponent(order.id)} aria-label={"View order " + order.id}>View</Link></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>}
    </div>
    {data && data.items.length > 0 && <AdminPagination {...data} onPage={(page) => changeQuery({ ...query, page })} />}
    {resolution && <AdminOrderResolutionDialog {...resolution} onClose={() => setResolution(null)}
      onResolved={() => { setResolution(null); changeQuery({ ...query }) }} />}
  </section>
}
