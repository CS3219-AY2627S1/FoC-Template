import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { useCurrentUser } from '@/api/user/session'
import { Page } from '@/components/Page'
import { EditProfileForm } from '../components/EditProfileForm'

export function EditProfilePage() {
  const user = useCurrentUser()

  return (
    <Page
      title="Edit profile"
      actions={
        <Link to="/profile" className="ds-btn ds-btn--glass">
          <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
          Profile
        </Link>
      }
    >
      <div className="max-w-xl">
        <EditProfileForm user={user} />
      </div>
    </Page>
  )
}
