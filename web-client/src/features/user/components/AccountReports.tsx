import { Link } from 'react-router'
import { useReports } from '@/api/user/reports'
import { EmptyState } from '@/components/EmptyState'
import { QueryView } from '@/components/QueryView'
import { formatDateTime } from '@/lib/format'
import { ReportStateBadge } from './ReportStateBadge'

type AccountReportsProps = {
  accountId: string
}

const shown = 5

// The newest reports that name this account. The full list with filters is on /admin/reports.
export function AccountReports({ accountId }: AccountReportsProps) {
  const reports = useReports({ page: 1, pageSize: shown, reportedId: accountId })
  // state=all, since this section lists every state and the report list starts on Open
  const allReports = `/admin/reports?state=all&reportedId=${accountId}`

  return (
    <section aria-labelledby="account-reports" className="grid grid-cols-1 gap-4">
      <h2 id="account-reports">Reports about this account</h2>
      <QueryView
        query={reports}
        loadingLabel="Loading reports"
        isEmpty={(result) => result.items.length === 0}
        empty={
          <EmptyState
            title="Nobody has reported this account"
            action={
              <Link to="/admin/reports" className="ds-btn ds-btn--glass">
                All reports
              </Link>
            }
          />
        }
      >
        {(result) => (
          <>
            <ul className="ds-surface ds-rows">
              {result.items.map((report) => (
                <li key={report.id} className="grid grid-cols-1 gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ReportStateBadge state={report.state} />
                    <p className="min-w-0 text-sm text-muted wrap-anywhere">
                      Errand #{report.errandId} · by {report.reporter ? report.reporter.fullName : 'a deleted account'} ·{' '}
                      {formatDateTime(report.filedAt)}
                    </p>
                  </div>
                  <p className="wrap-anywhere">{report.reason}</p>
                </li>
              ))}
            </ul>
            {result.total > shown && (
              <Link to={allReports} className="justify-self-start">
                All {result.total} reports about this account
              </Link>
            )}
          </>
        )}
      </QueryView>
    </section>
  )
}
