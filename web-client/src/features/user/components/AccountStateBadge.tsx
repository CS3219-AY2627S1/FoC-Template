import type { AccountState } from '@/api/user/types'

const stateBadges: Record<AccountState, { label: string; className: string }> = {
  Active: { label: 'Active', className: 'ds-badge ds-badge--success' },
  PendingVerification: { label: 'Pending verification', className: 'ds-badge ds-badge--info' },
  Suspended: { label: 'Suspended', className: 'ds-badge ds-badge--danger' },
}

type AccountStateBadgeProps = {
  state: AccountState
}

export function AccountStateBadge({ state }: AccountStateBadgeProps) {
  return <span className={stateBadges[state].className}>{stateBadges[state].label}</span>
}
