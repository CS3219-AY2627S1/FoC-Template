/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component App.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Added the three admin supplier routes (list, new, edit). No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
 */

import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import TopNav from './components/TopNav'
import Footer from './components/Footer'
import LoginModal from './components/LoginModal'
import DemoControls from './components/DemoControls'
import ChatBubble from './components/ChatBubble'
import Landing from './pages/Landing'
import Suppliers from './pages/Suppliers'
import SupplierDetail from './pages/SupplierDetail'
import CreateRequest from './pages/CreateRequest'
import RequestBoard from './pages/RequestBoard'
import Activity from './pages/Activity'
import Chat from './pages/Chat'
import Wallet from './pages/Wallet'
import AdminSuppliers from './pages/AdminSuppliers'
import AdminSupplierForm from './pages/AdminSupplierForm'

function ScrollToTop() {
  const { pathname } = useLocation()
  // Block body: an implicit return makes React treat the result as a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  const { pathname } = useLocation()
  // The chat thread fills the viewport, so it does not carry the marketing footer.
  const showFooter = !pathname.startsWith('/chat')

  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <TopNav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/suppliers/:id" element={<SupplierDetail />} />
          <Route path="/requests/new" element={<CreateRequest />} />
          <Route path="/requests" element={<RequestBoard />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/chat" element={<Navigate to="/chat/r6" replace />} />
          <Route path="/chat/:id" element={<Chat />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/admin/suppliers" element={<AdminSuppliers />} />
          <Route path="/admin/suppliers/new" element={<AdminSupplierForm />} />
          <Route path="/admin/suppliers/:id/edit" element={<AdminSupplierForm />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showFooter && <Footer />}
      <LoginModal />
      <ChatBubble />
      <DemoControls />
    </div>
  )
}
