export type WorkspaceRole = "REQUESTER" | "COURIER" | "ADMIN";

export type AuthSession = {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  userId: string;
  username: string;
  role: WorkspaceRole | "USER";
  availableRoles?: WorkspaceRole[];
};

export const sessionKey = "foc.user-session";

function asWorkspaceRole(value: unknown): WorkspaceRole | null {
  if (value === "USER") return "REQUESTER";
  return value === "REQUESTER" || value === "COURIER" || value === "ADMIN" ? value : null;
}
function normalizeSession(value: unknown): AuthSession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AuthSession>;
  const role = asWorkspaceRole(candidate.role);
  const availableRoles = Array.isArray(candidate.availableRoles)
    ? candidate.availableRoles.map(asWorkspaceRole).filter((item): item is WorkspaceRole => item !== null)
    : role ? [role] : [];
  if (typeof candidate.accessToken !== "string" || candidate.accessToken.length === 0 ||
      candidate.tokenType !== "Bearer" || typeof candidate.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(candidate.expiresAt)) || Date.parse(candidate.expiresAt) <= Date.now() ||
      typeof candidate.userId !== "string" || candidate.userId.length === 0 ||
      typeof candidate.username !== "string" || candidate.username.length === 0 ||
      role === null || availableRoles.length === 0) return null;
  return { ...candidate, role, availableRoles } as AuthSession;
}

export function readSession(): AuthSession | null {
  try {
    const value = sessionStorage.getItem(sessionKey);
    if (!value) {
      return null;
    }
    const session: unknown = JSON.parse(value);
    const normalized = normalizeSession(session);
    if (normalized) return normalized;
  } catch {
    // Invalid browser state is cleared below.
  }
  clearSession();
  return null;
}

export function saveSession(session: AuthSession): AuthSession {
  const normalized = normalizeSession(session);
  if (!normalized) throw new Error("Cannot store an invalid authenticated session");
  sessionStorage.setItem(sessionKey, JSON.stringify(normalized));
  return normalized;
}

export function clearSession() {
  sessionStorage.removeItem(sessionKey);
  sessionStorage.removeItem("foc.ui-mode");
}

export function safeReturnTo(search = window.location.search): string | null {
  const requested = new URLSearchParams(search).get("returnTo");
  if (!requested || !requested.startsWith("/") || requested.startsWith("//")) {
    return null;
  }

  try {
    const destination = new URL(requested, window.location.origin);
    if (destination.origin !== window.location.origin) return null;
    if (
      destination.pathname === "/suppliers" ||
      destination.pathname.startsWith("/suppliers/") ||
      destination.pathname === "/admin/suppliers" ||
      destination.pathname.startsWith("/admin/suppliers/") ||
      destination.pathname === "/credits" ||
      destination.pathname.startsWith("/credits/") ||
      destination.pathname.startsWith("/admin/reports/") ||
      destination.pathname === "/errands" || destination.pathname.startsWith("/errands/") ||
      destination.pathname === "/notifications" || destination.pathname.startsWith("/notifications/") ||
      destination.pathname === "/admin" || destination.pathname.startsWith("/admin/cases/")
    ) {
      return `${destination.pathname}${destination.search}${destination.hash}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function isAdminDestination(path: string) {
  const pathname = path.split(/[?#]/)[0];
  return pathname === "/admin" || pathname.startsWith("/admin/cases/") || pathname === "/admin/suppliers" || pathname.startsWith("/admin/suppliers/");
}
