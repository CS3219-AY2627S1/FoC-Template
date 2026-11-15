/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Toast notification types and the useToast() hook.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { createContext, useContext } from 'react'

export type ToastKind = 'info' | 'warning' | 'success' | 'error'

export interface ToastApi {
  showToast: (message: string, kind?: ToastKind) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/** Use inside any component: const { showToast } = useToast() */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
