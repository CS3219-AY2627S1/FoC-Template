"use client"

import { useEffect, useState } from "react"

/** A new query clears stale data; late responses cannot overwrite the latest view. */
export function useAdminPage<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ load: typeof load; data: T | null; error: string | null } | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    load(controller.signal).then((data) => {
      if (active) setState({ load, data, error: null })
    }).catch((error: unknown) => {
      if (active) setState({ load, data: null, error: error instanceof Error ? error.message : "Could not load data." })
    })
    return () => { active = false; controller.abort() }
  }, [load, revision])
  const current = state?.load === load ? state : null
  return { data: current?.data ?? null, error: current?.error ?? null,
    loading: current === null, refresh: () => setRevision((value) => value + 1) }
}
