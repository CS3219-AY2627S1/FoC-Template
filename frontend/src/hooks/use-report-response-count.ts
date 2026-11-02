/* AI assistance: OpenAI Codex, 2026-10-30. Report credit context and response reminders; human review pending. */
"use client"

import { useCallback, useState } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { useApi } from "@/hooks/use-api"
import { ORDER_POLL_INTERVAL_MS, useVisiblePolling } from "@/hooks/use-visible-polling"

/** One poller in the shell serves both desktop and mobile navigation. */
export function useReportResponseCount(enabled = true) {
  const { user, loading } = useAuth()
  const api = useApi()
  const uid = user?.uid
  const [result, setResult] = useState<{ uid: string; count: number } | null>(null)
  const load = useCallback(async (signal: AbortSignal) => {
    if (!uid) return
    try {
      const response = await api<{ count: number }>("/api/reports/mine/response-count", { signal })
      if (!signal.aborted && Number.isSafeInteger(response.count) && response.count >= 0) {
        setResult({ uid, count: response.count })
      }
    } catch {
      // Keep the last confirmed count for this user; a failed read does not mean zero.
    }
  }, [api, uid])
  useVisiblePolling(load, enabled && !!uid && !loading, ORDER_POLL_INTERVAL_MS)
  return enabled && uid && result?.uid === uid ? result.count : 0
}
