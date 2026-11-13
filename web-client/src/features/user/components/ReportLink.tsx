import { Link } from 'react-router'
import type { Report } from '@/api/user/types'

type ReportLinkProps = {
  report: Report
}

// Open reports wait for a decision, so their link says so. The report page offers the way back (BackButton).
export function ReportLink({ report }: ReportLinkProps) {
  return (
    <Link to={`/admin/reports/${report.id}`} state={{ backLabel: 'Reports' }} className="justify-self-start">
      {report.state === 'Open' ? 'Decide' : 'View'}
      <span className="sr-only"> report on errand #{report.errandId}</span>
    </Link>
  )
}
