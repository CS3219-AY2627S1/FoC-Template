/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useState } from 'react'
import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import AppNavigation, { type UserMode } from './components/AppNavigation'
import AccountPage from './pages/AccountPage.tsx'
import AdminDashboardPage from './pages/AdminDashboardPage.tsx'
import CreditsPage from './pages/CreditsPage.tsx'
import CreateSupplierPage from './pages/CreateSupplierPage.tsx'
import EditSupplierPage from './pages/EditSupplierPage.tsx'
import HomePage from './pages/HomePage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import FulfilRequestsPage from './pages/FulfilRequestsPage.tsx'
import MyRequestsPage from './pages/MyRequestsPage.tsx'
import MyTasksPage from './pages/MyTasksPage.tsx'
import OrderDetailsPage from './pages/OrderDetailsPage.tsx'
import RegisterPage from './pages/RegisterPage.tsx'
import RequestCreationPage from './pages/RequestCreationPage.tsx'
import SupplierDetailPage from './pages/SupplierDetailPage.tsx'
import SupplierListPage from './pages/SupplierListPage'
import theme from './theme'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { RequireAuth, RequireRole } from './auth/RouteGuards'

const requesterPageBackground = {
  bgcolor: '#F3F5F7',
  backgroundImage:
    'radial-gradient(circle at 0% 0%, rgba(23, 63, 95, 0.07) 0%, rgba(243, 245, 247, 0) 34%)',
}

const courierPageBackground = {
  bgcolor: '#F2F6F5',
  backgroundImage:
    'radial-gradient(circle at 0% 0%, rgba(31, 98, 94, 0.08) 0%, rgba(242, 246, 245, 0) 34%)',
}

// Neutral page with a soft warm wash — not a bright yellow fill.
const adminPageBackground = {
  bgcolor: '#F5F3F0',
  backgroundImage:
    'radial-gradient(circle at 0% 0%, rgba(194, 65, 12, 0.07) 0%, rgba(245, 243, 240, 0) 40%)',
}

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading, isAdmin, availableModes } = useAuth()
  const isPublicPage =
    location.pathname === '/login' || location.pathname === '/register'
  // TODO: Load and persist the active mode through the team's User Service.
  const [preferredMode, setPreferredMode] = useState<UserMode>('requester')

  const mode: UserMode = availableModes.includes(preferredMode)
    ? preferredMode
    : (availableModes[0] ?? preferredMode)

  const pageBackground =
    mode === 'courier'
      ? courierPageBackground
      : mode === 'admin'
        ? adminPageBackground
        : requesterPageBackground

  function handleModeChange(newMode: UserMode) {
    if (newMode === mode) {
      return
    }

    setPreferredMode(newMode)
    navigate(newMode === 'admin' ? '/admin' : '/home')
  }

  /** Home shortcuts: switch workspace first so mode-gated routes (e.g. /fulfil) do not bounce back. */
  function enterWorkspace(targetMode: UserMode, path: string) {
    setPreferredMode(targetMode)
    navigate(path)
  }

  if (loading) {
    return (
      <Box sx={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box
      sx={{
        minHeight: '100svh',
        ...pageBackground,
        pb: isPublicPage ? 0 : { xs: 8, md: 0 },
      }}
    >
      {!isPublicPage && user && (
        <AppNavigation mode={mode} onModeChange={handleModeChange} />
      )}
      <Routes>
        <Route
          path="/"
          element={<Navigate to={user ? '/home' : '/login'} replace />}
        />

        <Route
          path="/login"
          element={user ? <Navigate to="/home" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/home" replace /> : <RegisterPage />}
        />

        <Route
          path="/home"
          element={
            <RequireAuth>
              <HomePage onWorkspaceNavigate={enterWorkspace} />
            </RequireAuth>
          }
        />
        <Route
          path="/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route
          path="/credits"
          element={
            <RequireAuth>
              <CreditsPage />
            </RequireAuth>
          }
        />

        <Route
          path="/requests"
          element={
            <RequireRole roles={['REQUESTER']}>
              <MyRequestsPage />
            </RequireRole>
          }
        />

        <Route
          path="/requests/new"
          element={
            <RequireRole roles={['REQUESTER']}>
              <RequestCreationPage mode={mode} />
            </RequireRole>
          }
        />

        <Route
          path="/requests/:orderId"
          element={
            <RequireRole roles={['REQUESTER']}>
              <OrderDetailsPage />
            </RequireRole>
          }
        />

        <Route
          path="/fulfil"
          element={
            <RequireRole roles={['COURIER']}>
              {mode === 'courier' ? (
                <FulfilRequestsPage />
              ) : (
                <Navigate to="/home" replace />
              )}
            </RequireRole>
          }
        />
        <Route
          path="/fulfil/:orderId"
          element={
            <RequireRole roles={['COURIER']}>
              {mode === 'courier' ? (
                <OrderDetailsPage />
              ) : (
                <Navigate to="/home" replace />
              )}
            </RequireRole>
          }
        />

        <Route
          path="/my-tasks"
          element={
            <RequireRole roles={['COURIER']}>
              {mode === 'courier' ? (
                <MyTasksPage />
              ) : (
                <Navigate to="/home" replace />
              )}
            </RequireRole>
          }
        />
        <Route
          path="/my-tasks/:orderId"
          element={
            <RequireRole roles={['COURIER']}>
              {mode === 'courier' ? (
                <OrderDetailsPage />
              ) : (
                <Navigate to="/home" replace />
              )}
            </RequireRole>
          }
        />

        <Route
          path="/admin"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/orders/:orderId"
          element={
            <RequireRole roles={['ADMIN']}>
              <OrderDetailsPage />
            </RequireRole>
          }
        />

        <Route
          path="/suppliers"
          element={
            <RequireRole roles={['REQUESTER', 'ADMIN']}>
              <SupplierListPage isAdmin={isAdmin} />
            </RequireRole>
          }
        />

        <Route
          path="/suppliers/new"
          element={
            <RequireRole roles={['ADMIN']}>
              <CreateSupplierPage />
            </RequireRole>
          }
        />
        <Route
          path="/suppliers/:supplierId/edit"
          element={
            <RequireRole roles={['ADMIN']}>
              <EditSupplierPage />
            </RequireRole>
          }
        />

        <Route
          path="/suppliers/:supplierId"
          element={
            <RequireRole roles={['REQUESTER', 'ADMIN']}>
              <SupplierDetailPage isAdmin={isAdmin} mode={mode} />
            </RequireRole>
          }
        />
      </Routes>
    </Box>
  )
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App