import { useEffect, useState } from "react"
import Navbar from "./components/Navbar"
import LoginPage from "./pages/LoginPage"
import SignupPage from "./pages/SignupPage"
import OrdersPage from "./pages/OrdersPage"
import MyOrdersPage from "./pages/MyOrdersPage"
import CreateRequestPage from "./pages/CreateRequestPage"
import OrderDetailsPage from "./pages/OrderDetailsPage"
import AcceptedOrderPage from "./pages/AcceptedOrderPage"
import ProfilePage from "./pages/ProfilePage"
import AdminPage from "./pages/AdminPage"
import SuppliersPage from "./pages/SuppliersPage"
import { getMe, logout, type ApiUser } from "./api/users"
import { getBalance } from "./api/credits"
import { refreshToken } from "./api/client"

export type Page =
  | "login"
  | "signup"
  | "orders"
  | "my-orders"
  | "create-request"
  | "create-success"
  | "order-details"
  | "accepted-order"
  | "errand-complete"
  | "profile"
  | "admin"
  | "suppliers"

export interface Order {
  id: string
  pickupLocation: string
  pickupStore: string
  deliveryLocation: string
  description: string
  credits: number
  deadline: string
  status: "open" | "accepted" | "picked-up" | "delivered" | "cancelled" | "expired"
  requesterId: string
  requesterName: string
  courierId?: string
  courierName?: string
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  credits: number | null  // null until credit-service answers
  memberSince: string
  isAdmin: boolean
}

const CURRENT_USER: User = {
  id: "u1",
  name: "Jordan Tan",
  email: "jordan.tan@u.nus.edu",
  credits: null,
  memberSince: "September 2026",
  isAdmin: false,
}

const fromApiUser = (u: ApiUser): User => ({
  ...CURRENT_USER,
  id: u.id,
  name: `${u.firstName} ${u.lastName}`,
  email: u.email,
  memberSince: new Date(u.createdAt).toLocaleDateString("en-SG", { month: "long", year: "numeric" }),
  isAdmin: u.roles.includes("ADMINISTRATOR"),
})

function SuccessScreen({
  title,
  subtitle,
  accent,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  title: string
  subtitle: string
  accent?: string
  primaryLabel: string
  secondaryLabel?: string
  onPrimary: () => void
  onSecondary?: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <div className="text-center max-w-xs mx-auto">
        <div className="w-14 h-14 rounded-full bg-[#E8F1ED] flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-[#1A4A36]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[#162A46] mb-1">{title}</h2>
        {accent && <p className="text-2xl font-bold text-[#1A4A36] mb-1">{accent}</p>}
        <p className="text-sm text-[#3F6B5A] mb-8 leading-relaxed">{subtitle}</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onPrimary}
            className="w-full py-2.5 px-4 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] transition-colors"
          >
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="w-full py-2.5 px-4 border border-[#E4E8E6] bg-white text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage]           = useState<Page>("login")
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [user, setUser]           = useState<User>(CURRENT_USER)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [earnedCredits, setEarnedCredits] = useState(0)
  const [createPending, setCreatePending] = useState(false)
  const [loginNotice, setLoginNotice] = useState("")

  const [orderReturnPage, setOrderReturnPage] = useState<"orders" | "my-orders">("orders")

  const navigate = (p: Page, order?: Order) => {
    if (p === "order-details" && (page === "orders" || page === "my-orders")) setOrderReturnPage(page)
    if (order) setSelectedOrder(order)
    setPage(p)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  // keeps the mock user if user-service isn't running
  const loadUser = () => getMe()
    .then((u) => setUser((prev) => ({ ...fromApiUser(u), credits: prev.credits })))
    .catch(() => {})

  // balance shows as "–" if credit-service is down or has no account for this user yet
  const loadCredits = () => getBalance()
    .then((b) => setUser((prev) => ({ ...prev, credits: b.availableCredits })))
    .catch(() => setUser((prev) => ({ ...prev, credits: null })))

  // creating, delivering and cancelling all move credits, so refresh on every page change
  useEffect(() => {
    if (isLoggedIn) loadCredits()
  }, [page, isLoggedIn])

  // Stay logged in across reloads if the refresh cookie is still valid
  useEffect(() => {
    refreshToken()
      .then((token) => {
        if (!token) return
        setIsLoggedIn(true)
        setPage("orders")
        loadUser()
      })
      .finally(() => setCheckingSession(false))
  }, [])

  const handleLogin = () => {
    setIsLoggedIn(true)
    loadUser()
    navigate("orders")
  }

  const handleLogout = () => {
    logout().catch(() => {})
    localStorage.removeItem("token")
    setUser(CURRENT_USER)
    setIsLoggedIn(false)
    navigate("login")
  }

  const handleDelivered = (order: Order) => {
    setEarnedCredits(order.credits)
    navigate("errand-complete")
  }

  if (checkingSession) return null

  // Unauthenticated
  if (!isLoggedIn) {
    if (page === "signup") {
      return (
        <SignupPage
          onLogin={handleLogin}
          onRegistered={() => { setLoginNotice("Account created! Log in to continue."); navigate("login") }}
          onNavigate={navigate}
        />
      )
    }
    return <LoginPage notice={loginNotice} onLogin={handleLogin} onNavigate={navigate} />
  }

  // Admin is a full-screen layout without the main Navbar
  if (page === "admin" && user.isAdmin) {
    return <AdminPage user={user} onNavigate={navigate} />
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar user={user} currentPage={page} onNavigate={navigate} onLogout={handleLogout} />

      <main className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        {page === "orders" && (
          <OrdersPage onNavigate={navigate} onSelectOrder={(order) => navigate("order-details", order)} />
        )}

        {page === "my-orders" && (
          <MyOrdersPage onSelectOrder={(order) => navigate("order-details", order)} />
        )}

        {page === "create-request" && (
          <CreateRequestPage
            user={user}
            onNavigate={navigate}
            onCreated={(pending) => {
              setCreatePending(pending)
              navigate("create-success")
            }}
          />
        )}

        {page === "create-success" && (
          <SuccessScreen
            title={createPending ? "Request submitted" : "Request created"}
            subtitle={createPending
              ? "We're still reserving your credits. It'll show up in My Orders once that's done."
              : "Your request is now visible to available couriers."}
            primaryLabel="Back to Orders"
            secondaryLabel="View Requests"
            onPrimary={() => navigate("orders")}
            onSecondary={() => { navigate("my-orders") }}
          />
        )}

        {page === "order-details" && selectedOrder && (
          <OrderDetailsPage
            key={selectedOrder.id}
            initialOrder={selectedOrder}
            currentUserId={user.id}
            onBack={() => navigate(orderReturnPage)}
            onAccepted={(order) => navigate("accepted-order", order)}
            onDelivered={handleDelivered}
          />
        )}

        {page === "accepted-order" && selectedOrder && (
          <AcceptedOrderPage
            key={selectedOrder.id}
            initialOrder={selectedOrder}
            onDelivered={handleDelivered}
            onBack={() => navigate("orders")}
          />
        )}

        {page === "errand-complete" && (
          <SuccessScreen
            title="Errand completed"
            accent={`+${earnedCredits} Credits`}
            subtitle="Credits have been added to your balance."
            primaryLabel="Back to Orders"
            onPrimary={() => navigate("orders")}
          />
        )}

        {page === "suppliers" && <SuppliersPage />}

        {page === "profile" && (
          <ProfilePage
            user={user}
            onNavigate={navigate}
            onLogout={handleLogout}
          />
        )}
      </main>
    </div>
  )
}