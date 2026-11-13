type LoadingStateProps = {
  // What is loading, read out by screen readers, e.g. "Loading suppliers".
  label: string
  rows?: number
  variant?: 'block' | 'page'
}

export function LoadingState({ label, rows = 3, variant = 'block' }: LoadingStateProps) {
  if (variant === 'page') {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center px-4">
        <p className="animate-pulse text-muted">{label}…</p>
      </div>
    )
  }

  return (
    <div role="status" className="ds-surface grid grid-cols-1 gap-3 p-5">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span
          // The bars never change order, so their position is a stable key.
          key={index}
          aria-hidden="true"
          className={index === rows - 1 ? 'ds-skeleton w-2/3 animate-pulse' : 'ds-skeleton w-full animate-pulse'}
        />
      ))}
    </div>
  )
}