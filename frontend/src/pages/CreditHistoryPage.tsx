/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10 to 2026-11-11
 * Scope (AI-62): Implemented credit transaction history page
 * Author review: Code changes were checked and validated
 */


import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getTransactionHistory } from '../features/credits/credit.api'
import type {
  CreditHistoryPage as CreditHistoryPageData,
  CreditTransactionType,
} from '../features/credits/credit.types'

const TRANSACTIONS_PER_PAGE = 20

const typeLabels: Record<CreditTransactionType, string> = {
  RESERVED: 'Held',
  RELEASED: 'Refunded',
  TRANSFERRED: 'Paid out',
  RECEIVED: 'Earned',
}

const typeBadgeClasses: Record<CreditTransactionType, string> = {
  RESERVED: 'bg-[#fff3d8] text-amber-900',
  RELEASED: 'bg-[#e8eefc] text-[#2a4a9c]',
  TRANSFERRED: 'bg-[#f1f3f1] text-[#4b5650]',
  RECEIVED: 'bg-[#ddf3e7] text-[#175c45]',
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatAmount(amount: number) {
  if (amount === 0) return '—'
  return `${amount > 0 ? '+' : '−'}${Math.abs(amount).toLocaleString()}`
}

function amountClass(amount: number) {
  if (amount > 0) return 'text-[#175c45]'
  if (amount < 0) return 'text-red-700'
  return 'text-[#68736c]'
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

export function CreditHistoryPage() {
  const [pageNumber, setPageNumber] = useState(0)
  const [history, setHistory] = useState<CreditHistoryPageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getTransactionHistory({ page: pageNumber, size: TRANSACTIONS_PER_PAGE }, controller.signal)
      .then(setHistory)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return

        setErrorMessage(error instanceof Error ? error.message : 'Unable to load your credit history.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [pageNumber, retryCount])

  function requestPage(nextPageNumber: number) {
    setIsLoading(true)
    setErrorMessage(null)
    setPageNumber(nextPageNumber)
  }

  function retryRequest() {
    setIsLoading(true)
    setErrorMessage(null)
    setRetryCount((count) => count + 1)
  }

  const transactions = history?.items ?? []
  const hasPrevious = (history?.number ?? 0) > 0
  const hasNext = history ? history.number + 1 < history.totalPages : false

  return (
    <section>
      <div>
        <p className="text-xs font-medium tracking-[0.04em] text-[#175c45]">CREDITS</p>
        <h1 className="mt-2 text-[2rem] font-medium leading-tight tracking-[-0.035em] text-[#17211d] sm:text-[2.375rem]">
          Credit transaction history
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68736c] sm:text-base">
          Every credit held, refunded, paid out or earned on your errands.
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between" aria-live="polite">
        <p className="text-lg font-medium tracking-[-0.015em] text-[#17211d] sm:text-[1.375rem]">
          {isLoading && !history
            ? 'Loading credit transaction history…'
            : `${history?.totalElements ?? 0} ${history?.totalElements === 1 ? 'transaction' : 'transactions'}`}
        </p>
      </div>

      {errorMessage ? (
        <div
          className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-6 py-8 text-center"
          role="alert"
        >
          <h2 className="text-lg font-semibold text-red-900">Could not load credit transaction history</h2>
          <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
          <button
            type="button"
            onClick={retryRequest}
            className="mt-5 cursor-pointer rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
          >
            Try again
          </button>
        </div>
      ) : isLoading && !history ? (
        <div className="mt-4 rounded-[18px] border border-[#dde3de] bg-white px-6 py-12 text-center text-[#68736c]">
          Loading credit transaction history…
        </div>
      ) : transactions.length > 0 ? (
        <>
          <ul
            className={`mt-4 divide-y divide-[#eef1ee] overflow-hidden rounded-[18px] border border-[#dde3de] bg-white ${isLoading ? 'opacity-60' : ''}`}
          >
            {transactions.map((transaction) => (
              <li
                key={transaction.transactionId}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeBadgeClasses[transaction.type] ?? 'bg-[#f1f3f1] text-[#4b5650]'}`}
                    >
                      {typeLabels[transaction.type] ?? transaction.type}
                    </span>
                    <p className="text-sm font-medium text-[#17211d]">{transaction.description}</p>
                  </div>
                  <p className="mt-1 text-xs text-[#68736c]">
                    {formatDate(transaction.occurredAt)}
                    {transaction.orderId ? (
                      <>
                        {' · '}
                        <Link
                          to={`/errands/${encodeURIComponent(transaction.orderId)}`}
                          className="font-medium text-[#175c45] underline-offset-2 hover:underline"
                        >
                          View errand
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-baseline gap-4 sm:flex-col sm:items-end sm:gap-0.5">
                  <p className={`text-base font-semibold tabular-nums ${amountClass(transaction.amount)}`}>
                    {formatAmount(transaction.amount)}
                  </p>
                  <p className="text-xs tabular-nums text-[#68736c]">
                    Balance {transaction.balanceAfter.toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {history && history.totalPages > 1 ? (
            <nav className="mt-9 flex items-center justify-center gap-4" aria-label="Credit history pages">
              <button
                type="button"
                disabled={!hasPrevious || isLoading}
                onClick={() => requestPage(Math.max(0, history.number - 1))}
                className="cursor-pointer rounded-lg border border-[#dde3de] bg-white px-4 py-2 text-sm font-semibold text-[#175c45] transition hover:bg-[#f0f6f2] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-[#68736c]">
                Page {history.number + 1} of {history.totalPages}
              </span>
              <button
                type="button"
                disabled={!hasNext || isLoading}
                onClick={() => requestPage(history.number + 1)}
                className="cursor-pointer rounded-lg border border-[#dde3de] bg-white px-4 py-2 text-sm font-semibold text-[#175c45] transition hover:bg-[#f0f6f2] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-[18px] border border-dashed border-[#bdc8c0] bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-[#17211d]">No transactions yet</h2>
          <p className="mt-2 text-sm text-[#68736c]">
            Credits you spend or earn on errands will show up here.
          </p>
        </div>
      )}
    </section>
  )
}
