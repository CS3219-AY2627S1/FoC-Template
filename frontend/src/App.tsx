/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-14
 * Scope (AI-15): Implemented and tested the requested create-account UI.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-17
 * Scope (AI-18): Built and tested the requested errand creation preview and entry points.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { Route, Routes } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { PublicOnlyRoute, RequireAdmin, RequireAuth } from './features/auth/AuthRoutes'
import { CreateErrandPage } from './pages/CreateErrandPage'
import { DashboardPage } from './pages/DashboardPage'
import { ErrandDetailsPage } from './pages/ErrandDetailsPage'
import { LoginPage } from './pages/LoginPage'
import { MyErrandsPage } from './pages/MyErrandsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RegisterPage } from './pages/RegisterPage'
import { SuppliersPage } from './pages/SuppliersPage'
import { ChatsPage } from './pages/ChatsPage'
import { ChatPage } from './pages/ChatPage'
import { CreditHistoryPage } from './pages/CreditHistoryPage'
import { AdminPage } from './pages/AdminPage'
import { RagPage } from './pages/RagPage'


function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<RequireAdmin />}>
          <Route path="admin/*" element={<AdminPage />} />
        </Route>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="my-errands" element={<MyErrandsPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="credit-history" element={<CreditHistoryPage />} />
          <Route path="chats" element={<ChatsPage />} />
          <Route path="chats/:conversationId" element={<ChatPage />} />
          <Route path="assistant" element={<RagPage />} />
          <Route path="errands/new" element={<CreateErrandPage />} />
          <Route path="errands/:errandId" element={<ErrandDetailsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
