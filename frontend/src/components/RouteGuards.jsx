/*
 * AI Assistance Disclosure:
 * Scope (2026-11-10, Codex, model: GPT-6): Prevented repeated redirect feedback during StrictMode effect replay.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created RequireAuth and RequireRole, per instructions.md Stage 16b. While the session
 *        is still restoring, both render nothing rather than redirect, so a logged-in user on
 *        reload never flashes a login page. The role rank order mirrors the backend's
 *        authorize middleware (user-service/src/middleware/authorize.ts: user < admin <
 *        super admin).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Added ViewGate, per instructions.md Stage 22's "Opening another view's page" and
 *        "Toggling the view" rows. It reads user.activeView straight from AuthContext on every
 *        render, so toggling the view elsewhere (the nav's ActiveViewToggle) re-renders any
 *        mounted ViewGate automatically, including the toast-and-revert case on a failed
 *        toggle - no extra wiring between the two. Rendered inside RequireAuth (App.jsx), so
 *        user is never null here; the guard is defensive only.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 29 - ViewGate now redirects (Navigate replace) to the current view's main page
 *        instead of rendering the blocked-page message, and shows the "You are now in <view>
 *        mode" toast once per redirect. Removed the switch/go-to-main-page buttons and the
 *        blocked-page EmptyState markup entirely, per the stage's "Blocked-page component:
 *        Removed" row.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Forbidden from "./Forbidden";
import { useToast } from "./Toast";
import { VIEW_MODE_LABEL, mainPageFor } from "../routing/views";

// Same rank order as user-service/src/middleware/authorize.ts's ROLE_RANK.
const ROLE_RANK = { user: 0, admin: 1, "super admin": 2 };

export function RequireAuth({ children }) {
  const { status, isLoggedIn } = useAuth();
  const location = useLocation();

  if (status === "loading") return null;
  if (!isLoggedIn)
    return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export function RequireRole({ minimum, children }) {
  const { status, isLoggedIn, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return null;
  if (!isLoggedIn)
    return <Navigate to="/login" state={{ from: location }} replace />;
  if (ROLE_RANK[user.role] < ROLE_RANK[minimum]) return <Forbidden />;
  return children;
}

// Redirects, replacing the history entry, when a requester-only or courier-only page is opened
// from the other view, per instructions.md Stage 29. The view itself does not change; the user
// lands on the current view's main page and sees the "You are now in <view> mode" toast once.
export function ViewGate({ requiredView, children }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const mismatch = Boolean(user) && user.activeView !== requiredView;

  // AI-generated (edited by <name>).
  const notifiedRedirect = useRef(null);
  useEffect(() => {
    if (!mismatch) {
      notifiedRedirect.current = null;
      return;
    }
    const redirect = location.key + ":" + user.activeView;
    if (notifiedRedirect.current === redirect) return;
    notifiedRedirect.current = redirect;
    showToast("You are now in " + VIEW_MODE_LABEL[user.activeView], "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mismatch, location.pathname]);

  if (!user) return children;
  if (mismatch) return <Navigate to={mainPageFor(user.activeView)} replace />;
  return children;
}
