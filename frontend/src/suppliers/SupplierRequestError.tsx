/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Implemented actionable Supplier request error states for issue #29.
 * Author review: Reviewed and approved by @ron.
 */
import { ApiError, NetworkError } from '../api/client'

interface SupplierRequestErrorProps {
  readonly error: unknown
  readonly onRetry?: () => void
}

export function SupplierRequestError({ error, onRetry }: SupplierRequestErrorProps) {
  const content = describeError(error)

  return (
    <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert">
      <h2 className="text-lg font-bold text-navy-900">{content.title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{content.message}</p>
      {error instanceof ApiError && error.requestId && (
        <p className="mt-2 text-xs text-slate-500">Support reference: {error.requestId}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 min-h-11 rounded-lg bg-navy-800 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-700"
        >
          Try again
        </button>
      )}
    </section>
  )
}

function describeError(error: unknown): { title: string; message: string } {
  if (error instanceof NetworkError) {
    return {
      title: "We couldn't reach Supplier Service",
      message: 'Check your connection or wait for the service to finish starting, then try again.',
    }
  }
  if (error instanceof ApiError) {
    if (error.status === 400) return { title: 'Check your search filters', message: error.message }
    if (error.status === 401) return { title: 'Your session has ended', message: 'Please log in again to continue.' }
    if (error.status === 403) return { title: "You don't have permission", message: error.message }
    if (error.status === 404) return { title: 'Supplier not found', message: 'This Supplier is unavailable or does not exist.' }
    if (error.status === 503) {
      return {
        title: 'Supplier Service is temporarily unavailable',
        message: 'Your session could not be verified or the service is still starting. Please try again shortly.',
      }
    }
    return { title: 'Supplier data could not be loaded', message: error.message }
  }
  return { title: 'Supplier data could not be loaded', message: 'Something went wrong. Please try again.' }
}
