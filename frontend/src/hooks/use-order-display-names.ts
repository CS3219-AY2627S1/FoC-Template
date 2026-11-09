"use client"
import { useEffect, useState } from "react"
import { useAdminApi } from "@/hooks/use-admin-api"
import { ApiError } from "@/lib/api"
import type { AdminOrder } from "@/lib/admin-api"
type Kind = "users" | "suppliers"
/** Display enrichment only: names never become Order-owned persistence or block primary data. */
export function useOrderDisplayNames(orders: AdminOrder[], additionalUserIds: (string | null | undefined)[] = []) {
  const api = useAdminApi()
  const missing = new Map<string, [Kind, string]>()
  for (const order of orders) {
    for (const [kind, id, name] of [
      ["users", order.requesterId, order.requesterName], ["users", order.courierId, order.courierName],
      ["suppliers", order.pickupSupplierId, order.pickupSupplierName], ["suppliers", order.deliverySupplierId, order.deliverySupplierName],
    ] as [Kind, string | null, string | null][]) {
      if (id && !name?.trim()) missing.set(kind + "/" + id, [kind, id])
    }
  }
  for (const id of additionalUserIds) {
    if (id) missing.set("users/" + id, ["users", id])
  }
  const key = JSON.stringify([...missing.values()].sort(([a, b], [c, d]) => (a + b).localeCompare(c + d)))
  const [state, setState] = useState<{ api: typeof api; key: string; names: Record<string, string> } | null>(null)
  useEffect(() => {
    if (api.mode !== "live") return
    const controller = new AbortController()
    const records: [Kind, string][] = JSON.parse(key)
    for (const [kind, id] of records) {
      void (async () => {
        const noun = kind === "users" ? "user" : "supplier"
        let label: string
        try { label = (await api.recordName(kind, id, controller.signal))?.trim() || "Deleted " + noun }
        catch (cause) { label = cause instanceof ApiError && cause.status === 404 ? "Deleted " + noun : (kind === "users" ? "User" : "Supplier") + " unavailable" }
        if (!controller.signal.aborted) setState(current => ({ api, key, names: {
          ...(current?.api === api && current.key === key ? current.names : {}), [kind + "/" + id]: label,
        } }))
      })()
    }
    return () => controller.abort()
  }, [api, key])
  return (kind: Kind, id: string | null, provided?: string | null): string | null => {
    if (!id) return null
    if (provided?.trim()) return provided.trim()
    if (state?.api === api && state.key === key && state.names[kind + "/" + id]) return state.names[kind + "/" + id]
    return api.mode === "live" ? (kind === "users" ? "Loading user…" : "Loading supplier…")
      : kind === "users" ? "User unavailable" : "Supplier unavailable"
  }
}
