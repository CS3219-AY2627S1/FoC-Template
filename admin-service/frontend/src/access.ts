import type { AuthSession } from './auth/session'
export { readSession } from './auth/session'
export class AccessError extends Error {
  constructor(public status: number) {
    super('Access check failed')
  }
}
export async function checkAccess(
  session: Pick<AuthSession, 'accessToken' | 'userId'>,
  signal: AbortSignal,
) {
  const response = await fetch('/api/admin/session', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    signal,
    cache: 'no-store',
  })
  if (!response.ok) throw new AccessError(response.status)
  const data = (await response.json()) as { userId?: string; role?: string }
  if (data.userId !== session.userId || data.role !== 'ADMIN')
    throw new AccessError(503)
  return data
}
