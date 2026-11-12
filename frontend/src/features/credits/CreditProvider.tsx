/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol) and GitHub Copilot code review (model unrecorded), 2026-10-23
 * Scope (AI-04): Reused balance loading logic and tested request cleanup.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { useNotifications } from '../notifications/useNotifications'
import { getAvailableBalance } from './credit.api'
import { CreditContext, type CreditContextValue, type CreditStatus } from './credit.context'

export function CreditProvider({ children }: PropsWithChildren) {
  const subscribe = useNotifications()?.subscribe
  const [availableBalance, setAvailableBalance] = useState<number | null>(null)
  const [status, setStatus] = useState<CreditStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const requestControllerRef = useRef<AbortController | null>(null)

  const refreshBalance = useCallback(async () => {
    requestControllerRef.current?.abort()
    const controller = new AbortController()
    requestControllerRef.current = controller
    setStatus('loading')
    setError(null)

    try {
      const balance = await getAvailableBalance(controller.signal)
      if (!controller.signal.aborted) {
        setAvailableBalance(balance)
        setStatus('ready')
      }
    } catch (requestError) {
      if (controller.signal.aborted) return
      setAvailableBalance(null)
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load your credit balance.',
      )
      setStatus('error')
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    let active = true

    queueMicrotask(() => {
      if (active) void refreshBalance()
    })

    return () => {
      active = false
      requestControllerRef.current?.abort()
    }
  }, [refreshBalance])

  useEffect(() => subscribe?.((signal) => {
    if (signal.type === 'connected'
        || signal.item.type === 'CREDIT_RECEIVED'
        || signal.item.type === 'CREDIT_RELEASED') {
      void refreshBalance()
    }
  }), [refreshBalance, subscribe])

  const value = useMemo<CreditContextValue>(
    () => ({ availableBalance, status, error, refreshBalance }),
    [availableBalance, error, refreshBalance, status],
  )

  return <CreditContext.Provider value={value}>{children}</CreditContext.Provider>
}
