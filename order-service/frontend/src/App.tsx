import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ArrowRight, ClipboardCheck } from 'lucide-react'
import { OrderShell } from './components/OrderShell'
import { readSession } from './auth/session'
import { signInPath } from './navigation'
import { BrowsePage } from './pages/BrowsePage'
import { CreateErrandPage } from './pages/CreateErrandPage'
import { EditErrandPage } from './pages/EditErrandPage'
import { ErrandPage } from './pages/ErrandPage'
import { MyErrandsPage } from './pages/MyErrandsPage'
import { ChatPage } from './pages/ChatPage'
import { type ErrandRole, homeFor, useSessionRole } from './hooks/useSessionRole'

function SignedOut() {
  return (
    <section className="state-panel">
      <span aria-hidden="true" className="state-icon"><ClipboardCheck /></span>
      <p className="eyebrow">Campus errands</p>
      <h2>Sign in to see errands</h2>
      <p>Request help from another student or earn credits by running an errand between classes.</p>
      <a className="sign-in-link" href={signInPath()}>
        Sign in <ArrowRight aria-hidden="true" />
      </a>
    </section>
  )
}

/** A screen for one role; the other role (or switching to it) lands on its own screen instead. */
function ForRole({ role, children }: { role: ErrandRole; children: React.ReactNode }) {
  const current = useSessionRole()
  return current === role ? children : <Navigate replace to={homeFor(current)} />
}

function RoleHome() {
  return <Navigate replace to={homeFor(useSessionRole())} />
}

export function AppRoutes() {
  if (!readSession()) return <SignedOut />
  return (
    <Routes>
      <Route element={<RoleHome />} path="/errands" />
      <Route element={<ForRole role="COURIER"><BrowsePage /></ForRole>} path="/errands/browse" />
      <Route element={<MyErrandsPage />} path="/errands/mine" />
      <Route element={<ForRole role="REQUESTER"><CreateErrandPage /></ForRole>} path="/errands/new" />
      <Route element={<ErrandPage />} path="/errands/:orderId" />
      <Route element={<ChatPage />} path="/errands/:orderId/chat" />
      <Route element={<ForRole role="REQUESTER"><EditErrandPage /></ForRole>} path="/errands/:orderId/edit" />
      <Route element={<RoleHome />} path="*" />
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <OrderShell>
        <AppRoutes />
      </OrderShell>
    </BrowserRouter>
  )
}
