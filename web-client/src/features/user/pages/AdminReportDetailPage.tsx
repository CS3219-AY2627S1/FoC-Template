import { useParams } from 'react-router'
import { useReport } from '@/api/user/reports'
import { Page } from '@/components/Page'
import { QueryView } from '@/components/QueryView'
import { BackButton } from '../components/BackButton'
import { ReportDecision } from '../components/ReportDecision'
import { ReportDetails } from '../components/ReportDetails'

export function AdminReportDetailPage() {
  const { id = '' } = useParams()
  const report = useReport(id)

  return (
    <Page
      title={report.data ? `Report on errand #${report.data.errandId}` : 'Report'}
      actions={<BackButton fallbackTo="/admin/reports" fallbackLabel="Reports" />}
    >
      <QueryView query={report} loadingLabel="Loading report">
        {(loaded) => (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-1 gap-4 lg:col-span-2">
              <ReportDetails report={loaded} />
            </div>
            <ReportDecision report={loaded} />
          </div>
        )}
      </QueryView>
    </Page>
  )
}
