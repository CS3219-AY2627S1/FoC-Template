import { Link, useSearchParams } from 'react-router'
import { useReports } from '@/api/user/reports'
import type { ReportState } from '@/api/user/types'
import { EmptyState } from '@/components/EmptyState'
import { Page } from '@/components/Page'
import { Pagination } from '@/components/Pagination'
import { QueryView } from '@/components/QueryView'
import { formatDateTime } from '@/lib/format'
import { AccountLink } from '../components/AccountLink'
import { ReportLink } from '../components/ReportLink'
import { ReportStateBadge } from '../components/ReportStateBadge'
import { ErrandStatus } from '../components/ErrandStatus'
const pageSize = 20

// Open comes first and is the default: those reports still wait for a decision.
const stateFilters = [
  { value: 'Open', label: 'Open' },
  { value: 'Dismissed', label: 'Dismissed' },
  { value: 'Actioned', label: 'Actioned' },
  { value: 'all', label: 'All' },
]



// F5.5.4: the reports held by the user-service, newest first.
export function AdminReportsPage() {
  // State, account and page live in the URL, so reload, back and a shared link keep them.
  // An unknown state is refused by the user-service.
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = searchParams.get('state') ?? 'Open'
  const reportedId = searchParams.get('reportedId') ?? ''
  const page = Math.max(1, Math.trunc(Number(searchParams.get('page'))) || 1)
  const reports = useReports({
    page,
    pageSize,
    state: filter === 'all' ? undefined : (filter as ReportState),
    reportedId: reportedId || undefined,
  })
  const total = reports.data?.total
  // Every report about the account carries its name, so the first one can label the filter.
  const reportedName = reports.data?.items[0]?.reported?.fullName
  const filterLabel = filter === 'all' ? '' : `${filter.toLowerCase()} `

  // A new filter always starts again at page 1.
  function setParam(name: 'state' | 'reportedId', value: string | null) {
    setSearchParams((params) => {
      if (value) params.set(name, value)
      else params.delete(name)
      params.delete('page')
      return params
    })
  }

  function setPage(next: number) {
    setSearchParams((params) => {
      params.set('page', String(next))
      return params
    })
  }

  return (
    <Page title="Reports" subtitle={total === undefined ? undefined : `${total} ${total === 1 ? 'report' : 'reports'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Report state" className="ds-segmented">
          {stateFilters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setParam('state', option.value === 'Open' ? null : option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {reportedId && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 text-sm text-muted wrap-anywhere">About {reportedName ?? 'one account'}</p>
            <button type="button" className="ds-btn ds-btn--text" onClick={() => setParam('reportedId', null)}>
              Show all accounts
            </button>
          </div>
        )}
      </div>
      <QueryView
        query={reports}
        loadingLabel="Loading reports"
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
          ) : filter !== 'all' ? (
            <EmptyState
              title={`No ${filterLabel}reports${reportedId ? ' about this account' : ''}`}
              action={
                <button type="button" className="ds-btn ds-btn--glass" onClick={() => setParam('state', 'all')}>
                  Show all reports
                </button>
              }
            />
          ) : reportedId ? (
            <EmptyState
              title="No reports about this account"
              action={
                <button type="button" className="ds-btn ds-btn--glass" onClick={() => setParam('reportedId', null)}>
                  Show all accounts
                </button>
              }
            />
          ) : (
            <EmptyState
              title="No reports yet"
              description="Students report each other from an errand."
              action={
                <Link to="/admin/students" className="ds-btn ds-btn--glass">
                  Go to students
                </Link>
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
                    <th scope="col">Filed</th>
                    <th scope="col">Reported</th>
                    <th scope="col">Reporter</th>
                    <th scope="col">Errand</th>
                    <th scope="col">Reason</th>
                    <th scope="col">State</th>
                    <th scope="col">
                      <span className="sr-only">Report</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((report) => (
                    <tr key={report.id}>
                      <td className="nums-tabular">{formatDateTime(report.filedAt)}</td>
                      <td>
                        <AccountLink account={report.reported} backLabel="Reports" />
                      </td>
                      <td>
                        <AccountLink account={report.reporter} backLabel="Reports" />
                      </td>
                      <td className="nums-tabular wrap-anywhere">#{report.errandId} <ErrandStatus errandId={report.errandId} /></td>
                      <td className="wrap-anywhere">{report.reason}</td>
                      <td>
                        <ReportStateBadge state={report.state} />
                      </td>
                      <td>
                        <ReportLink report={report} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Below md the same reports as cards. */}
            <ul className="ds-surface ds-rows md:hidden">
              {result.items.map((report) => (
                <li key={report.id} className="grid grid-cols-1 gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-sm text-muted">
                      Errand #{report.errandId} · {formatDateTime(report.filedAt)}
                    </p>
                    <ErrandStatus errandId={report.errandId} />
                    <ReportStateBadge state={report.state} />
                  </div>
                  <p className="min-w-0 wrap-anywhere">
                    <AccountLink account={report.reported} backLabel="Reports" />
                    <span className="text-muted"> reported by </span>
                    <AccountLink account={report.reporter} backLabel="Reports" />
                  </p>
                  <p className="wrap-anywhere">{report.reason}</p>
                  <ReportLink report={report} />
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
