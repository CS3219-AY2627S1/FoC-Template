/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Member page listing other people's OPEN errands (OS-F4), paged through the URL, with an
 *        Accept button on each card that drops the errand once it is taken or no longer available.
 * Author review: Reviewed and approved by @mattis.
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { listOpenErrands, runErrandAction } from '../api/errandApi'
import { Pagination } from '../components/Pagination'
import { TopBar } from '../components/TopBar'
import { ConfirmErrandAction } from './ConfirmErrandAction'
import { ErrandCard } from './ErrandCard'
import { describeActionError, isStaleErrandError } from './errandErrors'
import { ErrandListSkeleton } from './ErrandListSkeleton'
import { ErrandRequestError } from './ErrandRequestError'
import { pageFromParams, totalPages } from './paging'
import { actionCopy } from './presentation'
import { ERRAND_LIST_DEFAULT_SIZE, type Errand } from './types'
import { useRemoteData } from './useRemoteData'

type BoardFeedback =
  | { readonly kind: 'accepted'; readonly errand: Errand }
  | { readonly kind: 'error'; readonly title: string; readonly message: string }

export function OpenErrandsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = pageFromParams(searchParams)
  const { data, error, loading, reload } = useRemoteData(`open:${page}`, (signal) =>
    listOpenErrands({ page, size: ERRAND_LIST_DEFAULT_SIZE }, signal),
  )
  const here = `/errands${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
  const [confirming, setConfirming] = useState<Errand | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<BoardFeedback | null>(null)
  // Errands taken off the board at once, before the reloaded page arrives
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const visible = data ? data.items.filter((errand) => !removed.has(errand.id)) : []

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams)
    if (next <= 0) params.delete('page')
    else params.set('page', String(next))
    setSearchParams(params)
    setFeedback(null)
  }

  function takeOffBoard(errand: Errand) {
    setRemoved((current) => new Set(current).add(errand.id))
    reload()
  }

  async function accept(errand: Errand) {
    setBusy(true)
    setFeedback(null)
    try {
      await runErrandAction(errand.id, 'accept')
      setFeedback({ kind: 'accepted', errand })
      takeOffBoard(errand)
    } catch (acceptError) {
      const copy = describeActionError(acceptError)
      // Lost the race, or it was cancelled, expired or hidden meanwhile: it no longer belongs here
      const gone = isStaleErrandError(acceptError) || (acceptError instanceof ApiError && acceptError.status === 404)
      setFeedback({
        kind: 'error',
        title: copy.title,
        message: gone ? `${copy.message} It has been taken off the list.` : copy.message,
      })
      if (gone) takeOffBoard(errand)
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-600">Deliver and earn</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">Open errands</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Errands other members have posted, soonest listing deadline first. Accept one here, or open it for the full
              details.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={reload}
              disabled={loading}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-navy-50 disabled:opacity-50"
            >
              {loading && data ? 'Refreshing…' : 'Refresh'}
            </button>
            <Link
              to="/errands/new"
              className="inline-flex min-h-11 items-center rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600"
            >
              Post an errand
            </Link>
          </div>
        </div>

        {feedback?.kind === 'accepted' && (
          <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-semibold">{actionCopy('accept', feedback.errand).success}</p>
            <Link
              to={`/errands/${feedback.errand.id}`}
              state={{ from: '/errands/mine?as=courier' }}
              className="mt-1 inline-block font-semibold underline"
            >
              View the {feedback.errand.supplierName} errand
            </Link>
          </div>
        )}
        {feedback?.kind === 'error' && (
          <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-semibold">{feedback.title}</p>
            <p className="mt-1">{feedback.message}</p>
          </div>
        )}

        <section className="mt-7 space-y-5" aria-label="Open errands" aria-busy={loading}>
          {error !== null && <ErrandRequestError error={error} onRetry={reload} />}
          {error === null && data === null && <ErrandListSkeleton />}
          {error === null && data !== null && visible.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h2 className="text-lg font-bold text-navy-900">No open errands right now</h2>
              <p className="mt-2 text-sm text-slate-600">Check back soon, or post one of your own.</p>
            </div>
          )}
          {error === null && data !== null && visible.length > 0 && (
            <>
              <ul className="grid gap-4 sm:grid-cols-2">
                {visible.map((errand) => (
                  <ErrandCard
                    key={errand.id}
                    errand={errand}
                    from={here}
                    showState={false}
                    action={
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirming(errand)}
                        aria-label={`Accept errand from ${errand.supplierName}`}
                        className="min-h-11 w-full rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
                      >
                        Accept
                      </button>
                    }
                  />
                ))}
              </ul>
              <Pagination
                page={data.page}
                totalPages={totalPages(data)}
                totalItems={data.totalItems}
                noun="errands"
                label="Open errand pages"
                onPageChange={goToPage}
              />
            </>
          )}
        </section>
      </main>

      {confirming && (
        <ConfirmErrandAction
          copy={actionCopy('accept', confirming)}
          withReason={false}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void accept(confirming)}
        />
      )}
    </>
  )
}
