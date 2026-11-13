"use client"

import { useCallback, useRef, useState } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { useApi } from "@/hooks/use-api"
import { ORDER_POLL_INTERVAL_MS, useVisiblePolling } from "@/hooks/use-visible-polling"
import type { Order, OrderPage } from "@/lib/orders"

type ListState = { key: string; orders: Order[]; error: boolean; totalPages: number }

export function useOrderList(path: string | null) {
  const api = useApi()
  const { user, loading: authLoading } = useAuth()
  const key = `${user?.uid ?? ""}:${path ?? ""}`
  const [state, setState] = useState<ListState | null>(null)
  const revision = useRef(0)
  const load = useCallback(async (signal: AbortSignal) => {
    if (!path) return
    const version = revision.current
    try {
      const page = await api<OrderPage>(path, { signal })
      if (!signal.aborted && version === revision.current) {
        setState({ key, orders: page.items, error: false, totalPages: page.totalPages ?? 0 })
      }
    } catch {
      if (!signal.aborted && version === revision.current) {
        // Keep existing cards on a temporary background error; no repeated toasts.
        setState((current) => ({ key, orders: current?.key === key ? current.orders : [], error: true,
          totalPages: current?.key === key ? current.totalPages : 0 }))
      }
    }
  }, [api, key, path])
  const refresh = useVisiblePolling(load, !authLoading && !!user && !!path, ORDER_POLL_INTERVAL_MS)
  const updateOrders = useCallback((update: (orders: Order[]) => Order[]) => {
    revision.current += 1
    setState((current) => ({ key, orders: update(current?.key === key ? current.orders : []), error: false,
      totalPages: current?.key === key ? current.totalPages : 0 }))
  }, [key])

  return {
    orders: state?.key === key ? state.orders : [],
    loading: authLoading || (!!user && state?.key !== key),
    error: state?.key === key && state.error,
    totalPages: state?.key === key ? state.totalPages : 0,
    refresh,
    updateOrders,
  }
}
