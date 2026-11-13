import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  readSession,
  sessionChangedEvent,
  sessionExpiredEvent,
} from '../auth/session'
import { fetchReportContext, OrderApiError } from '../api/orderApi'
import { signInPath } from '../navigation'

/** Navigation only. Admin and Chat remain authoritative for reporting/privacy. */
export function ErrandReportPanel({ orderId }: { orderId: string }) {
  const [session, setSession] = useState(readSession)
  useEffect(() => {
    const refresh = () => setSession(readSession())
    window.addEventListener(sessionChangedEvent, refresh)
    window.addEventListener(sessionExpiredEvent, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener(sessionChangedEvent, refresh)
      window.removeEventListener(sessionExpiredEvent, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  const participantMode =
    session?.role === 'REQUESTER' ||
    session?.role === 'COURIER' ||
    session?.role === 'USER'
  const context = useQuery({
    queryKey: ['admin-report-context', session?.userId, session?.role, orderId],
    queryFn: () => fetchReportContext(orderId),
    enabled: !!participantMode,
    retry: false,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === 'PREPARING_REVIEW' ? 3000 : false,
  })
  if (!session)
    return (
      <section className="card errand-report">
        <h2 className="section-title">Your errand report</h2>
        <a
          className="button-secondary"
          href={signInPath('/errands/' + orderId)}
        >
          Sign in to view your report
        </a>
      </section>
    )
  if (!participantMode)
    return (
      <section className="card">
        <h2 className="section-title">Report an issue</h2>
        <p className="subtle">
          Switch to Requester or Courier mode to check your own report.
          Administrators review cases in the Admin tab.
        </p>
      </section>
    )
  if (context.isSuccess && context.data.status === 'INELIGIBLE') return null
  return (
    <section
      className="card errand-report"
      aria-labelledby="errand-report-title"
    >
      <h2 className="section-title" id="errand-report-title">
        Need help with this errand?
      </h2>
      {context.isPending ? (
        <p role="status">Checking your report access…</p>
      ) : context.isError ? (
        <>
          <p role="alert" className="notice notice-error">
            {context.error instanceof OrderApiError &&
            context.error.status === 401
              ? 'You’ve been signed out. Sign in again to see your report.'
              : context.error instanceof OrderApiError &&
                  context.error.status === 403
                ? 'Switch to Requester or Courier to report an issue.'
                : 'We can’t load reports right now. Please try again.'}
          </p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void context.refetch()}
          >
            Retry report access
          </button>
        </>
      ) : context.data.status === 'PREPARING_REVIEW' ? (
        <>
          <p role="status">
            Preparing review. Your request is saved. The errand pauses when the
            request is processed; review is ready after the errand and chat are
            confirmed.
          </p>
          <a
            className="button-secondary"
            href={`/admin/reports/${context.data.caseId}`}
          >
            View review progress
          </a>
        </>
      ) : context.data.status === 'OWN_REPORT' ? (
        <>
          <p>
            Your report is{' '}
            {context.data.state === 'RESOLVED'
              ? 'resolved'
              : context.data.state === 'UNDER_REVIEW'
                ? 'under review'
                : 'awaiting review'}
            . Only your own statement and private status are shown.
          </p>
          <a
            className="button-secondary"
            href={`/admin/reports/${context.data.caseId}`}
          >
            View your report
          </a>
        </>
      ) : context.data.status === 'CASE_PARTICIPANT' ? (
        <>
          <p>
            {context.data.state === 'RESOLVED'
              ? 'This errand was resolved after review.'
              : 'This errand is under review following a reported issue. You have not submitted a statement.'}
          </p>
          <a
            className="button-secondary"
            href={`/admin/reports/${context.data.caseId}`}
          >
            View case and contact admin
          </a>
          {context.data.state !== 'RESOLVED' && (
            <a
              className="button-secondary"
              href={`/admin/reports/new?orderId=${encodeURIComponent(orderId)}`}
            >
              Add your statement
            </a>
          )}
        </>
      ) : context.data.status === 'ELIGIBLE' ||
        context.data.status === 'REPORT_REQUEST_AVAILABLE' ||
        context.data.status === 'PREPARATION_AVAILABLE' ? (
        <>
          <p>
            Tell the review team about an issue with this errand. Your report
            and status are private. Your involvement is checked when you submit
            a request for review.
          </p>
          <a
            className="button-secondary"
            href={`/admin/reports/new?orderId=${encodeURIComponent(orderId)}`}
          >
            Report an issue
          </a>
        </>
      ) : null}
    </section>
  )
}
