/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component StatusChip.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import { Check } from 'lucide-react'
import { STATUS_LABELS } from '../data/requests'

const STYLES = {
  open: 'bg-surface border border-blue text-blue',
  accepted: 'bg-orange border border-orange text-white',
  picked_up: 'bg-surface border border-orange text-orange',
  delivered: 'bg-ink border border-ink text-white',
  completed: 'bg-surface border border-line text-ink-40',
  cancelled: 'bg-surface-alt border border-surface-alt text-ink-40',
  expired: 'bg-surface-alt border border-surface-alt text-ink-40',
}

// `sm` is used where the chip sits on top of a photo and has to fit a small thumbnail.
const SIZES = {
  md: 'h-6 px-2.5 text-xs',
  sm: 'h-5 px-2 text-[11px]',
}

export default function StatusChip({ status, size = 'md', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill font-medium ${SIZES[size]} ${
        STYLES[status] || STYLES.completed
      } ${className}`}
    >
      {status === 'completed' && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
      {STATUS_LABELS[status] || status}
    </span>
  )
}
