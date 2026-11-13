import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Empty, error and not-found screens: an icon, what happened and one next step (design.md). */
export function StatePanel({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
  headingLevel = 2,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
  action?: ReactNode
  compact?: boolean
  /** 3 when the panel sits inside a section that already has its own h2. */
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <div className={`card state-panel${compact ? ' state-panel-compact' : ''}`}>
      <span aria-hidden="true" className="state-icon">
        <Icon />
      </span>
      <Heading>{title}</Heading>
      <p>{children}</p>
      {action}
    </div>
  )
}
