import { Link } from 'react-router'
import type { AccountSummary } from '@/api/user/types'

type AccountLinkProps = {
  // null when the account was deleted since; the user-service keeps the report anyway.
  account: AccountSummary | null
  // Names the page this link sits on, so the student page can offer the way back to it (BackButton).
  backLabel: string
}

export function AccountLink({ account, backLabel }: AccountLinkProps) {
  if (!account) return <span className="text-muted">Deleted account</span>
  return (
    <Link to={`/admin/students/${account.id}`} state={{ backLabel }} className="wrap-anywhere">
      {account.fullName}
    </Link>
  )
}
