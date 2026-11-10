// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Implemented the workspace shell used by Order screens.
// Author review: I validated correctness and added boundary checks where needed.

import type { PropsWithChildren } from "react";
import { useAuth } from "../app/use-auth";
import { useWorkspaceMode } from "../app/use-workspace-mode";
import { AppMobileNavigation, AppSidebar } from "./app-navigation";
import { WorkspaceTopbar } from "./workspace-topbar";

export function WorkspaceShell({ children, className = "", viewport = false, userDescription, adminDescription }: PropsWithChildren<{
  className?: string; viewport?: boolean; userDescription: string; adminDescription?: string;
}>) {
  const { user } = useAuth();
  const { mode } = useWorkspaceMode(user);
  if (!user) return null;
  return <div className={`workspace-shell${viewport ? " workspace-viewport" : ""} ${className}`}>
    <AppSidebar mode={mode} user={user} />
    <div className="workspace-app">
      <WorkspaceTopbar user={user} userDescription={userDescription} adminDescription={adminDescription} />
      <main className="workspace-main">{children}</main>
    </div>
    <AppMobileNavigation mode={mode} user={user} />
  </div>;
}
