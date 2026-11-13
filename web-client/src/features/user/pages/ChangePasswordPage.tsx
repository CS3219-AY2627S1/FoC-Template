import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Page } from '@/components/Page'
import { ChangePasswordForm } from '../components/ChangePasswordForm'

export function ChangePasswordPage() {
  return (
    <Page
      title="Change password"
      actions={
        <Link to="/profile" className="ds-btn ds-btn--glass">
          <ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
          Profile
        </Link>
      }
    >
      <div className="max-w-xl">
        <ChangePasswordForm />
      </div>
    </Page>
  )
}
