import { useEffect, useState } from 'react'
import { readSession } from './auth/session'
import { isUuid } from './cases'

// Display-only identity reads. Authorization and action targets never depend on names.
export function useParticipantNames(ids: string[]) {
  const key = [...new Set(ids.filter(isUuid))].sort().join(',')
  const token = readSession()?.accessToken
  const [result, setResult] = useState<{
    key: string
    token?: string
    names: Record<string, string>
  }>()
  useEffect(() => {
    if (!token || !key) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 6000)
    let active = true
    void Promise.all(
      key.split(',').map(async (id) => {
        try {
          const response = await fetch(
            `/api/users/admin/accounts?query=${encodeURIComponent(id)}&page=0&size=1`,
            {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store',
              signal: controller.signal,
            },
          )
          if (!response.ok) return null
          const body = await response.json()
          const account =
            Array.isArray(body.content) && body.content.length === 1
              ? body.content[0]
              : null
          return account?.userId === id &&
            typeof account.username === 'string' &&
            account.username.trim() &&
            account.username.length <= 20
            ? ([id, account.username.trim()] as const)
            : null
        } catch {
          return null
        }
      }),
    )
      .then((entries) => {
        if (active)
          setResult({
            key,
            token,
            names: Object.fromEntries(
              entries.filter((entry) => entry !== null),
            ),
          })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [key, token])
  return result?.key === key && result.token === token ? result.names : {}
}
