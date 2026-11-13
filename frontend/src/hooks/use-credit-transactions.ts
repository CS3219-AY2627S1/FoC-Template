/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-10
 * Mode: Code generation.
 * Scope: Generated credit transaction loading, polling, and state isolation.
 * Author review: I reviewed for correctness and edited where needed.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useAuth } from "@/components/providers/auth-provider"
import { useApi } from "@/hooks/use-api"
import { CREDIT_POLL_INTERVAL_MS, useVisiblePolling } from "@/hooks/use-visible-polling"
import { CREDIT_BALANCE_INVALIDATED_EVENT } from "@/lib/credit-balance-events"
import type { CreditTransaction, CreditTransactionPage } from "@/lib/credit-transactions"

type TransactionState = {
  key: string
  items: CreditTransaction[]
  totalItems: number
  totalPages: number
  error: boolean
  refreshing: boolean
}

export function useCreditTransactions(page: number) {
  const { user, loading: authLoading } = useAuth()
  const api = useApi()
  const requestVersion = useRef(0)
  const key = `${user?.uid ?? ""}:${page}`
  const [state, setState] = useState<TransactionState | null>(null)

  const load = useCallback(async (signal: AbortSignal) => {
    if (authLoading || !user) return
    const version = ++requestVersion.current
    setState((current) => ({
      key,
      items: current?.key === key ? current.items : [],
      totalItems: current?.key === key ? current.totalItems : 0,
      totalPages: current?.key === key ? current.totalPages : 0,
      error: false,
      refreshing: true,
    }))
    try {
      const result = await api<CreditTransactionPage>(
        `/api/credits/me/transactions?page=${page}&size=20`,
        { signal },
      )
      if (!signal.aborted && requestVersion.current === version) {
        setState({ key, items: result.items, totalItems: result.totalItems,
          totalPages: result.totalPages, error: false, refreshing: false })
      }
    } catch {
      if (!signal.aborted && requestVersion.current === version) {
        setState((current) => ({ key,
          items: current?.key === key ? current.items : [],
          totalItems: current?.key === key ? current.totalItems : 0,
          totalPages: current?.key === key ? current.totalPages : 0,
          error: true, refreshing: false }))
      }
    }
  }, [api, authLoading, key, page, user])

  const refresh = useVisiblePolling(load, !authLoading && !!user, CREDIT_POLL_INTERVAL_MS)

  useEffect(() => {
    if (!user) return
    const refreshAfterMutation = () => void refresh()
    window.addEventListener(CREDIT_BALANCE_INVALIDATED_EVENT, refreshAfterMutation)
    return () => window.removeEventListener(CREDIT_BALANCE_INVALIDATED_EVENT, refreshAfterMutation)
  }, [refresh, user])

  const current = state?.key === key ? state : null
  return {
    items: current?.items ?? [],
    totalItems: current?.totalItems ?? 0,
    totalPages: current?.totalPages ?? 0,
    error: current?.error ?? false,
    loading: authLoading || (!!user && current === null),
    refreshing: current?.refreshing ?? false,
    refresh,
  }
}
