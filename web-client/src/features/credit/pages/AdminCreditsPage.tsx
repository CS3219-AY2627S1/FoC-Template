import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLedger } from '@/api/credit/wallet'
import type { CreditTransactionType } from '@/api/credit/wallet'
import { EmptyState } from '@/components/EmptyState'
import { Page } from '@/components/Page'
import { Pagination } from '@/components/Pagination'
import { QueryView } from '@/components/QueryView'
import { TextField } from '@/components/TextField'
import { formatDateTime } from '@/lib/format'

const pageSize = 20

// The service returns the type; the client only chooses how to show it (like AccountStateBadge).
const typeBadge: Record<CreditTransactionType, string> = {
  allocation: 'ds-badge ds-badge--success',
  reservation: 'ds-badge ds-badge--info',
  transfer: 'ds-badge ds-badge--neutral',
  release: 'ds-badge ds-badge--neutral',
}

export function AdminCreditsPage() {
  // The student filter and page live in the URL, so reload, back and a shared link keep them.
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = searchParams.get('userId') ?? ''
  const page = Math.max(1, Math.trunc(Number(searchParams.get('page'))) || 1)
  const ledger = useLedger({ page, pageSize, userId: userId || undefined })
  const total = ledger.data?.total

  // The box holds what is typed until the search runs. When back, forward or "Clear filter"
  // change userId in the URL, the box follows.
  const [search, setSearch] = useState(userId)
  const [shownUserId, setShownUserId] = useState(userId)
  if (shownUserId !== userId) {
    setShownUserId(userId)
    setSearch(userId)
  }

  // A new filter always starts again at page 1.
  function setUserId(value: string) {
    setSearchParams((params) => {
      if (value) params.set('userId', value)
      else params.delete('userId')
      params.delete('page')
      return params
    })
  }

  function handleSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setUserId(search.trim())
  }

  function setPage(next: number) {
    setSearchParams((params) => {
      params.set('page', String(next))
      return params
    })
  }

  return (
    <Page title="Credits" subtitle={total === undefined ? undefined : `${total} ${total === 1 ? 'movement' : 'movements'}`}>
      <form role="search" noValidate onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-end">
        <TextField label="Student account id" name="userId" type="search" value={search} onChange={setSearch} />
        <button type="submit" className="ds-btn ds-btn--glass">
          Search
        </button>
      </form>
      <QueryView
        query={ledger}
        loadingLabel="Loading credit movements"
        isEmpty={(result) => result.items.length === 0}
        empty={
          total ? (
            <EmptyState
              title={`There is no page ${page}`}
              action={
                <button type="button" className="ds-btn ds-btn--glass" onClick={() => setPage(1)}>
                  Go to page 1
                </button>
              }
            />
          ) : (
            <EmptyState
              title={userId ? 'No movements for this account' : 'No credit movements yet'}
              action={
                userId ? (
                  <button type="button" className="ds-btn ds-btn--glass" onClick={() => setSearchParams({})}>
                    Clear filter
                  </button>
                ) : undefined
              }
            />
          )
        }
      >
        {(result) => (
          <>
            {/* From md a table; it scrolls inside its own box if the columns need more room. */}
            <div className="ds-surface hidden overflow-x-auto md:block">
              <table>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Student</th>
                    <th scope="col">Type</th>
                    <th scope="col">Errand</th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((tx) => (
                    <tr key={tx._id}>
                      <td className="nums-tabular">{formatDateTime(tx.createdAt)}</td>
                      <td>
                        <Link to={`/admin/students/${tx.userId}`} state={{ backLabel: 'Credits' }} className="font-mono text-xs wrap-anywhere">
                          {tx.userId}
                        </Link>
                      </td>
                      <td>
                        <span className={typeBadge[tx.type]}>{tx.type}</span>
                      </td>
                      <td className="font-mono text-xs text-muted wrap-anywhere">{tx.errandRef ?? '—'}</td>
                      <td>
                        <span className="ds-amount nums-tabular">{tx.amount}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Below md the same movements as cards. */}
            <ul className="ds-surface ds-rows md:hidden">
              {result.items.map((tx) => (
                <li key={tx._id} className="grid grid-cols-1 gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={typeBadge[tx.type]}>{tx.type}</span>
                    <span className="ds-amount nums-tabular">{tx.amount}</span>
                  </div>
                  <p className="text-sm text-muted">{formatDateTime(tx.createdAt)}</p>
                  <Link to={`/admin/students/${tx.userId}`} state={{ backLabel: 'Credits' }} className="font-mono text-xs wrap-anywhere">
                    {tx.userId}
                  </Link>
                  {tx.errandRef && <p className="font-mono text-xs text-subtle wrap-anywhere">{tx.errandRef}</p>}
                </li>
              ))}
            </ul>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPageChange={setPage} />
          </>
        )}
      </QueryView>
    </Page>
  )
}
