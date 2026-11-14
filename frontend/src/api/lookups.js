/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Order Service frontend integration - display lookups for the ids an order carries:
 *        supplier (GET /api/v1/suppliers/:id), user display name (GET /users/public/:id) and
 *        delivery location name (supplier-service location reference list). Each id is fetched
 *        once per page load and shared between cards.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Added useBalance (GET /credits/balance/:userId via credits.js's getBalance), for the
 *        Credits column instructions.md Stage 24 adds to /admin/users (its "Summary fields"
 *        row: every list of users or orders shows a brief summary - email/status/role/credits
 *        for a user row, request id/requestor/supplier/credits/courier/status for an order row
 *        - distinct from the fuller "Profile fields" shown once you open one).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { useEffect, useMemo, useState } from 'react'
import { request } from './http'
import { getBalance } from './credits'
import { getSupplier } from './suppliers'
import { useReferenceData } from './useApi'

function cached(load) {
  const cache = new Map()
  return (id) => {
    const key = String(id)
    if (!cache.has(key)) {
      cache.set(
        key,
        load(key).catch((e) => {
          cache.delete(key) // a failed lookup is retried next time
          throw e
        }),
      )
    }
    return cache.get(key)
  }
}

const supplierById = cached(getSupplier)
// 200 { id, username }; any signed-in user may resolve a display name.
const userById = cached((id) => request('/users/public/' + encodeURIComponent(id)))

function useLookup(lookup, id) {
  const [found, setFound] = useState({ id: null, value: null })
  useEffect(() => {
    if (id === null || id === undefined || id === '') return undefined
    let alive = true
    lookup(id).then(
      (value) => alive && setFound({ id, value }),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [lookup, id])
  return found.id === id ? found.value : null
}

export const useSupplier = (id) => useLookup(supplierById, id)

export const useUserName = (id) => useLookup(userById, id)?.username ?? null

const balanceById = cached((id) => getBalance(id))
// { userId, totalBalance, reservedBalance, unreservedBalance }, or null while loading/missing
// (e.g. a pending user with no wallet yet) - the caller supplies its own fallback.
export const useBalance = (id) => useLookup(balanceById, id)

// location_id -> location name, from the same reference list the supplier screens use.
export function useLocationNames() {
  const { locations } = useReferenceData()
  return useMemo(() => {
    const names = new Map(locations.map((l) => [Number(l.location_id), l.location]))
    return (id) => names.get(Number(id)) ?? (id ? 'Location ' + id : '')
  }, [locations])
}
