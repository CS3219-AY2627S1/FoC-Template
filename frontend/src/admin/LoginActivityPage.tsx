/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Login activity page: every login attempt, including unknown usernames, with outcome
 *        and reason filters kept in the URL.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useSearchParams } from 'react-router'
import { AdminShell } from './AdminShell'
import { OUTCOME_LABELS, REASON_LABELS } from './format'
import { LoginEventsList } from './LoginEventsList'
import { buttonClass, inputClass } from './errors'
import { LOGIN_OUTCOMES, LOGIN_REASONS, type LoginOutcome, type LoginReason } from './types'

export function LoginActivityPage() {
  const [params, setParams] = useSearchParams()
  const outcomeParam = params.get('outcome')
  const reasonParam = params.get('reason')
  const outcome = LOGIN_OUTCOMES.includes(outcomeParam as LoginOutcome) ? (outcomeParam as LoginOutcome) : undefined
  const reason = LOGIN_REASONS.includes(reasonParam as LoginReason) ? (reasonParam as LoginReason) : undefined

  function set(name: 'outcome' | 'reason', value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next)
  }

  return <AdminShell title="Login activity" intro="Every login attempt, newest first, including attempts on usernames that don't exist. Times shown in Singapore time; hover over a browser to see its full description.">
    <form aria-label="Filter login attempts" onSubmit={(e) => e.preventDefault()} className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <label className="min-w-0 text-sm font-medium text-navy-900">Outcome
          <select value={outcome ?? ''} onChange={(e) => set('outcome', e.target.value)} className={inputClass}>
            <option value="">Any outcome</option>
            {LOGIN_OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-sm font-medium text-navy-900">Reason
          <select value={reason ?? ''} onChange={(e) => set('reason', e.target.value)} className={inputClass}>
            <option value="">Any reason</option>
            {LOGIN_REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
          </select>
        </label>
        <button type="button" className={buttonClass} onClick={() => setParams(new URLSearchParams())}>Clear filters</button>
      </div>
    </form>
    <section className="mt-6" aria-label="Login attempts list">
      <LoginEventsList query={{ outcome, reason }} pageSize={50} showAccount />
    </section>
  </AdminShell>
}
