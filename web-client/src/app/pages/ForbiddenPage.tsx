import { Link } from 'react-router'

type ForbiddenPageProps = {
  // The account that is logged in, so it is clear why access is refused.
  username?: string
}

// The explicit authorization error of the admin console for accounts without the
// administrator role (F5.1.1). The server refuses their requests anyway.
export function ForbiddenPage({ username }: ForbiddenPageProps) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <title>Access denied · Relay</title>
      <div className="ds-surface p-6">
        <p className="ds-label">Error 403</p>
        <h1 className="mt-2">Administrator access required</h1>
        <p className="mt-3 text-muted">
          {username ? `You are logged in as ${username}, which is not an administrator account.` : 'This account is not an administrator account.'}
        </p>
        <Link to="/" className="ds-btn ds-btn--primary mt-6 w-full">
          Back to Relay
        </Link>
      </div>
    </main>
  )
}
