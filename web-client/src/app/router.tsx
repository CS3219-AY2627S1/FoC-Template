import { createBrowserRouter, Navigate } from 'react-router'
import { features } from './features'
import { RootLayout } from './layouts/RootLayout'
import { DevUiPage } from './pages/DevUiPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { RequireAdmin } from './guards/RequireAdmin'
import { RequireGuest } from './guards/RequireGuest'
import { RequireSession } from './guards/RequireSession'
import { AdminShell } from './layouts/AdminShell'
import { AuthLayout } from './layouts/AuthLayout'
import { AppShell } from './layouts/AppShell'

const guestRoutes = features.flatMap((feature) => feature.guest ?? [])
const appRoutes = features.flatMap((feature) => feature.app ?? [])
const adminRoutes = features.flatMap((feature) => feature.admin ?? [])

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    ErrorBoundary: RouteErrorPage,
    children: [
      // Signed-out pages such as login: only for guests, in the narrow auth layout.
      {
        Component: RequireGuest,
        children: [{ Component: AuthLayout, children: guestRoutes }],
      },
      // The student app: only for logged-in accounts.
      {
        Component: RequireSession,
        children: [
          {
            Component: AppShell,
            children: [{ index: true, element: <Navigate to="/errands" replace /> }, ...appRoutes],
          },
        ],
      },
      // The admin console. Reached only by typing /admin/..., the student app never links here.
      {
        path: 'admin',
        Component: RequireSession,
        children: [
          {
            Component: RequireAdmin,
            children: [
              {
                Component: AdminShell,
                children: [{ index: true, element: <Navigate to="/admin/orders" replace /> }, ...adminRoutes],
              },
            ],
          },
        ],
      },
      // The gallery only exists in development. In a production build this branch is
      // removed completely, so the page is not even shipped.
      ...(import.meta.env.DEV ? [{ path: '_dev/ui', Component: DevUiPage }] : []),
      { path: '*', Component: NotFoundPage },
    ],
  },
])