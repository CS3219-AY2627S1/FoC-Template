/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-05
 * Scope: Holds the signed-in user's bookmarked supplier ids and the add/remove/prune actions,
 *        per the 2026-11-05 supplier-bookmarking spec (B6, B12, B16).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { addBookmark, listBookmarks, removeBookmark } from '../api/bookmarks'
import { useAuth } from './AuthContext'
import { useToast } from '../components/Toast'

const BookmarksContext = createContext(null)

export function BookmarksProvider({ children }) {
  const { isLoggedIn, sessionReady } = useAuth()
  const { showToast } = useToast()
  const [ids, setIds] = useState([])
  // false until the first load has settled, so the Bookmarked filter does not flash an empty state.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!sessionReady) return undefined
    if (!isLoggedIn) {
      setIds([])
      setReady(true)
      return undefined
    }
    let cancelled = false
    setReady(false)
    listBookmarks().then(
      (body) => {
        if (cancelled) return
        setIds(body.supplier_ids)
        setReady(true)
      },
      () => {
        if (cancelled) return
        setIds([])
        setReady(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [isLoggedIn, sessionReady])

  const isBookmarked = useCallback((supplierId) => ids.includes(supplierId), [ids])

  // One icon, two endpoints: which one is called depends on the icon's current state.
  const toggle = useCallback(
    async (supplierId) => {
      try {
        if (ids.includes(supplierId)) {
          await removeBookmark(supplierId)
          setIds((current) => current.filter((id) => id !== supplierId))
        } else {
          await addBookmark(supplierId)
          setIds((current) => (current.includes(supplierId) ? current : [...current, supplierId]))
        }
      } catch (err) {
        showToast(err.message, 'error')
      }
    },
    [ids, showToast],
  )

  // The Supplier Service reports ids it cannot find as 'deleted' (and malformed ones as 'invalid'):
  // clear those bookmarks. 'hidden' ones are kept.
  const pruneDeleted = useCallback(async (unavailable) => {
    const gone = unavailable
      .filter((entry) => entry.status === 'deleted' || entry.status === 'invalid')
      .map((entry) => entry.id)
    if (gone.length === 0) return
    const results = await Promise.allSettled(gone.map((id) => removeBookmark(id)))
    const cleared = gone.filter((_, index) => results[index].status === 'fulfilled')
    if (cleared.length > 0) setIds((current) => current.filter((id) => !cleared.includes(id)))
  }, [])

  const value = useMemo(
    () => ({ ids, ready, isBookmarked, toggle, pruneDeleted }),
    [ids, ready, isBookmarked, toggle, pruneDeleted],
  )

  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>
}

export function useBookmarks() {
  const ctx = useContext(BookmarksContext)
  if (!ctx) throw new Error('useBookmarks must be used inside BookmarksProvider')
  return ctx
}
