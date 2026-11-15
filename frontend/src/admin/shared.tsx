/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Small shared pieces for the admin pages: badges, the
 *        "load more" footer and the error box.
 * Author review: Reviewed and approved by @t-leongchuan
 */
import type { ReactNode } from 'react'
import { buttonClass, errorText } from './errors'

export function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
}

export function ErrorBox({ title, error, onRetry }: { title: string; error: unknown; onRetry?: () => void }) {
  return <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
    <h2 className="text-lg font-bold text-navy-900">{title}</h2>
    <p className="mt-2 text-sm text-slate-600">{errorText(error)}</p>
    {onRetry && <button type="button" className={`${buttonClass} mt-4`} onClick={onRetry}>Try again</button>}
  </div>
}

export function LoadMore({ hasMore, loadingMore, error, onLoadMore, noun }: {
  hasMore: boolean; loadingMore: boolean; error: unknown; onLoadMore: () => void; noun: string
}) {
  if (!hasMore && !error) return null
  return <div className="mt-4 flex flex-col items-center gap-2">
    {error !== null && <p role="alert" className="text-sm text-red-700">{errorText(error)}</p>}
    {hasMore && <button type="button" className={buttonClass} disabled={loadingMore} onClick={onLoadMore}>
      {loadingMore ? 'Loading…' : `Load more ${noun}`}
    </button>}
  </div>
}
