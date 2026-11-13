/** Loading placeholders shaped like the final layout; the label is read out instead of the shapes. */
export function ErrandListSkeleton({
  label,
  count = 3,
}: {
  label: string
  count?: number
}) {
  return (
    <div className="skeleton-list" role="status">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div aria-hidden="true" className="card skeleton-card" key={index}>
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line skeleton-short" />
        </div>
      ))}
    </div>
  )
}

export function ErrandDetailSkeleton({ label }: { label: string }) {
  return (
    <div className="two-column" role="status">
      <span className="visually-hidden">{label}</span>
      <div aria-hidden="true">
        <span className="skeleton skeleton-heading" />
        <span className="skeleton skeleton-line skeleton-short" />
        <span className="skeleton skeleton-block" />
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line" />
      </div>
      <div aria-hidden="true" className="card skeleton-card">
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line skeleton-short" />
      </div>
    </div>
  )
}
