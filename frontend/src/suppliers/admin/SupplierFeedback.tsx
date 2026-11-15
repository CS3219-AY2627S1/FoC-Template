/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added actionable Supplier administrator API feedback for issue #30.
 * Author review: Reviewed and approved by @ron.
 */
import { Link } from 'react-router'
import { ApiError, NetworkError } from '../../api/client'

interface SupplierFeedbackProps {
  readonly error: unknown
  readonly onRetry?: () => void
  readonly onReload?: () => void
  readonly onCompare?: () => void
}

export function SupplierFeedback({ error, onRetry, onReload, onCompare }: SupplierFeedbackProps) {
  const feedback = describeSupplierError(error)
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
      <p className="font-semibold">{feedback.title}</p>
      <p className="mt-1">{feedback.message}</p>
      {error instanceof ApiError && error.existingSupplierId && (
        <Link
          to={`/suppliers/${error.existingSupplierId}`}
          className="mt-3 inline-flex font-semibold text-navy-800 underline"
        >
          Open existing Supplier
        </Link>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {onCompare && error instanceof ApiError && error.status === 412 && (
          <button type="button" className={secondaryButtonClass} onClick={onCompare}>
            Compare with latest
          </button>
        )}
        {onReload && error instanceof ApiError && (error.status === 412 || error.status === 428) && (
          <button type="button" className={secondaryButtonClass} onClick={onReload}>
            Reload latest
          </button>
        )}
        {onRetry && (error instanceof NetworkError || (error instanceof ApiError && error.status === 503)) && (
          <button type="button" className={secondaryButtonClass} onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
      {error instanceof ApiError && error.requestId && (
        <details className="mt-3 text-xs text-red-800">
          <summary className="cursor-pointer">Support details</summary>
          Request ID: {error.requestId}
        </details>
      )}
    </div>
  )
}

function describeSupplierError(error: unknown): { title: string; message: string } {
  if (error instanceof NetworkError) {
    return { title: 'Cannot reach the service', message: error.message }
  }
  if (!(error instanceof ApiError)) {
    return { title: 'Something went wrong', message: 'Please try again.' }
  }
  if (error.status === 400) {
    return { title: 'Check the highlighted fields', message: error.message }
  }
  if (error.status === 401) {
    return { title: 'Session ended', message: 'Log in again before continuing.' }
  }
  if (error.status === 403) {
    return { title: 'Administrator access required', message: 'Your account cannot perform this action.' }
  }
  if (error.status === 409) {
    return { title: 'Supplier already exists', message: error.message }
  }
  if (error.status === 412) {
    return {
      title: 'This Supplier changed on the server',
      message: 'Your draft is still here. Compare it with the latest version or reload the latest values.',
    }
  }
  if (error.status === 428) {
    return {
      title: 'Current version required',
      message: 'Reload the Supplier to obtain its current version before saving.',
    }
  }
  if (error.status === 503) {
    return {
      title: 'Authentication service temporarily unavailable',
      message: 'No change was made. Wait a moment and try again.',
    }
  }
  return { title: 'Supplier request failed', message: error.message }
}

const secondaryButtonClass =
  'rounded-lg border border-red-300 bg-white px-3 py-2 font-semibold text-red-900 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500'
