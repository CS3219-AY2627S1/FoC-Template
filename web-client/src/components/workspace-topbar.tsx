import { Link } from "react-router-dom";
import type { CurrentUser } from "../api/user-service";
import { useWorkspaceMode } from "../app/use-workspace-mode";
import { AppBrand } from "./app-brand";
import { WorkspaceModeSwitch } from "./workspace-mode-switch";

function WorkspaceGreeting({ title, description }: { title: string; description: string }) {
  return <div className="workspace-greeting">
    <strong>{title}</strong>
    <span>{description}</span>
  </div>;
}

function WorkspaceProfileLink({ user }: { user: CurrentUser }) {
  return <Link aria-label="Open your profile" className="workspace-profile-link" to="/profile">
    {user.displayName.slice(0, 1).toUpperCase()}
  </Link>;
}

export function WorkspaceTopbar({
  user,
  userDescription = "Manage the details connected to your FoC account.",
  adminDescription = "Manage administration for your FoC workspace.",
}: { user: CurrentUser; userDescription?: string; adminDescription?: string }) {
  const { mode } = useWorkspaceMode(user);
  const firstName = user.displayName.split(/\s+/)[0] || user.displayName;

  return <header className="workspace-topbar">
    <div className="workspace-mobile-brand"><AppBrand variant="mobile" /></div>
    <WorkspaceGreeting
      title={mode === "admin" ? "Admin workspace" : `Good to see you, ${firstName}`}
      description={mode === "admin" ? adminDescription : userDescription}
    />
    <div className="workspace-header-actions">
      <WorkspaceModeSwitch user={user} />
      <WorkspaceProfileLink user={user} />
    </div>
  </header>;
}
