/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Added Order screen routes to the existing application router.
// Author review: I validated correctness and added boundary checks where needed.

import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./use-auth";
import { AdminUserManagementPage } from "../pages/admin-user-management-page";
import { ProfilePage } from "../pages/profile-page";
import { RegistrationPage } from "../pages/registration-page";
import { SignInPage } from "../pages/sign-in-page";
import { SupplierDetailPage } from "../pages/supplier-detail-page";
import { SupplierListPage } from "../pages/supplier-list-page";
import { SupplierShell } from "../components/supplier-shell";
import { SupplierFormPage } from "../pages/supplier-form-page";
import { VerifyEmailPage } from "../pages/verify-email-page";
import { OrderListPage } from "../pages/order-list-page";
import { OrderCreatePage } from "../pages/order-create-page";
import { OrderDetailPage } from "../pages/order-detail-page";
import { WalletPage } from "../pages/wallet-page";
import { MessagesPage } from "../pages/messages-page";
import { AdminDashboardPage } from "../pages/admin-dashboard-page";
import { AdminOrdersPage } from "../pages/admin-orders-page";
import { AdminOrderDetailPage } from "../pages/admin-order-detail-page";
import { AdminDisputesPage } from "../pages/admin-disputes-page";
import { AdminDisputeDetailPage } from "../pages/admin-dispute-detail-page";

function SessionLoading() {
  return <main className="session-loading"><span className="loading-dot" />Checking your session</main>;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "restoring") return <SessionLoading />;
  return status === "authenticated" ? children : <Navigate replace to="/sign-in" />;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "restoring") return <SessionLoading />;
  return status === "authenticated" ? <Navigate replace to="/profile" /> : children;
}

function SupplierAccessDenied() {
  return (
    <SupplierShell>
      <section className="supplier-state supplier-state-error" role="alert">
        <h1>Supplier management requires an administrator</h1>
        <p>You can still browse active campus suppliers.</p>
      </section>
    </SupplierShell>
  );
}

function AdminRoute({ children, denied }: { children: ReactNode; denied?: ReactNode }) {
  const { status, user } = useAuth();
  if (status === "restoring") return <SessionLoading />;
  if (status !== "authenticated") return <Navigate replace to="/sign-in" />;
  return user?.systemRole === "ADMIN" || user?.systemRole === "SUPER_ADMIN"
    ? children
    : (denied ?? <Navigate replace to="/profile" />);
}

function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === "restoring") return <SessionLoading />;
  if (status !== "authenticated") return <Navigate replace to="/sign-in" />;
  return user?.systemRole === "SUPER_ADMIN"
    ? children
    : <Navigate replace to="/profile" />;
}

function FallbackRoute() {
  const { status } = useAuth();
  if (status === "restoring") return <SessionLoading />;
  return <Navigate replace to={status === "authenticated" ? "/profile" : "/sign-in"} />;
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FallbackRoute />} />
        <Route path="/sign-in" element={<PublicRoute><SignInPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegistrationPage /></PublicRoute>} />
        <Route path="/verify-email" element={<PublicRoute><VerifyEmailPage /></PublicRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><OrderListPage /></ProtectedRoute>} />
        <Route path="/orders/new" element={<ProtectedRoute><OrderCreatePage /></ProtectedRoute>} />
        <Route path="/orders/mine" element={<ProtectedRoute><OrderListPage mine /></ProtectedRoute>} />
        <Route path="/orders/:orderId" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
        <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
        <Route path="/messages/:conversationId?" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/suppliers" element={<ProtectedRoute><SupplierListPage /></ProtectedRoute>} />
        <Route path="/suppliers/:supplierId" element={<ProtectedRoute><SupplierDetailPage /></ProtectedRoute>} />
        <Route path="/admin/users" element={<SuperAdminRoute><AdminUserManagementPage /></SuperAdminRoute>} />
        <Route path="/admin/suppliers" element={<ProtectedRoute><AdminRoute denied={<SupplierAccessDenied />}><SupplierListPage admin /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin/suppliers/new" element={<ProtectedRoute><AdminRoute denied={<SupplierAccessDenied />}><SupplierFormPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin/suppliers/:supplierId/edit" element={<ProtectedRoute><AdminRoute denied={<SupplierAccessDenied />}><SupplierFormPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin/suppliers/:supplierId" element={<ProtectedRoute><AdminRoute denied={<SupplierAccessDenied />}><SupplierDetailPage admin /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute><AdminRoute><AdminDashboardPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin/orders" element={<ProtectedRoute><AdminRoute><AdminOrdersPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin/orders/:orderId" element={<ProtectedRoute><AdminRoute><AdminOrderDetailPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin/disputes" element={<ProtectedRoute><AdminRoute><AdminDisputesPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin/disputes/:disputeId" element={<ProtectedRoute><AdminRoute><AdminDisputeDetailPage /></AdminRoute></ProtectedRoute>} />
        <Route path="*" element={<FallbackRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
