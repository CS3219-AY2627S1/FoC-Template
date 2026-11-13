import { useParams } from 'react-router'
import { useUser } from '@/api/user/admin'
import { Page } from '@/components/Page'
import { QueryView } from '@/components/QueryView'
import { AccountBalance } from '../components/AccountBalance'
import { AccountDetails } from '../components/AccountDetails'
import { AccountReports } from '../components/AccountReports'
import { AccountStateForm } from '../components/AccountStateForm'
import { AdministratorRole } from '../components/AdministratorRole'
import { BackButton } from '../components/BackButton'
import { StateHistory } from '../components/StateHistory'

export function AdminStudentDetailPage() {
  const { id = '' } = useParams()
  const user = useUser(id)

  return (
    <Page
      title={user.data?.fullName ?? 'Student'}
      actions={<BackButton fallbackTo="/admin/students" fallbackLabel="Students" />}
    >
      <QueryView query={user} loadingLabel="Loading account">
        {(account) => (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-1 gap-4 lg:col-span-2">
              <AccountDetails account={account} />
              <StateHistory changes={account.stateChanges} />
              <AccountReports accountId={account.id} />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <AccountStateForm account={account} />
              <AdministratorRole account={account} />
              <AccountBalance accountId={account.id} />
            </div>
          </div>
        )}
      </QueryView>
    </Page>
  )
}
