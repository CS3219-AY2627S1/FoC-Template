import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

export function RouteErrorPage() {
  const error = useRouteError()

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <title>Something went wrong · Relay</title>
      <div className="ds-surface p-6">
        <p className="ds-label">Unexpected error</p>
        <h1 className="mt-2">Something went wrong</h1>
        <p className="mt-3 text-muted">
          Reload the page to try again. If it keeps happening, let the team know.
        </p>
        {/* The technical details help while developing, but mean nothing to users. */}
        {import.meta.env.DEV && (
          <pre className="ds-surface ds-surface--sunken mt-4 p-3 font-mono text-sm whitespace-pre-wrap wrap-anywhere">
            {describe(error)}
          </pre>
        )}
        <div className="mt-6 grid grid-cols-1 gap-3">
          <button
            type="button"
            className="ds-btn ds-btn--primary w-full"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
          <Link to="/" className="ds-btn ds-btn--glass w-full">
            Back to start
          </Link>
        </div>
      </div>
    </main>
  )
}

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return error.message
  return String(error)
}