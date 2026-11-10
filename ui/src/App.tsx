/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-13
Scope: Generated the initial React, Vite, and TypeScript scaffold
Author review: I reviewed correctness and edited the generated scaffold to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Added the profile route and shared account layout
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Added the admin manager portal page route
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-10-27
Scope: Added the credit audit-log page route
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import ProtectedLayout from './components/protectedLayout/ProtectedLayout'
import ProtectedRoutes from './components/protectedRoutes/ProtectedRoutes'
import AdminManagerPortal from './pages/adminManagerPortal/AdminManagerPortal'
import SignIn from './pages/authentication/signIn/SignIn'
import SignUp from './pages/authentication/signUp/SignUp'
import CreditAuditLogs from './pages/creditAuditLogs/CreditAuditLogs'
import Home from './pages/home/Home'
import Orders from './pages/orders/Orders'
import OrderOperations from './pages/orderOperations/OrderOperations'
import Profile from './pages/profile/Profile'
import Suppliers from './pages/suppliers/Suppliers'
import { routes } from './routes'
import OrderAuditLogs from "./pages/orderAuditLogs/OrderAuditLogs.tsx";

const appRoutes: RouteObject[] = [
  { path: routes.signIn, element: <SignIn /> },
  { path: routes.signUp, element: <SignUp /> },
  {
    element: <ProtectedRoutes />,
    children: [
      {
        element: <ProtectedLayout />,
        children: [
          { path: routes.home, element: <Home /> },
          { path: routes.orders, element: <Orders /> },
          { path: routes.orderOperations, element: <OrderOperations /> },
          { path: routes.profile, element: <Profile /> },
          { path: routes.creditAuditLogs, element: <CreditAuditLogs /> },
          { path: routes.orderAuditLogs, element: <OrderAuditLogs /> },
          { path: routes.adminManagerPortal, element: <AdminManagerPortal /> },
          { path: routes.suppliers, element: <Suppliers /> },
        ],
      },
    ],
  },
  { path: '*', element: <p>Page not found.</p> },
]

const router = createBrowserRouter(appRoutes)

const App = () => <RouterProvider router={router} />

export default App
