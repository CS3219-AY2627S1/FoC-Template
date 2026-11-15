/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: The author's "Service temporarily unavailable" screen with Try again, shown when the
 *        login check on page load fails for a reason other than 401.
 * Author review: Reviewed and approved by @t-leongchuan
 */
export function ServiceUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section role="alert" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-navy-900">Service temporarily unavailable</h1>
        <p className="mt-3 text-sm text-slate-600">
          We couldn’t reach the server just now. You are still logged in; please try again in a moment.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 min-h-11 rounded-lg bg-navy-800 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-700"
        >
          Try again
        </button>
      </section>
    </main>
  )
}
