// AI-assisted (Claude Opus 5.5), 2026-11-12: background refresh of open requests; see ui/ai-usage/usage-log.md, entry 002
// AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12.
// Scope: Open-request refresh, visibility explanation, and request cleanup.
// Human review pending; see ui/ai-usage/ui-order-fix.md.
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

  const [attempt, setAttempt] = useState(0)
  const load = () => setAttempt(previous => previous + 1)

  useEffect(() => {
    const controller = new AbortController()
    setOrders(null)
    setError("")
    listOrders("open", controller.signal)
      .then(result => { if (!controller.signal.aborted) setOrders(result) })
      .catch(err => { if (!controller.signal.aborted) setError(orderError(err)) })
    return () => controller.abort()
  }, [attempt])

  // quietly pick up new requests from other students without the loading flash
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) listOrders("open").then(setOrders).catch(() => {})
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-[#162A46]">Open Requests</h1>
          <p className="text-sm text-[#3F6B5A]">Help another student with an errand on campus.</p>
        </div>
        <div className="flex gap-3">
        <button onClick={load} disabled={!orders && !error} className="rounded-lg border border-[#E4E8E6] px-4 py-2.5 text-sm text-[#1A4A36] disabled:opacity-50">Refresh requests</button>
        <button onClick={() => onNavigate("create-request")} className="rounded-lg bg-[#1A4A36] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#163D2C]">Create Request</button>
        </div>
      </div>
      {orders && <p role="status" className="mb-4 text-xs text-[#3F6B5A]">{orders.length} open request{orders.length === 1 ? "" : "s"}</p>}
      {!orders ? (
        <LoadMessage error={error} onRetry={load} />
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-1 text-sm font-medium text-[#162A46]">No errands from other students right now</p>
          <p className="text-xs text-[#3F6B5A]">Only other students’ unassigned, unexpired requests appear here. Your own requests are in My Orders.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {orders.map((order) => <RequestCard key={order.id} order={order} onClick={() => onSelectOrder(order)} />)}
        </div>
      )}
    </div>
  )
}