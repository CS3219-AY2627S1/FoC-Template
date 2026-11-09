/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Page routes for the author's D2 auth scope (login, register, WIP landing page).
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: replaced
 * the placeholder route with protected Supplier catalogue and detail routes for
 * issue #29. Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-27. Scope: added
 * protected Supplier administrator routes for issue #30.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-11-09. Scope: added
 * the protected member errand routes. Author review: Reviewed and approved by @mattis.
 */
import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from './components/RequireAuth'
import { CreateErrandPage } from './errands/CreateErrandPage'
import { ErrandDetailPage } from './errands/ErrandDetailPage'
import { MyErrandsPage } from './errands/MyErrandsPage'
import { OpenErrandsPage } from './errands/OpenErrandsPage'
import { RedirectIfLoggedIn } from './components/RedirectIfLoggedIn'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { SupplierDetailPage } from './suppliers/SupplierDetailPage'
import { SupplierListPage } from './suppliers/SupplierListPage'
import { SupplierAdminPage } from './suppliers/admin/SupplierAdminPage'
import { SupplierFormPage } from './suppliers/admin/SupplierFormPage'

// URL -> page table. Every Supplier and errand page requires an authenticated session.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfLoggedIn><LoginPage /></RedirectIfLoggedIn>} />
      <Route path="/register" element={<RedirectIfLoggedIn><RegisterPage /></RedirectIfLoggedIn>} />
      <Route path="/" element={<RequireAuth><Navigate to="/suppliers" replace /></RequireAuth>} />
      <Route path="/suppliers" element={<RequireAuth><SupplierListPage /></RequireAuth>} />
      <Route path="/suppliers/:id" element={<RequireAuth><SupplierDetailPage /></RequireAuth>} />
      <Route path="/suppliers/admin" element={<RequireAuth><SupplierAdminPage /></RequireAuth>} />
      <Route path="/suppliers/new" element={<RequireAuth><SupplierFormPage mode="create" /></RequireAuth>} />
      <Route path="/suppliers/:id/edit" element={<RequireAuth><SupplierFormPage mode="edit" /></RequireAuth>} />
      <Route path="/errands" element={<RequireAuth><OpenErrandsPage /></RequireAuth>} />
      <Route path="/errands/mine" element={<RequireAuth><MyErrandsPage /></RequireAuth>} />
      <Route path="/errands/new" element={<RequireAuth><CreateErrandPage /></RequireAuth>} />
      <Route path="/errands/:id" element={<RequireAuth><ErrandDetailPage /></RequireAuth>} />
      {/* Unknown URLs return to the protected catalogue. */}
      <Route path="*" element={<Navigate to="/suppliers" replace />} />
    </Routes>
  )
}
