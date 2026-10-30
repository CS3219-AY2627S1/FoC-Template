import { useEffect, useState } from "react"
import type { Order, Page } from "../App"
import RequestCard from "../components/RequestCard"
import LoadMessage from "../components/LoadMessage"
import { listOrders, orderError } from "../api/orders"

interface Props {
  onNavigate: (page: Page) => void
  onSelectOrder: (order: Order) => void
}

export default function OrdersPage({ onNavigate, onSelectOrder }: Props) {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [error, setError] = useState("")

  // backend already leaves out my own orders and expired ones
  const load = () => {
    setError("")
    listOrders("open")
      .then(setOrders)
      .catch((err) => setError(orderError(err)))
  }

  useEffect(load, [])

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-[#162A46]">Open Requests</h1>
          <p className="text-sm text-[#3F6B5A]">Help another student with an errand on campus.</p>
        </div>
        <button onClick={() => onNavigate("create-request")} className="rounded-lg bg-[#1A4A36] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#163D2C]">Create Request</button>
      </div>
      {orders && <p role="status" className="mb-4 text-xs text-[#3F6B5A]">{orders.length} open request{orders.length === 1 ? "" : "s"}</p>}
      {!orders ? (
        <LoadMessage error={error} onRetry={load} />
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-1 text-sm font-medium text-[#162A46]">No open errands right now</p>
          <p className="text-xs text-[#3F6B5A]">Check again later or create your own request.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {orders.map((order) => <RequestCard key={order.id} order={order} onClick={() => onSelectOrder(order)} />)}
        </div>
      )}
    </div>
  )
}