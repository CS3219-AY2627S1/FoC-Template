export type WorkspaceRole = 'REQUESTER' | 'COURIER' | 'ADMIN'

export type AuthSession = {
  accessToken: string
  tokenType: 'Bearer'
  expiresAt: string
  userId: string
  username: string
  role: WorkspaceRole | 'USER'
  availableRoles?: WorkspaceRole[]
}

export const sessionKey = 'foc.user-session'
export const sessionExpiredEvent = 'foc:session-expired'
export const accessDeniedEvent = 'foc:access-denied'

function asWorkspaceRole(value: unknown): WorkspaceRole | null {
  if (value === 'USER') return 'REQUESTER'
  return value === 'REQUESTER' || value === 'COURIER' || value === 'ADMIN'
    ? value
    : null
}

function normalizeSession(value: unknown): AuthSession | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<AuthSession>
  const role = asWorkspaceRole(candidate.role)
  const availableRoles = Array.isArray(candidate.availableRoles)
    ? candidate.availableRoles.map(asWorkspaceRole).filter((item): item is WorkspaceRole => item !== null)
    : role ? [role] : []
  if (
    typeof candidate.accessToken !== 'string' || candidate.accessToken.length === 0 ||
    candidate.tokenType !== 'Bearer' || typeof candidate.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.expiresAt)) || Date.parse(candidate.expiresAt) <= Date.now() ||
    typeof candidate.userId !== 'string' || candidate.userId.length === 0 ||
    typeof candidate.username !== 'string' || candidate.username.length === 0 ||
    role === null || availableRoles.length === 0
  ) return null
  return { ...candidate, role, availableRoles } as AuthSession
}

export function readSession(): AuthSession | null {
  try {
    const value = sessionStorage.getItem(sessionKey)
    if (!value) {
      return null
    }
    const session: unknown = JSON.parse(value)
    const normalized = normalizeSession(session)
    if (normalized) return normalized
  } catch {
    // Invalid browser state is cleared below.
  }
  clearSession()
  return null
}

export function clearSession() {
  sessionStorage.removeItem(sessionKey)
  sessionStorage.removeItem('foc.ui-mode')
}

export function saveSession(session: AuthSession): AuthSession {
  const normalized = normalizeSession(session)
  if (!normalized) throw new Error('Cannot store an invalid authenticated session')
  sessionStorage.setItem(sessionKey, JSON.stringify(normalized))
  return normalized
}

export async function replaceSessionRole(role: WorkspaceRole): Promise<AuthSession> {
  const session = readSession()
  if (!session) throw new Error('Sign in is required')
  const response = await fetch('/api/users/me/session-role', {
    method: 'PATCH',
    headers: {
      Authorization: `${session.tokenType} ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role }),
  })
  if (!response.ok) throw new Error("We couldn't switch your role. Please try again.")
  const replacement = normalizeSession(await response.json())
  if (!replacement) throw new Error("We couldn't switch your role. Please try again.")
  return saveSession(replacement)
}

export function expireSession() {
  clearSession()
  window.dispatchEvent(new Event(sessionExpiredEvent))
}

export function reportAccessDenied() {
  window.dispatchEvent(new Event(accessDeniedEvent))
}
