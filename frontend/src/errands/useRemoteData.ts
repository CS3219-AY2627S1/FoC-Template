/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Load-on-key hook with cancellation, retry and refresh that keeps the last result on screen.
 * Author review: Reviewed and approved by @mattis.
 */
import { useCallback, useEffect, useState } from 'react'

interface Result<T> {
  readonly requestKey: string
  readonly key: string
  readonly data: T | null
  readonly error: unknown
}

export interface RemoteData<T> {
  /** The last successful result for this key, kept while a refresh is in flight or after it fails */
  readonly data: T | null
  /** The error of the latest finished request, or null */
  readonly error: unknown
  /** A request for this key is in flight */
  readonly loading: boolean
  /** Fetch again (retry after an error, refresh after a change, or poll) */
  readonly reload: () => void
}

/**
 * Runs `load` whenever `key` changes or `reload()` is called, cancelling the previous request.
 * `load` is only re-read when the key changes, so everything it depends on must be in the key.
 */
export function useRemoteData<T>(key: string, load: (signal: AbortSignal) => Promise<T>): RemoteData<T> {
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${key}#${attempt}`
  const [result, setResult] = useState<Result<T>>({ requestKey: '', key: '', data: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    load(controller.signal)
      .then((data) => {
        if (current) setResult({ requestKey, key, data, error: null })
      })
      .catch((error: unknown) => {
        if (!current || (error instanceof DOMException && error.name === 'AbortError')) return
        setResult((previous) => ({ requestKey, key, data: previous.key === key ? previous.data : null, error }))
      })
    return () => {
      current = false
      controller.abort()
    }
    // `load` is deliberately keyed by `key` (see the doc comment)
  }, [requestKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setAttempt((value) => value + 1), [])
  const settled = result.requestKey === requestKey
  return {
    data: result.key === key ? result.data : null,
    error: settled ? result.error : null,
    loading: !settled,
    reload,
  }
}
