"use client"
import { useCallback, useMemo, useState } from "react"
import { useApi } from "@/hooks/use-api"
import { useVisiblePolling } from "@/hooks/use-visible-polling"
import { createReportApi } from "@/lib/reports"
export function useReportApi() {
  const request = useApi()
  return useMemo(() => createReportApi(request), [request])
}
export function useReportResource<T>(load: (signal: AbortSignal) => Promise<T>, enabled: boolean) {
  const [state, setState] = useState<{ load: typeof load; data: T | null; error: string | null } | null>(null)
  const poll = useCallback(async (signal: AbortSignal) => {
    try {
      const data = await load(signal)
      if (!signal.aborted) setState({ load, data, error: null })
    } catch (cause) {
      if (!signal.aborted) setState(current => ({ load, data: current?.load === load ? current.data : null, error: cause instanceof Error ? cause.message : "Could not load reports." }))
    }
  }, [load])
  const refresh = useVisiblePolling(poll, enabled, 5000)
  const current = state?.load === load ? state : null
  return { data: current?.data ?? null, error: current?.error ?? null, loading: enabled && current === null, refresh: () => void refresh() }
}
