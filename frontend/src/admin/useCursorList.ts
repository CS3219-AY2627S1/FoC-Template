/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: "Load more" list state for the User Service's cursor-paged admin lists.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null
}

interface ListState<T> {
  key: string
  items: T[]
  nextCursor: string | null
  loadingMore: boolean
  error: unknown
}

/**
 * Loads the first page whenever `key` changes (filters, a reload after an action), and appends
 * the next page on loadMore(). Responses for an older key are ignored.
 */
export function useCursorList<T>(key: string, fetchPage: (cursor: string | null, signal?: AbortSignal) => Promise<CursorPage<T>>) {
  const [state, setState] = useState<ListState<T>>({ key: '', items: [], nextCursor: null, loadingMore: false, error: null })
  const fetchRef = useRef(fetchPage)
  const keyRef = useRef(key)
  const stateRef = useRef(state)
  // Declared before the loading effect so it runs first; loadMore() only runs from events
  useEffect(() => {
    fetchRef.current = fetchPage
    keyRef.current = key
    stateRef.current = state
  })

  useEffect(() => {
    const controller = new AbortController()
    fetchRef.current(null, controller.signal).then(
      (page) => { if (!controller.signal.aborted) setState({ key, items: page.items, nextCursor: page.nextCursor, loadingMore: false, error: null }) },
      (error: unknown) => { if (!controller.signal.aborted) setState({ key, items: [], nextCursor: null, loadingMore: false, error }) },
    )
    return () => controller.abort()
  }, [key])

  const loadMore = useCallback(() => {
    const current = stateRef.current
    if (!current.nextCursor || current.loadingMore || current.key !== keyRef.current) return
    const requestedKey = current.key
    setState({ ...current, loadingMore: true, error: null })
    fetchRef.current(current.nextCursor).then(
      (page) => setState((latest) => latest.key !== requestedKey ? latest
        : { ...latest, items: [...latest.items, ...page.items], nextCursor: page.nextCursor, loadingMore: false, error: null }),
      (error: unknown) => setState((latest) => latest.key !== requestedKey ? latest : { ...latest, loadingMore: false, error }),
    )
  }, [])

  const loading = state.key !== key
  return {
    loading,
    items: loading ? [] : state.items,
    hasMore: !loading && state.nextCursor !== null,
    loadingMore: !loading && state.loadingMore,
    error: loading ? null : state.error,
    loadMore,
  }
}
