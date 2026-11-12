import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { MyErrandCard } from '../components/errands/MyErrandCard'
import type { MyErrandFilter, MyErrandItem } from '../features/errands/my-errands.types'
import { loadMyErrands } from '../features/errands/errand.view'
import { useAuth } from '../features/auth/useAuth'
import { useErrandNotificationRevision } from '../features/notifications/useErrandNotificationRevision'

const filterOptions: Array<{ value: MyErrandFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'requester', label: 'Requesting' },
  { value: 'courier', label: 'Delivering' },
]

export function MyErrandsPage() {
  const { currentUserId } = useAuth()
  const [filter, setFilter] = useState<MyErrandFilter>('all')
  const [errands, setErrands] = useState<MyErrandItem[]>([])
  const [isLoading, setIsLoading] = useState(Boolean(currentUserId))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const notificationRevision = useErrandNotificationRevision()

  useEffect(() => {
    if (!currentUserId) return

    const controller = new AbortController()
    loadMyErrands(currentUserId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setErrands(items)
        setErrorMessage(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load your errands.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [currentUserId, refreshCount, notificationRevision])

  const displayedError = currentUserId
    ? errorMessage
    : 'Your access token does not contain a user ID.'

  const visibleErrands = useMemo(
    () =>
      filter === 'all'
        ? errands
        : errands.filter((errand) => errand.role === filter),
    [errands, filter],
  )

  function refreshErrands() {
    if (!currentUserId) return
    setIsLoading(true)
    setErrorMessage(null)
    setRefreshCount((count) => count + 1)
  }

  const emptyCopy =
    filter === 'requester'
      ? 'You do not have any active errand requests.'
      : filter === 'courier'
        ? 'You are not delivering any errands right now.'
        : 'Errands you request or accept will appear here.'

  return (
    <section>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.08em] text-[#175c45] sm:text-sm">
            YOUR ERRANDS
          </p>
          <h1 className="mt-2 text-[2rem] font-medium leading-[1.08] tracking-[-0.035em] text-[#17211d] sm:text-[2.375rem]">
            My errands
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68736c] sm:text-base">
            Keep track of errands you requested and deliveries you accepted.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-[#68736c]" aria-live="polite">
            {isLoading ? 'Loading…' : displayedError ? 'Unavailable' : `${visibleErrands.length} active`}
          </p>
          <button
            type="button"
            onClick={refreshErrands}
            disabled={isLoading || !currentUserId}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#bdc8c0] bg-white px-4 text-sm font-semibold text-[#175c45] transition hover:bg-[#f0f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] disabled:cursor-not-allowed disabled:opacity-60"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      <div
        className="mt-6 inline-flex rounded-xl border border-[#dde3de] bg-white p-1"
        role="group"
        aria-label="Filter my errands"
      >
        {filterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={[
              'cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]',
              filter === option.value
                ? 'bg-[#ddf3e7] text-[#175c45]'
                : 'text-[#68736c] hover:bg-[#f5f7f4] hover:text-[#17211d]',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {displayedError ? (
        <div className="mt-6 rounded-[18px] border border-red-200 bg-red-50 px-6 py-10 text-center" role="alert">
          <h2 className="text-lg font-medium text-red-900">Could not load your errands</h2>
          <p className="mt-2 text-sm text-red-700">{displayedError}</p>
          {currentUserId ? (
            <button
              type="button"
              onClick={refreshErrands}
              className="mt-5 cursor-pointer rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : isLoading ? (
        <div className="mt-6 rounded-[18px] border border-[#dde3de] bg-white px-6 py-12 text-center text-sm text-[#68736c]" role="status">
          Loading your active errands…
        </div>
      ) : visibleErrands.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleErrands.map((errand) => (
            <MyErrandCard key={errand.id} errand={errand} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-[18px] border border-dashed border-[#bdc8c0] bg-white px-6 py-12 text-center">
          <div
            className="mx-auto grid size-10 place-items-center rounded-full bg-[#ddf3e7] text-lg text-[#175c45]"
            aria-hidden="true"
          >
            ✓
          </div>
          <h2 className="mt-3 text-lg font-medium text-[#17211d]">No active errands</h2>
          <p className="mt-2 text-sm text-[#68736c]">{emptyCopy}</p>
          <Link
            to={filter === 'requester' ? '/errands/new' : '/'}
            className="mt-5 inline-block rounded-lg bg-[#d8f06b] px-4 py-2.5 text-sm font-semibold text-[#0d3c2d] transition hover:bg-[#cce85b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
          >
            {filter === 'requester' ? 'Create an errand' : 'Browse open errands'}
          </Link>
        </div>
      )}
    </section>
  )
}
