"use client"

import { useCallback, useEffect, useRef } from "react"

export const ORDER_POLL_INTERVAL_MS = 5_000
export const CREDIT_POLL_INTERVAL_MS = 5_000
const DEFAULT_POLL_INTERVAL_MS = 15_000

/** Read-only refreshes; callers supply auth readiness and handle user-facing errors. */
export function useVisiblePolling(
  callback: (signal: AbortSignal) => Promise<void>,
  enabled: boolean,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
) {
  const active = useRef<AbortController | null>(null)
  const queued = useRef(false)
  const refresh = useCallback(async (queueIfBusy = true) => {
    if (!enabled || document.visibilityState !== "visible") return
    if (active.current) {
      if (queueIfBusy) queued.current = true
      return
    }
    const controller = new AbortController()
    active.current = controller
    try {
      do {
        queued.current = false
        try {
          await callback(controller.signal)
        } catch {
          // Read failure never leaves an unhandled promise or starts a mutation.
        }
      } while (queued.current && !controller.signal.aborted && document.visibilityState === "visible")
    } finally {
      if (active.current === controller) active.current = null
    }
  }, [callback, enabled])

  useEffect(() => {
    if (!enabled) return
    const initial = window.setTimeout(() => void refresh(false), 0)
    const timer = window.setInterval(() => void refresh(false), intervalMs)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(false)
      else active.current?.abort()
    }
    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
      active.current?.abort()
      active.current = null
      queued.current = false
    }
  }, [enabled, intervalMs, refresh])

  return refresh
}
