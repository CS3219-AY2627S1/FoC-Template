/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Compact stacked Reserved/Available balances beside user details for #65. Author review: Reviewed and approved by @phuc. */
import { useEffect, useState } from 'react'
import { getCreditBalance } from '../api/creditApi'
import { ApiError } from '../api/client'
import type { CreditBalance } from './types'

export function CreditBalanceSummary({ refreshKey }: { refreshKey: number }) {
  const [attempt, setAttempt] = useState(0)
  const key = `${refreshKey}:${attempt}`
  const [state, setState] = useState<{ key: string; data: CreditBalance | null; error: unknown }>({ key: '', data: null, error: null })
  const loading = state.key !== key
  const data = loading ? null : state.data
  const error = loading ? null : state.error

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    getCreditBalance(controller.signal).then(
      (data) => { if (current) setState({ key, data, error: null }) },
      (error: unknown) => { if (current && !controller.signal.aborted) setState({ key, data: null, error }) },
    )
    return () => { current = false; controller.abort() }
  }, [key])

  const errorMessage = error instanceof ApiError && error.code === 'CREDIT_ACCOUNT_NOT_READY'
    ? 'Your credit account is still being set up. Please try again shortly.'
    : 'Couldn’t load your current credit balance. Please try again.'

  return <div role="group" aria-label="Current credit balance" aria-busy={loading} className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] sm:text-xs">
    <dl className="flex flex-col gap-0.5">
      {([['reserved', 'Reserved'], ['available', 'Available']] as const).map(([field, label]) => <div key={field} className="flex items-baseline justify-between gap-2 whitespace-nowrap">
        <dt className="text-slate-500">{label}</dt>
        <dd className="font-semibold tabular-nums text-navy-900" aria-live="polite">{loading ? '…' : data ? new Intl.NumberFormat('en-SG').format(data[field]) : '—'}</dd>
      </div>)}
    </dl>
    {error !== null && <button type="button" aria-label="Retry balance" title={errorMessage} className="rounded px-1 py-1 font-medium text-navy-700 underline hover:bg-navy-50" onClick={() => setAttempt((value) => value + 1)}>Retry</button>}
  </div>
}
