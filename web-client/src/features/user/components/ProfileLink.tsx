import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

type ProfileLinkProps = {
  to: string
  icon: LucideIcon
  label: string
  detail: string
}

// One row of the profile's settings list: the whole row is the link, so it is an easy tap target.
export function ProfileLink({ to, icon: Icon, label, detail }: ProfileLinkProps) {
  return (
    <Link to={to} className="ds-nav-item">
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className="grid min-w-0 flex-1 grid-cols-1">
        <span className="text-ink">{label}</span>
        <span className="text-sm font-normal text-muted">{detail}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-subtle" />
    </Link>
  )
}
