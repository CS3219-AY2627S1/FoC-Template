/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-09
 * Scope: Implementation assistance for notification-driven errand refreshes.
 */
import { useEffect, useState } from 'react'
import { useNotifications } from './useNotifications'

const errandTypes = new Set([
  'ERRAND_ACCEPTED',
  'ERRAND_DELIVERED',
  'ERRAND_COMPLETED',
  'ERRAND_FAILED',
  'ERRAND_EXPIRED',
])

export function useErrandNotificationRevision(errandId?: string) {
  const subscribe = useNotifications()?.subscribe
  const [revision, setRevision] = useState(0)

  useEffect(() => subscribe?.((signal) => {
    if (signal.type === 'connected' || (
      errandTypes.has(signal.item.type) && (!errandId || signal.item.data.errandId === errandId)
    )) {
      setRevision((value) => value + 1)
    }
  }), [subscribe, errandId])

  return revision
}
