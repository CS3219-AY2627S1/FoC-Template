import type { Report } from '@/api/user/types'
import { formatDateTime } from '@/lib/format'
import { AccountLink } from './AccountLink'
import { ReportStateBadge } from './ReportStateBadge'
import { ErrandStatus } from './ErrandStatus'

type ReportDetailsProps = {
  report: Report
}

// F1.6.5: what the reporter filed. The decision, once there is one, is shown by ReportDecision.
export function ReportDetails({ report }: ReportDetailsProps) {
  return (
    <section aria-labelledby="report-details" className="ds-surface grid grid-cols-1 gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="report-details">Report</h2>
        <ReportStateBadge state={report.state} />
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="ds-label">Reported</dt>
          <dd className="mt-1">
            <AccountLink account={report.reported} backLabel="Report" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Reported by</dt>
          <dd className="mt-1">
            <AccountLink account={report.reporter} backLabel="Report" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Errand</dt>
          <dd className="mt-1 nums-tabular">#{report.errandId} <ErrandStatus errandId={report.errandId}/></dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Filed</dt>
          <dd className="mt-1 nums-tabular">{formatDateTime(report.filedAt)}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="ds-label">Reason</dt>
          <dd className="mt-1 wrap-anywhere">{report.reason}</dd>
        </div>
      </dl>
    </section>
  )
}
