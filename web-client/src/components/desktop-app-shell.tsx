/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-07
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

import { type PropsWithChildren } from "react";
import type { CurrentUser } from "../api/user-service";
import { useWorkspaceMode } from "../app/use-workspace-mode";
import { AppSidebar } from "./app-navigation";
import { WorkspaceTopbar } from "./workspace-topbar";

export function DesktopAppShell({ children, user }: PropsWithChildren<{ user: CurrentUser }>) {
  const { mode } = useWorkspaceMode(user);

  return (
    <div className="desktop-shell">
      <AppSidebar mode={mode} user={user} />
      <main className="desktop-main">
        <WorkspaceTopbar user={user} />
        <div className="desktop-content">{children}</div>
      </main>
    </div>
  );
}
