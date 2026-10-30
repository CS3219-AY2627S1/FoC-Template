// AI-assisted (Claude), reviewed and tested by Maliha
import { useEffect, useState } from "react"
import type { Order } from "../App"
import RequestCard from "../components/RequestCard"
import LoadMessage from "../components/LoadMessage"
import { listOrders, orderError, updateOrder, type OrderAction } from "../api/orders"
import type { ComponentProps } from "react"
type CardActions = NonNullable<ComponentProps<typeof RequestCard>["actions"]>

type Tab = "my-requests" | "my-deliveries"

const TABS: { key: Tab; label: string }[] = [
  { key: "my-requests",   label: "My Requests" },
  { key: "my-deliveries", label: "My Deliveries" },
]

const isActive = (o: Order) => ["open", "accepted", "picked-up"].includes(o.status)

interface Props {
  onSelectOrder: (order: Order) => void
}

export default function MyOrdersPage({ onSelectOrder }: Props) {
  const [tab, setTab] = useState<Tab>("my-requests")
  const [requests, setRequests] = useState<Order[] | null>(null)
  const [deliveries, setDeliveries] = useState<Order[] | null>(null)
  const [error, setError] = useState("")
  const [actionError, setActionError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setError("")
    Promise.all([listOrders("requested"), listOrders("assigned")])
      .then(([req, del]) => { setRequests(req); setDeliveries(del) })
      .catch((err) => setError(orderError(err)))
  }

  useEffect(load, [])

  // swap the updated order into whichever list it came from
  const act = (order: Order, action: OrderAction) => {
    setBusyId(order.id)
    setActionError("")
    updateOrder(order.id, action)
      .then((updated) => {
        const swap = (list: Order[] | null) => list?.map((o) => (o.id === updated.id ? updated : o)) ?? null
        setRequests(swap)
        setDeliveries(swap)
      })
      .catch((err) => setActionError(orderError(err)))
      .finally(() => setBusyId(null))
  }

  const filtered = (tab === "my-requests" ? requests : deliveries) ?? []
  const activeRequests   = (requests ?? []).filter(isActive).length
  const activeDeliveries = (deliveries ?? []).filter(isActive).length

  function getActions(order: Order): CardActions {
    if (tab === "my-deliveries") {
      return {
        onMarkPickedUp:  order.status === "accepted"  ? () => act(order, "pickup")  : undefined,
        onMarkDelivered: order.status === "picked-up" ? () => act(order, "deliver") : undefined,
      }
    }
    return {
      onCancel: order.status === "open" ? () => act(order, "cancel") : undefined,
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-[#162A46] mb-1">My orders</h1>
        <p className="text-sm text-[#3F6B5A]">Track your requests and deliveries, including completed orders.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: "Active requests",   value: activeRequests,   unit: "" },
          { label: "Active deliveries", value: activeDeliveries, unit: "" },
        ].map(({ label, value, unit }) => (
          <div key={label} className="bg-white border border-[#E4E8E6] rounded-xl p-4">
            <p className="text-[11px] text-[#3F6B5A] mb-1 font-medium uppercase tracking-wide">{label}</p>
            <p className="text-xl font-semibold text-[#162A46]">
              {value}
              {unit && <span className="text-xs font-normal text-[#3F6B5A] ml-1">{unit}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E4E8E6] mb-5 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
              tab === key
                ? "border-[#1A4A36] text-[#1A4A36]"
                : "border-transparent text-[#3F6B5A] hover:text-[#1B2522]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-600">{actionError}</p>
      )}

      {/* List or empty state */}
      {!requests || !deliveries ? (
        <LoadMessage error={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-[#E8F1ED] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-[#3F6B5A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#162A46] mb-1">{tab === "my-requests" ? "No requests yet" : "No deliveries yet"}</p>
          <p className="text-xs text-[#3F6B5A]">{tab === "my-requests" ? "Create a request to get started." : "Browse open requests to accept your first errand."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {filtered.map((order) => (
            <RequestCard
              key={order.id}
              order={order}
              onClick={() => onSelectOrder(order)}
              actions={getActions(order)}
              busy={busyId === order.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}