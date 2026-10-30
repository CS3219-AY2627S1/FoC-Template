import { useEffect, useState } from "react"
import type { User, Page } from "../App"
import StatusBadge from "../components/StatusBadge"
import { getAllOrders, orderStatus as badgeStatus, type ApiOrder } from "../api/orders"

type Section = "overview" | "orders" | "users" | "suppliers" | "logs"

const MOCK_USERS = [
  { id: "u1", name: "Jordan Tan",  email: "jordan.tan@u.nus.edu",  credits: 24, requests: 8,  deliveries: 12, status: "active" },
  { id: "u2", name: "Aisha Lim",   email: "aisha.lim@u.nus.edu",   credits: 18, requests: 3,  deliveries: 5,  status: "active" },
  { id: "u3", name: "Marcus Goh",  email: "marcus.goh@u.nus.edu",  credits: 31, requests: 11, deliveries: 8,  status: "active" },
  { id: "u4", name: "Priya Nair",  email: "priya.nair@u.nus.edu",  credits: 7,  requests: 6,  deliveries: 2,  status: "active" },
  { id: "u5", name: "Ryan Chen",   email: "ryan.chen@u.nus.edu",   credits: 42, requests: 2,  deliveries: 20, status: "active" },
  { id: "u6", name: "Wei Lin",     email: "wei.lin@u.nus.edu",     credits: 15, requests: 4,  deliveries: 4,  status: "suspended" },
]

const MOCK_SUPPLIERS = [
  { id: "s1", name: "CoffeeBean",       location: "COM3",           type: "F&B" },
  { id: "s2", name: "Cheers",           location: "UTown",           type: "Convenience" },
  { id: "s3", name: "Science Canteen",  location: "Science Faculty", type: "F&B" },
  { id: "s4", name: "Print Lab",        location: "Engineering",     type: "Services" },
  { id: "s5", name: "YST Canteen",      location: "YST",             type: "F&B" },
  { id: "s6", name: "CLB Bookshop",     location: "Central Library", type: "Retail" },
]

const MOCK_LOGS = [
  { id: 1, action: "Order accepted",   detail: "#o1 accepted by Jordan Tan",             time: "2:51 PM",  type: "order" },
  { id: 2, action: "New request",      detail: "#o6 created by Priya Nair",              time: "1:00 PM",  type: "order" },
  { id: 3, action: "Order completed",  detail: "#o5 completed — +4 credits to Sofia Park",time: "5:45 PM", type: "credit" },
  { id: 4, action: "User registered",  detail: "wei.lin@u.nus.edu joined CampusDash",        time: "Sep 9",    type: "user" },
  { id: 5, action: "Supplier added",   detail: "CLB Bookshop added by admin",             time: "Sep 8",    type: "supplier" },
  { id: 6, action: "Order expired",    detail: "#o2 expired — no courier found",          time: "Sep 8",    type: "order" },
]

const LOG_COLORS: Record<string, string> = {
  order:    "bg-blue-50 text-blue-500",
  credit:   "bg-[#E8F1ED] text-[#1A4A36]",
  user:     "bg-purple-50 text-purple-500",
  supplier: "bg-amber-50 text-amber-500",
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

const shortId = (id: string) => id.slice(0, 8)

interface Props {
  user: User
  onNavigate: (page: Page) => void
}

export default function AdminPage({ user, onNavigate }: Props) {
  const [section, setSection]           = useState<Section>("overview")
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [suppliers, setSuppliers]       = useState(MOCK_SUPPLIERS)
  const [newSupplier, setNewSupplier]   = useState({ name: "", location: "", type: "" })

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
    { key: "logs",       label: "Activity Logs" },
  ]

  const thCls = "text-left px-4 py-3 text-[11px] font-semibold text-[#3F6B5A] uppercase tracking-wider whitespace-nowrap border-b border-[#E4E8E6]"
  const tdCls = "px-4 py-3 text-xs text-[#1B2522]"

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
            <span className="text-sm font-semibold text-[#162A46] capitalize">{section.replace("-", " ")}</span>
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
                            { label: "Pickup",     value: `${selectedOrder.pickupStore}, ${selectedOrder.pickupLocation}` },
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

          {/* ── USERS ── */}
          {section === "users" && (
            <div>
              <h2 className="text-sm font-semibold text-[#162A46] mb-5">User Management</h2>
              <div className="bg-white border border-[#E4E8E6] rounded-xl overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {["Student", "Email", "Credits", "Requests", "Deliveries", "Status"].map((h) => (
                        <th key={h} className={thCls}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_USERS.map((u, i) => (
                      <tr
                        key={u.id}
                        className={`hover:bg-[#F7F9F8] cursor-pointer transition-colors ${i < MOCK_USERS.length - 1 ? "border-b border-[#E4E8E6]" : ""}`}
                      >
                        <td className={tdCls}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#162A46] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                              {u.name.charAt(0)}
                            </div>
                            <span className="font-medium text-[#1B2522]">{u.name}</span>
                          </div>
                        </td>
                        <td className={`${tdCls} text-[#3F6B5A]`}>{u.email}</td>
                        <td className={`${tdCls} font-semibold text-[#162A46]`}>{u.credits}</td>
                        <td className={tdCls}>{u.requests}</td>
                        <td className={tdCls}>{u.deliveries}</td>
                        <td className={tdCls}>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              u.status === "active"
                                ? "bg-[#E8F1ED] text-[#1A4A36]"
                                : "bg-red-50 text-red-600"
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SUPPLIERS ── */}
          {section === "suppliers" && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-[#162A46]">Supplier Management</h2>
                <button
                  onClick={() => setShowAddSupplier(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#1A4A36] text-white text-xs font-medium rounded-lg hover:bg-[#163D2C] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Supplier
                </button>
              </div>
              <div className="bg-white border border-[#E4E8E6] rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr>
                      {["Name", "Location", "Type", "Actions"].map((h) => (
                        <th key={h} className={thCls}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s, i) => (
                      <tr key={s.id} className={`hover:bg-[#F7F9F8] transition-colors ${i < suppliers.length - 1 ? "border-b border-[#E4E8E6]" : ""}`}>
                        <td className={`${tdCls} font-medium`}>{s.name}</td>
                        <td className={`${tdCls} text-[#3F6B5A]`}>{s.location}</td>
                        <td className={tdCls}>
                          <span className="bg-[#F7F9F8] border border-[#E4E8E6] px-2 py-0.5 rounded text-[10px] text-[#3F6B5A] font-medium">
                            {s.type}
                          </span>
                        </td>
                        <td className={tdCls}>
                          <div className="flex gap-4">
                            <button className="text-[#3F6B5A] hover:text-[#1A4A36] transition-colors text-xs font-medium">
                              Edit
                            </button>
                            <button
                              onClick={() => setSuppliers((prev) => prev.filter((x) => x.id !== s.id))}
                              className="text-red-400 hover:text-red-600 transition-colors text-xs font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add supplier modal */}
              {showAddSupplier && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                    <h3 className="text-base font-semibold text-[#162A46] mb-5">Add Supplier</h3>
                    <div className="space-y-4 mb-5">
                      {[
                        { k: "name",     label: "Name",     ph: "e.g. CoffeeBean" },
                        { k: "location", label: "Location", ph: "e.g. COM3" },
                        { k: "type",     label: "Type",     ph: "e.g. F&B" },
                      ].map(({ k, label, ph }) => (
                        <div key={k}>
                          <label className="block text-xs font-medium text-[#1B2522] mb-1.5">{label}</label>
                          <input
                            placeholder={ph}
                            value={newSupplier[k as keyof typeof newSupplier]}
                            onChange={(e) => setNewSupplier((p) => ({ ...p, [k]: e.target.value }))}
                            className="w-full px-3.5 py-2.5 border border-[#E4E8E6] rounded-lg text-sm text-[#1B2522] bg-white focus:outline-none focus:border-[#1A4A36] focus:ring-1 focus:ring-[#1A4A36] transition-colors"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setShowAddSupplier(false); setNewSupplier({ name: "", location: "", type: "" }) }}
                        className="flex-1 py-2.5 border border-[#E4E8E6] text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (newSupplier.name && newSupplier.location) {
                            setSuppliers((p) => [...p, { id: `s${Date.now()}`, ...newSupplier }])
                            setShowAddSupplier(false)
                            setNewSupplier({ name: "", location: "", type: "" })
                          }
                        }}
                        className="flex-1 py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] transition-colors"
                      >
                        Add Supplier
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ACTIVITY LOGS ── */}
          {section === "logs" && (
            <div>
              <h2 className="text-sm font-semibold text-[#162A46] mb-5">Activity Logs</h2>
              <div className="bg-white border border-[#E4E8E6] rounded-xl overflow-hidden">
                {MOCK_LOGS.map((log, i) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-4 px-5 py-4 ${i < MOCK_LOGS.length - 1 ? "border-b border-[#E4E8E6]" : ""}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${LOG_COLORS[log.type]}`}>
                      <div className="w-2 h-2 rounded-full bg-current" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1B2522]">{log.action}</p>
                      <p className="text-xs text-[#3F6B5A]">{log.detail}</p>
                    </div>
                    <span className="text-xs text-[#9CA3AF] flex-shrink-0 whitespace-nowrap">{log.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}