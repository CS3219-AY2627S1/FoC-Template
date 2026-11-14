/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Created small data-loading hooks (useApi, useReferenceData) for the supplier screens. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
  *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: useReferenceData returns stable empty arrays, fixing a render loop that sent the list request hundreds of times. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Reads isLoggedIn/sessionReady from the new AuthContext instead of DemoContext, per
 *        instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useEffect, useState } from 'react'
import { listCategoryOptions, listLocationOptions } from './suppliers'
import { useAuth } from '../context/AuthContext'

// Runs `load` whenever `deps` change, once the session is known and the user is logged in (every
// Supplier Service route needs a token). `reload` refetches with the same inputs.
export function useApi(load, deps) {
  const { isLoggedIn, sessionReady } = useAuth()
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!sessionReady) return undefined
    if (!isLoggedIn) {
      setState({ data: null, error: null, loading: false })
      return undefined
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    load().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error) => !cancelled && setState({ data: null, error, loading: false }),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, sessionReady, nonce, ...deps])

  return { ...state, reload: () => setNonce((n) => n + 1) }
}

// Location and category options for filters and forms, fetched once per page load.
// The empty lists are constants so a screen that puts them in an effect dependency list does not see a
// new array on every render (that re-ran its request in a loop).
const NONE = []
let referencePromise = null
export function useReferenceData() {
  const { data, error, loading } = useApi(() => {
    if (!referencePromise) {
      referencePromise = Promise.all([listLocationOptions(), listCategoryOptions()])
        .then(([locations, categories]) => ({
          locations: locations.locations,
          categories: categories.categories,
        }))
        .catch((e) => {
          referencePromise = null
          throw e
        })
    }
    return referencePromise
  }, [])
  return { locations: data?.locations ?? NONE, categories: data?.categories ?? NONE, loading, error }
}
