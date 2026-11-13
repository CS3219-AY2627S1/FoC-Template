"use client"

import { useEffect, useMemo, useState } from "react"

import { useAuth } from "@/components/providers/auth-provider"
import { useApi } from "@/hooks/use-api"
import { supplierLookupPath, supplierLookupPayload, supplierOptionLabel, type SupplierLookupResponse } from "@/lib/suppliers"

export function useSupplierNames(ids: string[]) {
  const api = useApi()
  const { user, loading: authLoading } = useAuth()
  const uniqueIds = useMemo(() => Array.from(new Set(ids.filter(Boolean))), [ids])
  const requestKey = uniqueIds.join("\u001f")
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user || uniqueIds.length === 0) return

    const controller = new AbortController()
    void api<SupplierLookupResponse | null>(supplierLookupPath(), {
      method: "POST",
      body: supplierLookupPayload(uniqueIds),
      signal: controller.signal,
    })
      .then((response) => {
        const resolvedNames: Record<string, string> = Object.fromEntries(
          (response?.items ?? []).map((supplier) => [supplier.id, supplierOptionLabel(supplier)]),
        )
        // A completed lookup with no record uses a display label, not a stored name.
        // Cover omitted missingIds too so an empty response never hides all Orders.
        for (const id of uniqueIds) {
          if (!Object.hasOwn(resolvedNames, id)) resolvedNames[id] = "Deleted supplier"
        }
        setNames(resolvedNames)
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return
        setError(requestError instanceof Error ? requestError.message : "Could not resolve supplier names.")
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
    // requestKey intentionally represents the de-duplicated ID list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, authLoading, requestKey, user])

  // A card must not render opaque supplier IDs while this lookup is in flight.
  // The page uses this value to keep the first render stable and human-readable.
  const visibleNames = uniqueIds.length === 0 ? {} : names
  const visibleLoading = uniqueIds.length > 0 && loading
  const visibleError = uniqueIds.length === 0 ? null : error
  const ready = uniqueIds.length === 0 || uniqueIds.every((id) => Object.hasOwn(visibleNames, id)) || Boolean(visibleError && !visibleLoading)

  return { names: visibleNames, loading: visibleLoading, ready, error: visibleError }
}
