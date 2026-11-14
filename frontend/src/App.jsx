/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component App.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 * Scope (2026-11-11, Codex, model: GPT-6): Removed the demo controls from the app.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Added the three admin supplier routes (list, new, edit). No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Connected the team-requested frontend chat entry points and existing HTTP contracts.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added the requested /chats list with titles, previews and conversation navigation.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - added /series/new and /series/:id/edit (proposed to
 *        and confirmed with the user before adding, per the stage's instruction), reusing
 *        CreateRequest in series mode, wrapped the same way as /requests/new and
 *        /requests/:id/edit (RequireAuth, ViewGate requiredView REQUESTER).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Removed the bottom-left demo controls from the app per user instruction.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 32 (instructions.md) - removed /series/new: the normal errand form
 *        (/requests/new) now also creates recurring/delayed errands, so there is no longer a
 *        separate series-create route. /series/:id/edit is unchanged.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

/*
 * AI Assistance Disclosure:
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-20
 * Scope: Added the route for editing an existing request.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Added /login; wrapped the four pages that used to gate themselves via the deleted
 *        LoginModal (Activity, Wallet, Chat, CreateRequest, including the edit route) in
 *        RequireAuth; removed the LoginModal mount, per instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added /register, per instructions.md Stage 16c.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added /forgot-password, per instructions.md Stage 16d.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added /account behind RequireAuth, per instructions.md Stage 16e.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added /admin/users behind RequireAuth + RequireRole(minimum="admin"), per
 *        instructions.md Stage 16g.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Mounted SessionExpiryBanner above TopNav, per instructions.md Stage 23c, so the
 *        non-dismissible expiry warning shows at the top of every page regardless of route.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Per instructions.md Stage 22: replaced Landing with Home (redirects by login/view
 *        state); split /activity into /my-errands and /my-deliveries; wrapped Suppliers,
 *        SupplierDetail, RequestBoard and the admin supplier routes in RequireAuth (logged-out
 *        visitors may now open only /login, /register and /forgot-password); wrapped the
 *        requester-only and courier-only routes in the new ViewGate, reading VIEWS from the
 *        shared routing/views.js list. Added NavigationHistoryTracker, which Chat.jsx's back
 *        arrow reads to tell a direct/new-tab visit from in-app navigation.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Added /admin/user-transactions/:userId and /admin/user-transactions/:userId/:requestId
 *        behind RequireAuth + RequireRole(minimum="admin"), per instructions.md Stage 24.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Added /admin/logs behind RequireAuth + RequireRole(minimum="admin"), per
 *        instructions.md Stage 26e.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 29 - no route wiring changed here; ViewGate (components/RouteGuards.jsx) now
 *        redirects instead of showing the blocked-page message, so every <ViewGate
 *        requiredView={...}> wrapper below picks up the new behaviour automatically.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Added /unlock-account, per instructions.md Stage 31d. Not wrapped in RequireAuth or
 *        ViewGate, like /login, /register and /forgot-password, so it is reachable logged out
 *        and logged in and is not subject to the Stage 29 redirect.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Bug fix - added `min-w-0` to the <main> flex item so a wide child (e.g. the
 *        Manage users table's `min-w-[720px]`) no longer stretches <main> and scrolls the
 *        whole page horizontally on narrow viewports; the table's own `overflow-x-auto`
 *        wrapper now scrolls instead, per the standard flexbox min-width:auto fix.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useEffect, useRef } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import SessionExpiryBanner from "./components/SessionExpiryBanner";
import TopNav from "./components/TopNav";
import Footer from "./components/Footer";
import ChatBubble from "./components/ChatBubble";
import { RequireAuth, RequireRole, ViewGate } from "./components/RouteGuards";
import { VIEWS } from "./routing/views";
import { recordNavigation } from "./routing/navigationHistory";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import UnlockAccount from "./pages/UnlockAccount";
import Account from "./pages/Account";
import Suppliers from "./pages/Suppliers";
import SupplierDetail from "./pages/SupplierDetail";
import CreateRequest from "./pages/CreateRequest";
import RequestBoard from "./pages/RequestBoard";
import MyErrands from "./pages/MyErrands";
import MyDeliveries from "./pages/MyDeliveries";
import Chat from "./pages/Chat";
import Wallet from "./pages/Wallet";
import AdminSuppliers from "./pages/AdminSuppliers";
import AdminSupplierForm from "./pages/AdminSupplierForm";
import AdminUsers from "./pages/AdminUsers";
import AdminUserTransactions from "./pages/AdminUserTransactions";
import AdminOrderTransactions from "./pages/AdminOrderTransactions";
import AdminLogs from "./pages/AdminLogs";

function ScrollToTop() {
  const { pathname } = useLocation();
  // Block body: an implicit return makes React treat the result as a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Feeds routing/navigationHistory.js: records every real in-app route change (PUSH from a
// Link/navigate, POP from browser back/forward) after the tab's first render, so Chat's back
// arrow can tell a direct URL/new-tab visit (no recorded navigation yet) from one reached via
// the app. REPLACE (e.g. the /chat -> /chat/:id redirect below) is deliberately not recorded:
// it is not a page the visitor actually saw.
function NavigationHistoryTracker() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (navigationType === "PUSH" || navigationType === "POP")
      recordNavigation();
  }, [pathname, navigationType]);
  return null;
}

export default function App() {
  const { pathname } = useLocation();
  // The chat thread fills the viewport, so it does not carry the marketing footer.
  const showFooter = !pathname.startsWith("/chat");

  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <NavigationHistoryTracker />
      <SessionExpiryBanner />
      <TopNav />
      <main className="min-w-0 flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/unlock-account" element={<UnlockAccount />} />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <Account />
              </RequireAuth>
            }
          />
          <Route
            path="/suppliers"
            element={
              <RequireAuth>
                <ViewGate requiredView={VIEWS.REQUESTER}>
                  <Suppliers />
                </ViewGate>
              </RequireAuth>
            }
          />
          <Route
            path="/suppliers/:id"
            element={
              <RequireAuth>
                <ViewGate requiredView={VIEWS.REQUESTER}>
                  <SupplierDetail />
                </ViewGate>
              </RequireAuth>
            }
          />
          <Route
            path="/requests/new"
            element={
              <RequireAuth>
                <ViewGate requiredView={VIEWS.REQUESTER}>
                  <CreateRequest />
                </ViewGate>
              </RequireAuth>
            }
          />
          <Route
            path="/requests/:id/edit"
            element={
              <RequireAuth>
                <ViewGate requiredView={VIEWS.REQUESTER}>
                  <CreateRequest />
                </ViewGate>
              </RequireAuth>
            }
          />
          <Route
            path="/series/:id/edit"
            element={
              <RequireAuth>
                <ViewGate requiredView={VIEWS.REQUESTER}>
                  <CreateRequest seriesMode />
                </ViewGate>
              </RequireAuth>
            }
          />
          <Route
            path="/my-errands"
            element={
              <RequireAuth>
                <ViewGate requiredView={VIEWS.REQUESTER}>
                  <MyErrands />
                </ViewGate>
              </RequireAuth>
            }
          />
          <Route
            path="/requests"
            element={
              <RequireAuth>
                <ViewGate requiredView={VIEWS.COURIER}>
                  <RequestBoard />
                </ViewGate>
              </RequireAuth>
            }
          />
          <Route
            path="/my-deliveries"
            element={
              <RequireAuth>
                <ViewGate requiredView={VIEWS.COURIER}>
                  <MyDeliveries />
                </ViewGate>
              </RequireAuth>
            }
          />
          <Route
            path="/chats"
            element={
              <RequireAuth>
                <Chat />
              </RequireAuth>
            }
          />
          <Route
            path="/chat"
            element={
              <RequireAuth>
                <Chat />
              </RequireAuth>
            }
          />
          <Route
            path="/chat/:id"
            element={
              <RequireAuth>
                <Chat />
              </RequireAuth>
            }
          />
          <Route
            path="/wallet"
            element={
              <RequireAuth>
                <Wallet />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/suppliers"
            element={
              <RequireAuth>
                <AdminSuppliers />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/suppliers/new"
            element={
              <RequireAuth>
                <AdminSupplierForm />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/suppliers/:id/edit"
            element={
              <RequireAuth>
                <AdminSupplierForm />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth>
                <RequireRole minimum="admin">
                  <AdminUsers />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/user-transactions/:userId"
            element={
              <RequireAuth>
                <RequireRole minimum="admin">
                  <AdminUserTransactions />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/user-transactions/:userId/:requestId"
            element={
              <RequireAuth>
                <RequireRole minimum="admin">
                  <AdminOrderTransactions />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/logs"
            element={
              <RequireAuth>
                <RequireRole minimum="admin">
                  <AdminLogs />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showFooter && <Footer />}
      <ChatBubble />
    </div>
  );
}
