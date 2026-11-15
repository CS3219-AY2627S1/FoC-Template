/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Error panel with a retry button for errand pages that failed to load.
 * Author review: Reviewed and approved by @mattis.
 */
import { describeLoadError } from './errandErrors'

interface ErrandRequestErrorProps {
  readonly error: unknown
  readonly onRetry?: () => void
}

export function ErrandRequestError({ error, onRetry }: ErrandRequestErrorProps) {
  const content = describeLoadError(error)
  return (
    <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert">
      <h2 className="text-lg font-bold text-navy-900">{content.title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{content.message}</p>
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
