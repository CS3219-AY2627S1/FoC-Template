// AI-assisted (Claude Opus 5.5), 2026-11-12: pickup shows store name, not coordinates; see ui/ai-usage/usage-log.md, entry 002
import { useEffect, useState } from "react"
import type { User, Page } from "../App"
import StatusBadge from "../components/StatusBadge"
import UsersSection from "../components/admin/UsersSection"
import SuppliersSection from "../components/admin/SuppliersSection"
import FlagsSection from "../components/admin/FlagsSection"
import { tdCls, thCls } from "../components/admin/table"
import { getAllOrders, orderStatus as badgeStatus, type ApiOrder } from "../api/orders"

type Section = "overview" | "orders" | "users" | "suppliers" | "flags"

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

const shortId = (id: string) => id.slice(0, 8)

interface Props {
  user: User
  onNavigate: (page: Page) => void
}

export default function AdminPage({ user, onNavigate }: Props) {
  const [section, setSection]           = useState<Section>("overview")

  const [orders, setOrders]             = useState<ApiOrder[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState("")

  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<ApiOrder | null>(null)

  const loadOrders = () => {
    setLoading(true)
    setError("")
    getAllOrders()
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load orders."))
      .finally(() => setLoading(false))
  }

  useEffect(loadOrders, [])

  // the list already has every field, so details come straight from it
  const openOrder = (id: string) => {
    setSelectedId(id)
    setSelectedOrder(orders.find((o) => o.id === id) ?? null)
  }

  const closeOrder = () => {
    setSelectedId(null)
    setSelectedOrder(null)
  }

  const NAV: { key: Section; label: string }[] = [
    { key: "overview",   label: "Overview" },
    { key: "orders",     label: "Orders" },
    { key: "users",      label: "Users" },
    { key: "suppliers",  label: "Suppliers" },
    { key: "flags",      label: "Flagged Chats" },
  ]

  // Loading / error / empty row for the order tables, or null once there's data to show
  const ordersMessage = (colSpan: number, empty: boolean) => {
    if (!loading && !error && !empty) return null
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-10 text-center text-xs text-[#3F6B5A]">
          {loading ? "Loading orders…" : error ? (
            <>
              <p className="text-red-600 mb-2">{error}</p>
              <button onClick={loadOrders} className="font-semibold text-[#1A4A36] underline">Try again</button>
            </>
          ) : orders.length === 0 ? "No orders yet." : "No orders match your filters."}
        </td>
      </tr>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F9F8] flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-52 bg-white border-r border-[#E4E8E6] flex-shrink-0 sticky top-0 h-screen">
        <div className="p-5 border-b border-[#E4E8E6]">
          <button
            onClick={() => onNavigate("orders")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 bg-[#1A4A36] rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-[#162A46]">CampusDash</p>
              <p className="text-[10px] text-[#3F6B5A]">Admin Console</p>
            </div>
          </button>
        </div>

        <nav className="p-2.5 flex-1">
          {NAV.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
                section === key
                  ? "bg-[#E8F1ED] text-[#1A4A36]"
                  : "text-[#1B2522] hover:bg-[#F7F9F8]"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#E4E8E6]">
          <button
            onClick={() => onNavigate("orders")}
            className="text-xs text-[#3F6B5A] hover:text-[#1A4A36] flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to App
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <div className="bg-white border-b border-[#E4E8E6] px-6 h-14 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {/* Mobile sidebar toggle placeholder */}
            <span className="text-sm font-semibold text-[#162A46]">{NAV.find((n) => n.key === section)?.label}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[#3F6B5A] hidden sm:block">Admin: {user.name}</span>
            <div className="w-7 h-7 rounded-full bg-[#162A46] text-white text-[10px] font-semibold flex items-center justify-center">
              {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
          </div>
        </div>

        <div className="p-6 flex-1">

          {/* ── OVERVIEW ── */}
          {section === "overview" && (
            <div>
              <h3 className="text-sm font-semibold text-[#162A46] mb-4">Recent Orders</h3>
              <div className="bg-white border border-[#E4E8E6] rounded-xl overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {["Order ID", "Requester", "Courier", "Pickup", "Status", "Credits", "Created"].map((h) => (
                        <th key={h} className={thCls}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ordersMessage(7, orders.length === 0) ?? orders.slice(0, 6).map((order, i, recent) => (
                      <tr
                        key={order.id}
                        onClick={() => { openOrder(order.id); setSection("orders") }}
                        className={`cursor-pointer hover:bg-[#F7F9F8] transition-colors ${i < recent.length - 1 ? "border-b border-[#E4E8E6]" : ""}`}
                      >
                        <td className={`${tdCls} font-mono text-[11px] text-[#3F6B5A]`}>#{shortId(order.id)}</td>
                        <td className={`${tdCls} font-medium`}>{order.requesterName}</td>
                        <td className={`${tdCls} text-[#3F6B5A]`}>{order.courierName || "—"}</td>
                        <td className={tdCls}>{order.pickupStore}</td>
                        <td className={tdCls}><StatusBadge status={badgeStatus(order)} /></td>
                        <td className={`${tdCls} font-semibold text-[#162A46]`}>{order.credits}</td>
                        <td className={`${tdCls} text-[#9CA3AF] whitespace-nowrap`}>{formatTime(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ORDERS ── */}
          {section === "orders" && (
            <div className="flex gap-5">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-5">
                  <h2 className="text-sm font-semibold text-[#162A46] flex-1">Order History</h2>
                </div>
                <div className="bg-white border border-[#E4E8E6] rounded-xl overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        {["ID", "Requester", "Courier", "Route", "Status", "Credits", "Created"].map((h) => (
                          <th key={h} className={thCls}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ordersMessage(7, orders.length === 0) ?? orders.map((order, i) => (
                        <tr
                          key={order.id}
                          onClick={() => openOrder(order.id)}
                          className={`cursor-pointer transition-colors ${
                            selectedId === order.id
                              ? "bg-[#E8F1ED]"
                              : "hover:bg-[#F7F9F8]"
                          } ${i < orders.length - 1 ? "border-b border-[#E4E8E6]" : ""}`}
                        >
                          <td className={`${tdCls} font-mono text-[11px] text-[#3F6B5A]`}>#{shortId(order.id)}</td>
                          <td className={`${tdCls} font-medium`}>{order.requesterName}</td>
                          <td className={`${tdCls} text-[#3F6B5A]`}>{order.courierName || "—"}</td>
                          <td className={tdCls}>
                            <span className="whitespace-nowrap">{order.pickupStore} → {order.destination}</span>
                          </td>
                          <td className={tdCls}><StatusBadge status={badgeStatus(order)} /></td>
                          <td className={`${tdCls} font-semibold text-[#162A46]`}>{order.credits}</td>
                          <td className={`${tdCls} text-[#9CA3AF] whitespace-nowrap`}>{formatTime(order.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Side panel */}
              {selectedId && (
                <div className="w-64 flex-shrink-0">
                  <div className="bg-white border border-[#E4E8E6] rounded-xl p-5 sticky top-20">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-xs font-mono text-[#9CA3AF]">#{shortId(selectedId)}</p>
                        <h3 className="text-sm font-semibold text-[#162A46]">Order details</h3>
                      </div>
                      <button
                        onClick={closeOrder}
                        className="text-[#9CA3AF] hover:text-[#1B2522] transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {!selectedOrder ? (
                      <p className="text-xs text-[#3F6B5A]">This order is no longer in the list.</p>
                    ) : (
                      <>
                        <div className="mb-4">
                          <StatusBadge status={badgeStatus(selectedOrder)} />
                        </div>
                        <div className="space-y-3">
                          {[
                            { label: "Requester",  value: selectedOrder.requesterName },
                            { label: "Courier",    value: selectedOrder.courierName || "Not assigned" },
                            { label: "Pickup",     value: selectedOrder.pickupStore },
                            { label: "Delivery",   value: selectedOrder.destination },
                            { label: "Details",    value: selectedOrder.requestDetails },
                            { label: "Credits",    value: `${selectedOrder.credits}` },
                            { label: "Created",    value: formatTime(selectedOrder.createdAt) },
                            { label: "Expires",    value: formatTime(selectedOrder.expiryTime) },
                            { label: "Accepted",   value: selectedOrder.acceptedAt && formatTime(selectedOrder.acceptedAt) },
                            { label: "Picked up",  value: selectedOrder.pickedUpAt && formatTime(selectedOrder.pickedUpAt) },
                            { label: "Delivered",  value: selectedOrder.deliveredAt && formatTime(selectedOrder.deliveredAt) },
                            { label: "Cancelled",  value: selectedOrder.cancelledAt && formatTime(selectedOrder.cancelledAt) },
                            { label: "Reason",     value: selectedOrder.cancellationReason },
                          ].filter(({ value }) => value).map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[10px] text-[#3F6B5A] font-semibold uppercase tracking-wider mb-0.5">{label}</p>
                              <p className="text-xs text-[#1B2522] leading-relaxed">{value}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {section === "users" && <UsersSection currentUserId={user.id} />}
          {section === "suppliers" && <SuppliersSection />}
          {section === "flags" && <FlagsSection />}

        </div>
      </div>
    </div>
  )
}