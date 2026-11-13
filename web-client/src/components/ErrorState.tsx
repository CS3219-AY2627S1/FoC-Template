import { ApiError } from '@/lib/http'

type ErrorStateProps = {
  error: unknown
  onRetry?: () => void
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { title, message, retryable } = describe(error)

  return (
    <div role="alert" className="ds-surface grid grid-cols-1 gap-3 p-5">
      <p className="text-lg font-semibold text-danger">{title}</p>
      <p className="text-muted">{message}</p>
      {onRetry && retryable && (
        <button type="button" className="ds-btn ds-btn--glass justify-self-start" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

// The message is the service's own reason (N5.4). The title only sorts it into a kind of problem.
function describe(error: unknown): { title: string; message: string; retryable: boolean } {
  if (!(error instanceof ApiError)) {
    return { title: 'Something went wrong', message: 'An unexpected error occurred.', retryable: true }
  }
  if (error.status === 0) return { title: 'No connection', message: error.message, retryable: true }
  if (error.status >= 500) return { title: 'Temporarily unavailable', message: error.message, retryable: true }
  if (error.status === 403) return { title: 'Access denied', message: error.message, retryable: false }
  if (error.status === 404) return { title: 'Not found', message: error.message, retryable: false }
  return { title: 'Request refused', message: error.message, retryable: false }
}