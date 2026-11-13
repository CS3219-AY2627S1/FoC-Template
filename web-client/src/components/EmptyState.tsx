import type { ReactNode } from 'react'

type EmptyStateProps = {
  // Names what is empty, e.g. 'No suppliers match "coffee"'.
  title: string
  description?: ReactNode
  // N5.3: every empty list offers a way on, usually a control that changes the filter.
  action: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="ds-surface grid grid-cols-1 gap-3 p-5">
      <p className="text-lg font-semibold">{title}</p>
      {description && <p className="text-muted">{description}</p>}
      <div className="flex flex-wrap gap-3">{action}</div>
    </div>
  )
}