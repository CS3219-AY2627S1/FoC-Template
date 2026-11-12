import { Link } from 'react-router'
import creditIcon from '../../assets/errand-credit.svg'
import routeMarkers from '../../assets/errand-route.svg'
import type {
  MyErrandItem,
  MyErrandProgress,
} from '../../features/errands/my-errands.types'

type ActiveErrandsPanelProps = {
  errands: MyErrandItem[]
  isLoading?: boolean
  errorMessage?: string | null
  onRetry?: () => void
}

const progressLabels: Record<MyErrandProgress, string> = {
  'waiting-for-courier': 'Waiting for courier',
  accepted: 'Accepted',
  'ready-for-collection': 'Ready for pickup',
  'awaiting-confirmation': 'Awaiting confirmation',
}

export function ActiveErrandsSummary({
  errands,
  isLoading = false,
  errorMessage,
}: ActiveErrandsPanelProps) {
  return (
    <section
      aria-labelledby="mobile-active-errands-heading"
      className="mt-5 rounded-[16px] border border-[#cfe0d4] bg-[#edf8f1] p-4 xl:hidden"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p
            id="mobile-active-errands-heading"
            className="text-xs font-medium tracking-[0.06em] text-[#175c45]"
          >
            ACTIVE ERRANDS
          </p>
          <p className="mt-1 text-sm text-[#28332d]">
            {isLoading
              ? 'Loading your errands…'
              : errorMessage
                ? 'Active errands unavailable'
                : errands.length === 0
              ? 'You have no active errands.'
              : `${errands.length} ${errands.length === 1 ? 'errand' : 'errands'} in progress`}
          </p>
        </div>
        <Link
          to="/my-errands"
          className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#175c45] shadow-sm transition hover:bg-[#f8fbf9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
        >
          View my errands
        </Link>
      </div>
    </section>
  )
}

export function ActiveErrandsPanel({
  errands,
  isLoading = false,
  errorMessage,
  onRetry,
}: ActiveErrandsPanelProps) {
  const visibleErrands = errands.slice(0, 3)

  return (
    <aside aria-labelledby="active-errands-heading" className="hidden xl:block">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="active-errands-heading" className="text-sm font-medium text-[#17211d]">
          Active errands
        </h2>
        {errands.length > 0 ? (
          <span className="text-xs text-[#68736c]">{errands.length}</span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-3 rounded-[18px] border border-[#dde3de] bg-white px-5 py-8 text-center text-sm text-[#68736c]" role="status">
          Loading active errands…
        </div>
      ) : errorMessage ? (
        <div className="mt-3 rounded-[18px] border border-red-200 bg-red-50 px-5 py-6 text-center" role="alert">
          <p className="text-sm font-medium text-red-900">Could not load active errands</p>
          <p className="mt-1.5 text-xs leading-5 text-red-700">{errorMessage}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 cursor-pointer text-xs font-semibold text-red-800 underline underline-offset-4"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : visibleErrands.length > 0 ? (
        <div className="mt-3 space-y-3">
          {visibleErrands.map((errand) => (
            <article
              key={errand.id}
              className="rounded-[18px] border border-[#dde3de] bg-white p-4 shadow-[0_8px_24px_rgba(22,59,42,0.06)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-[#ddf3e7] px-2.5 py-1 text-[11px] font-medium text-[#1e694e]">
                  {progressLabels[errand.progress]}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#175c45]">
                  <img src={creditIcon} alt="" width="13" height="13" />
                  {errand.creditValue}
                </span>
              </div>
              <h3 className="mt-3 line-clamp-2 text-sm font-medium leading-5 text-[#17211d]">
                {errand.requiredItem}
              </h3>
              <div className="mt-3 flex gap-2 text-xs leading-5 text-[#68736c]">
                <img src={routeMarkers} alt="" width="14" height="21" className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate">{errand.pickupLocation}</p>
                  <p className="truncate">{errand.deliveryLocation}</p>
                </div>
              </div>
              <Link
                to={`/errands/${errand.id}`}
                className="mt-3 inline-flex rounded-sm text-xs font-semibold text-[#175c45] underline decoration-[#175c45]/30 underline-offset-4 transition hover:decoration-[#175c45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
              >
                View details →
              </Link>
            </article>
          ))}

          <Link
            to="/my-errands"
            className="flex h-10 items-center justify-center rounded-lg border border-[#bdc8c0] bg-white px-3 text-sm font-semibold text-[#175c45] transition hover:bg-[#f0f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
          >
            View all active errands
          </Link>
        </div>
      ) : (
        <div className="mt-3 rounded-[18px] border border-dashed border-[#bdc8c0] bg-white px-5 py-8 text-center shadow-[0_8px_24px_rgba(22,59,42,0.04)]">
          <div className="mx-auto grid size-10 place-items-center rounded-full bg-[#ddf3e7] text-lg text-[#175c45]" aria-hidden="true">
            ✓
          </div>
          <p className="mt-3 text-sm font-medium text-[#17211d]">No active errands</p>
          <p className="mt-1.5 text-xs leading-5 text-[#68736c]">
            Errands you request or accept will appear here.
          </p>
        </div>
      )}
    </aside>
  )
}
