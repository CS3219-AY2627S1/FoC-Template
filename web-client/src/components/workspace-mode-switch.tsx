/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

import type { CurrentUser } from "../api/user-service";
import { useWorkspaceMode } from "../app/use-workspace-mode";

export function WorkspaceModeSwitch({ user }: { user: CurrentUser }) {
  const { mode, canUseAdminMode, switchMode } = useWorkspaceMode(user);
  if (!canUseAdminMode) return null;

  return (
    <div aria-label="Workspace mode" className="workspace-mode-switch" role="group">
      <button aria-pressed={mode === "user"} className="workspace-mode-button" onClick={() => switchMode("user")} type="button">
        <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 21v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
        User mode
      </button>
      <button aria-pressed={mode === "admin"} className="workspace-mode-button" onClick={() => switchMode("admin")} type="button">
        <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
          <path d="m12 3 8 3v6c0 4-3.5 7.5-8 9-4.5-1.5-8-5-8-9V6l8-3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="m8.5 12 2.5 2.5 4.5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
        Admin mode
      </button>
    </div>
  );
}
