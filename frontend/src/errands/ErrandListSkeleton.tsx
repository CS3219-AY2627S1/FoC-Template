/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Loading placeholder for the errand lists.
 * Author review: Reviewed and approved by @mattis.
 */
export function ErrandListSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 sm:grid-cols-2" role="status">
      <span className="sr-only">Loading errands…</span>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="h-3 w-16 rounded bg-slate-200" />
          <div className="h-6 w-2/3 rounded bg-slate-200" />
          <div className="h-4 w-full rounded bg-slate-200" />
          <div className="h-4 w-1/2 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  )
}
