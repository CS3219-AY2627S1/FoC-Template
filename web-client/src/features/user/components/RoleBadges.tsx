import type { Role } from '@/api/user/types'

const roleBadges: Record<Role, { label: string; className: string }> = {
  member: { label: 'Member', className: 'ds-badge ds-badge--neutral' },
  administrator: { label: 'Administrator', className: 'ds-badge ds-badge--info' },
}

type RoleBadgesProps = {
  roles: Role[]
}

export function RoleBadges({ roles }: RoleBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span key={role} className={roleBadges[role].className}>
          {roleBadges[role].label}
        </span>
      ))}
    </div>
  )
}
