import type { Supplier } from '@/api/supplier/types'

// The same as in features/supplier. A feature may not import another feature, so order keeps its own copy.
type OpenBadgeProps = {
  supplier: Supplier
}

// An Inactive supplier may still be open, but students cannot pick it, so that is what it shows.
export function OpenBadge({ supplier }: OpenBadgeProps) {
  if (supplier.status === 'Inactive') return <span className="ds-badge ds-badge--neutral">Inactive</span>
  return supplier.availability.open ? (
    <span className="ds-badge ds-badge--success">Open</span>
  ) : (
    <span className="ds-badge ds-badge--neutral">Closed</span>
  )
}
