/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of all Credit Service UIs and frontend functions
 * Author review: Tested locally on browser, ensured functions all connect correctly to backend
 */
import { authFetch } from '@relay/user-auth-frontend-fetch'
import '@relay/ui/styles.css'
import './styles.css'
import { useEffect, useRef, useState } from 'react'
import type {
  CreditRemoteProps,
  TransactionRecord,
  ViewCreditHistoryResponse,
} from '@relay/contracts'
import { BackButton, CloseButton, ErrorMessage, RelayButton } from '@relay/ui'
import {
  HISTORY_BATCH_SIZE,
  HISTORY_PAGE_SIZE,
  transactionDisplay,
  transactionTime,
} from './history'

async function fetchCreditHistory(
  offset: number,
  signal: AbortSignal,
): Promise<TransactionRecord[]> {
  const response = await authFetch(`/api/credit/history?offset=${offset}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`Credit history request failed (${response.status}).`)
  const result = (await response.json()) as ViewCreditHistoryResponse
  if (!Array.isArray(result.records)) throw new Error('Credit history response is invalid.')
  return result.records
}

export default function App({
  creditBalance,
  authenticatedSubject,
  authVersion,
  closeCredit,
  creditHistoryOpen = false,
  showCreditHistory,
  showCreditBalance,
}: CreditRemoteProps) {
  const [records, setRecords] = useState<TransactionRecord[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryVersion, setRetryVersion] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState('')
  const loadMoreController = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!creditHistoryOpen) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setLoadMoreError('')
    setLoadingMore(false)
    setHasMore(false)
    setRecords([])
    setPage(1)
    void fetchCreditHistory(0, controller.signal)
      .then((fetchedRecords) => {
        if (controller.signal.aborted) return
        setRecords(fetchedRecords)
        setHasMore(fetchedRecords.length === HISTORY_BATCH_SIZE)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Unable to load credit history.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
      loadMoreController.current?.abort()
    }
  }, [creditHistoryOpen, authenticatedSubject, authVersion, retryVersion])

  async function advancePage() {
    const loadedPageCount = Math.ceil(records.length / HISTORY_PAGE_SIZE)
    if (page < loadedPageCount) {
      setPage(page + 1)
      return
    }
    if (!hasMore || loadingMore) return
    const controller = new AbortController()
    loadMoreController.current = controller
    setLoadingMore(true)
    setLoadMoreError('')
    try {
      const nextRecords = await fetchCreditHistory(records.length, controller.signal)
      if (controller.signal.aborted) return
      setRecords((current) => [...current, ...nextRecords])
      setHasMore(nextRecords.length === HISTORY_BATCH_SIZE)
      if (nextRecords.length > 0) setPage(page + 1)
    } catch (cause) {
      if (!controller.signal.aborted) {
        setLoadMoreError(
          cause instanceof Error ? cause.message : 'Unable to load more credit history.',
        )
      }
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false)
      if (loadMoreController.current === controller) loadMoreController.current = null
    }
  }

  const pageCount = Math.max(1, Math.ceil(records.length / HISTORY_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleRecords = records.slice(
    (currentPage - 1) * HISTORY_PAGE_SIZE,
    currentPage * HISTORY_PAGE_SIZE,
  )
  const userId = creditBalance?.userId ?? authenticatedSubject ?? ''

  return (
    <section
      className={`credit-profile-content relay-design-system${creditHistoryOpen ? ' credit-history-screen' : ''}`}
      aria-label="Credits"
    >
      <div
        className="credit-view credit-balance-view"
        aria-hidden={creditHistoryOpen}
        inert={creditHistoryOpen}
      >
        <header className="credit-profile-header relay-card-header">
          <h1>Credits</h1>
          <CloseButton label="Close credits" onClick={closeCredit} />
        </header>
        <div className="credit-balance-grid">
          <div className="relay-glass-soft">
            <span>Available balance</span>
            <strong>{creditBalance?.availableCredit ?? '...'} cr</strong>
          </div>
          <div className="relay-glass-soft">
            <span>Reserve balance</span>
            <strong>{creditBalance?.reserveCredit ?? '...'} cr</strong>
          </div>
        </div>
        <RelayButton
          variant="secondary"
          className="credit-history-button"
          onClick={() => {
            setPage(1)
            showCreditHistory?.()
          }}
        >
          View credit history
        </RelayButton>
      </div>
      <div
        className="credit-view credit-history-view"
        aria-hidden={!creditHistoryOpen}
        inert={!creditHistoryOpen}
      >
        <header className="credit-profile-header relay-card-header">
          <div className="credit-history-title">
            <BackButton onClick={showCreditBalance} />
            <h1>Credit history</h1>
          </div>
          <CloseButton label="Close credits" onClick={closeCredit} />
        </header>
        {creditHistoryOpen && (
          <>
            {loading && (
              <p className="credit-history-state" role="status">
                Loading transactions...
              </p>
            )}
            {!loading && error && (
              <div className="credit-history-state">
                <ErrorMessage message={error} />
                <RelayButton onClick={() => setRetryVersion((current) => current + 1)}>
                  Try again
                </RelayButton>
              </div>
            )}
            {!loading && !error && records.length === 0 && (
              <p className="credit-history-state">No credit transactions yet.</p>
            )}
            {!loading && !error && records.length > 0 && (
              <>
                <div
                  className="credit-history-table-scroll"
                  role="region"
                  aria-label="Credit transactions"
                  tabIndex={0}
                >
                  <div className="credit-history-list" role="table" aria-label="Credit history">
                    <div className="credit-history-row credit-history-heading" role="row">
                      <span className="credit-history-cell-time" role="columnheader">
                        Time
                      </span>
                      <span className="credit-history-cell-type" role="columnheader">
                        Transaction
                      </span>
                      <span className="credit-history-cell-amount" role="columnheader">
                        Amount
                      </span>
                    </div>
                    {visibleRecords.map((record) => {
                      const display = transactionDisplay(record, userId)
                      return (
                        <div
                          className="credit-history-row"
                          role="row"
                          key={`${record.reference.service}:${record.reference.id}:${record.type}`}
                        >
                          <span className="credit-history-cell-time" role="cell">
                            <time dateTime={String(record.time)}>
                              {transactionTime(record.time)}
                            </time>
                          </span>
                          <span className="credit-history-cell-type" role="cell">
                            {display.type}
                          </span>
                          <span
                            className={`credit-history-cell-amount credit-amount credit-amount-${display.tone}`}
                            role="cell"
                          >
                            {display.amount}
                          </span>
                        </div>
                      )
                    })}
                    {Array.from(
                      { length: HISTORY_PAGE_SIZE - visibleRecords.length },
                      (_, index) => (
                        <div
                          className="credit-history-row"
                          aria-hidden="true"
                          key={`empty-${index}`}
                        >
                          <span />
                          <span />
                          <span />
                        </div>
                      ),
                    )}
                  </div>
                </div>
                {loadMoreError && <ErrorMessage message={loadMoreError} />}
                <nav className="credit-history-pagination" aria-label="Credit history pages">
                  <RelayButton
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous
                  </RelayButton>
                  <span>
                    Page {currentPage} of {pageCount}
                    {hasMore ? '+' : ''}
                  </span>
                  <RelayButton
                    disabled={loadingMore || (currentPage === pageCount && !hasMore)}
                    onClick={() => void advancePage()}
                  >
                    {loadingMore ? 'Loading...' : 'Next'}
                  </RelayButton>
                </nav>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
