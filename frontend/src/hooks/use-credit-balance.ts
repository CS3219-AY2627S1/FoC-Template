/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-26
 * Mode: Code generation.
 * Scope: Implemented authenticated self-balance loading, focus refresh, and manual refresh behavior.
 * Author review: I have reviewed for correctness.
 */
"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { useAuth } from "@/components/providers/auth-provider"
import { useApi } from "@/hooks/use-api"
import { CREDIT_POLL_INTERVAL_MS, useVisiblePolling } from "@/hooks/use-visible-polling"
import { CREDIT_BALANCE_INVALIDATED_EVENT } from "@/lib/credit-balance-events"

export type CreditBalance = {
  userId: string
  totalBalance: number
  reservedBalance: number
  usableBalance: number
  version: number
  asOf: string
}

type BalanceState = {
  ownerId: string | null
  balance: CreditBalance | null
  error: boolean
  loading: boolean
}

const INITIAL_STATE: BalanceState = {
  ownerId: null,
  balance: null,
  error: false,
  loading: false,
}

export function useCreditBalance() {
  const { user, loading: authLoading } = useAuth()
  const api = useApi()
  const requestVersion = useRef(0)
  const [state, setState] = useState<BalanceState>(INITIAL_STATE)

  const load = useCallback(async (signal: AbortSignal) => {
    const ownerId = user?.uid
    if (authLoading || !ownerId) return

    const version = ++requestVersion.current
    setState((current) => ({
      ownerId,
      balance: current.ownerId === ownerId ? current.balance : null,
      error: false,
      loading: true,
    }))

    try {
      const balance = await api<CreditBalance>("/api/credits/me", { signal })
      if (!signal.aborted && requestVersion.current === version) {
        setState({ ownerId, balance, error: false, loading: false })
      }
    } catch {
      if (!signal.aborted && requestVersion.current === version) {
        setState({ ownerId, balance: null, error: true, loading: false })
      }
    }
  }, [api, authLoading, user?.uid])
  const refresh = useVisiblePolling(load, !authLoading && !!user, CREDIT_POLL_INTERVAL_MS)

  useEffect(() => {
    if (!user) return

    const refreshAfterMutation = () => void refresh()
    window.addEventListener(CREDIT_BALANCE_INVALIDATED_EVENT, refreshAfterMutation)
    return () => window.removeEventListener(CREDIT_BALANCE_INVALIDATED_EVENT, refreshAfterMutation)
  }, [refresh, user])

  const ownerId = user?.uid ?? null
  const belongsToCurrentUser = state.ownerId === ownerId

  return {
    balance: belongsToCurrentUser ? state.balance : null,
    error: belongsToCurrentUser ? state.error : false,
    loading: authLoading || (ownerId !== null && (!belongsToCurrentUser || state.loading)),
    refresh,
  }
}
