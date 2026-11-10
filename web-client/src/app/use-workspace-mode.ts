/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

import { useLocation, useNavigate } from "react-router-dom";
import type { CurrentUser } from "../api/user-service";

export type WorkspaceMode = "user" | "admin";

export function useWorkspaceMode(user: CurrentUser | null) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const canUseAdminMode = user?.systemRole === "ADMIN" || user?.systemRole === "SUPER_ADMIN";
  // The route keeps the switch in sync with refreshes, deep links, and browser history.
  const mode: WorkspaceMode = canUseAdminMode && pathname.startsWith("/admin/") ? "admin" : "user";

  function switchMode(nextMode: WorkspaceMode) {
    if (nextMode === mode || (nextMode === "admin" && !canUseAdminMode)) return;
    navigate(nextMode === "admin" ? "/admin/suppliers" : "/suppliers");
  }

  return { mode, canUseAdminMode, switchMode };
}
