/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Coloured label for an errand's state.
 * Author review: Reviewed and approved by @mattis.
 */
import { STATE_LABELS, STATE_TONES, type StateTone } from './presentation'
import type { ErrandState } from './types'

const TONE_CLASSES: Readonly<Record<StateTone, string>> = {
  pending: 'bg-slate-100 text-slate-700',
  open: 'bg-sky-100 text-sky-800',
  active: 'bg-navy-100 text-navy-800',
  attention: 'bg-amber-100 text-amber-800',
  success: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-100 text-red-800',
}

export function ErrandStateBadge({ state }: { readonly state: ErrandState }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[STATE_TONES[state]]}`}>
      {STATE_LABELS[state]}
    </span>
  )
}
