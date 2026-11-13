import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <title>Page not found · Relay</title>
      <div className="ds-surface p-6">
        <p className="ds-label">Error 404</p>
        <h1 className="mt-2">Page not found</h1>
        <p className="mt-3 text-muted">This page does not exist or has moved.</p>
        <Link to="/" className="ds-btn ds-btn--primary mt-6 w-full">
          Back to start
        </Link>
      </div>
    </main>
  )
}