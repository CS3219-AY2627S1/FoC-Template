import type { ReportState } from '@/api/user/types'

const reportBadges: Record<ReportState, { label: string; className: string }> = {
  Open: { label: 'Open', className: 'ds-badge ds-badge--info' },
  Dismissed: { label: 'Dismissed', className: 'ds-badge ds-badge--neutral' },
  Actioned: { label: 'Actioned', className: 'ds-badge ds-badge--danger' },
}

type ReportStateBadgeProps = {
  state: ReportState
}

export function ReportStateBadge({ state }: ReportStateBadgeProps) {
  return <span className={reportBadges[state].className}>{reportBadges[state].label}</span>
}
