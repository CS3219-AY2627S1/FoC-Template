import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  FileCheck,
  FileExclamationPoint,
  FileSearch,
  FolderOpen,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { AdminShell } from './components/AdminShell'
import { readSession } from './auth/session'
import { AccessError, checkAccess } from './access'
import { EvidencePanel, type Timeline } from './EvidencePanel'
import { CaseParticipants } from './CaseParticipants'
import { useParticipantNames } from './useParticipantNames'
import { formatSingaporeTime } from './time'
import { ResolutionPanel } from './ResolutionPanel'
import { readPendingClosure } from './closureState'
import { ParticipantConversationStatus } from './CaseConversations'
import {
  CaseError,
  caseErrorMessage,
  isUuid,
  isReportContext,
  request,
  uuidPattern,
  type Detail,
  type Page,
  type Report,
  type ReportContext,
  type Summary,
} from './cases'

function message(error: unknown) {
  if (error instanceof CaseError || error instanceof AccessError) {
    if (
      error.message.startsWith('Reviewer independence could not be verified.')
    )
      return error instanceof CaseError
        ? caseErrorMessage(error)
        : 'Switch to the right role in your account menu to see this.'
    if (error.status === 401)
      return 'You’ve been signed out. Please sign in again.'
    if (error.status === 403)
      return error instanceof CaseError
        ? caseErrorMessage(error)
        : 'Switch to the right role in your account menu to see this.'
    if (error.status === 404) return 'This case isn’t available to you.'
    if (error.status < 500)
      return error instanceof CaseError
        ? caseErrorMessage(error)
        : 'Switch to the right role in your account menu to see this.'
  }
  return 'We couldn’t load this. Please try again.'
}

export function CaseWorkspace() {
  const [session, setSession] = useState(readSession)
  useEffect(() => {
    const refresh = () => setSession(readSession())
    const timer = window.setInterval(refresh, 15_000)
    const events = ['focus', 'foc:session-changed', 'foc:session-expired']
    events.forEach((e) => window.addEventListener(e, refresh))
    return () => {
      clearInterval(timer)
      events.forEach((e) => window.removeEventListener(e, refresh))
    }
  }, [])
  return (
    <Workspace key={session?.accessToken || 'signed-out'} session={session} />
  )
}

function Workspace({ session }: { session: ReturnType<typeof readSession> }) {
  const participant = window.location.pathname.startsWith('/admin/reports')
  const id = window.location.pathname.split('/')[3] || ''
  const suppliedOrder =
    new URLSearchParams(window.location.search).get('orderId') || ''
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!session || participant) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)
    let active = true
    checkAccess(session, controller.signal)
      .then(() => {
        if (active) setVerified(true)
      })
      .catch((e) => {
        if (active) {
          setVerified(false)
          setError(message(e))
        }
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [session, participant, attempt])
  useEffect(() => {
    if (!verified) return
    const timer = window.setTimeout(() => {
      setAttempt((n) => n + 1)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [verified, attempt])
  const allowed =
    session &&
    (participant
      ? session.role === 'REQUESTER' || session.role === 'COURIER'
      : verified)
  return (
    <AdminShell administratorAccess={verified}>
      <div className="page-intro">
        <div>
          <p className="eyebrow">
            {participant ? 'Report an issue' : 'Administration'}
          </p>
          <h1>
            {participant
              ? id && id !== 'new'
                ? 'Your report'
                : 'Report an errand issue'
              : 'Case review'}
          </h1>
          <p>
            {participant
              ? id && id !== 'new'
                ? 'Check your case status and messages from your admin.'
                : 'Tell us what happened and an admin will look into it.'
              : 'Review reports and assign yourself an open case to begin.'}
          </p>
        </div>
      </div>
      {!participant && (
        <a
          className="back-link"
          href={id ? '/admin/cases' + window.location.search : '/admin'}
        >
          <Arrow direction="back" />
          {id ? 'Back to case queue' : 'Back to Admin overview'}
        </a>
      )}
      {participant && id === 'new' && isUuid(suppliedOrder) && (
        <a className="back-link" href={'/errands/' + suppliedOrder}>
          <Arrow direction="back" />
          Back to errand
        </a>
      )}
      {!session ? (
        <section className="message-card">
          <h2>Sign in to continue</h2>
          <a
            className="button"
            href={
              '/?returnTo=' +
              encodeURIComponent(
                window.location.pathname + window.location.search,
              )
            }
          >
            Sign in to FoC
          </a>
        </section>
      ) : !allowed ? (
        <section className="message-card">
          <h2>
            {error ||
              (participant
                ? 'Switch to Requester or Courier in your account menu to report an issue.'
                : 'Checking your access')}
          </h2>
          {error && (
            <button
              onClick={() => {
                setError('')
                setAttempt((n) => n + 1)
              }}
            >
              Try again
            </button>
          )}
        </section>
      ) : participant ? (
        id && id !== 'new' ? (
          <ReportStatus id={id} />
        ) : (
          <ReportEntry actor={session.userId} orderId={suppliedOrder} />
        )
      ) : id ? (
        <CaseDetail id={id} actor={session.userId} />
      ) : (
        <CaseQueue actor={session.userId} />
      )}
    </AdminShell>
  )
}

function Arrow({ direction = 'forward' }: { direction?: 'forward' | 'back' }) {
  return direction === 'back' ? (
    <ArrowLeft aria-hidden="true" className="ui-icon" />
  ) : (
    <ArrowRight aria-hidden="true" className="ui-icon" />
  )
}

function useRemote<T>(path: string, poll = false) {
  const [response, setResponse] = useState<{
    path: string
    data?: T
    error?: string
  }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    let active = true
    request<T>(path, controller.signal)
      .then((value) => {
        if (active) setResponse({ path, data: value })
      })
      .catch((e) => {
        if (active) setResponse({ path, error: message(e) })
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [path, attempt])
  useEffect(() => {
    if (!poll) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setAttempt((n) => n + 1)
    }, 3000)
    return () => clearInterval(timer)
  }, [poll, path])
  return {
    data: response?.path === path ? response.data : undefined,
    error: response?.path === path ? response.error || '' : '',
    retry: () => {
      setResponse(undefined)
      setAttempt((n) => n + 1)
    },
  }
}

function Feedback({
  error,
  retry,
  loading = 'Loading case…',
}: {
  error: string
  retry: () => void
  loading?: string
}) {
  return error ? (
    <section className="message-card" role="alert">
      <h2>{error}</h2>
      <button onClick={retry}>Try again</button>
    </section>
  ) : (
    <p role="status">{loading}</p>
  )
}
function SummaryCard({
  value,
  participant = false,
  actor,
}: {
  value: Summary
  participant?: boolean
  actor?: string
}) {
  const status = participant
    ? {
        OPEN: 'Waiting for review',
        UNDER_REVIEW: 'Under review',
        RESOLVED: 'Closed',
      }
    : { OPEN: 'Open', UNDER_REVIEW: 'Under review', RESOLVED: 'Resolved' }
  return (
    <>
      <dl className="case-facts">
        <div>
          <dt>Status</dt>
          <dd>
            <span className="role-chip">
              {value.reviewStatus === 'PREPARING'
                ? 'Preparing review'
                : value.reviewStatus === 'REJECTED'
                  ? 'Review preparation blocked'
                  : status[value.state]}
            </span>
          </dd>
        </div>
        {participant && (
          <div>
            <dt>Case ID</dt>
            <dd>{value.caseId}</dd>
          </div>
        )}
        {participant && (
          <div>
            <dt>Errand ID</dt>
            <dd>{value.orderId}</dd>
          </div>
        )}
        <div>
          <dt>{participant ? 'Case admin' : 'Reviewer'}</dt>
          <dd>
            {participant
              ? value.reviewerId
                ? 'Assigned'
                : 'Awaiting assignment'
              : value.reviewerId
                ? value.reviewerId === actor
                  ? 'Assigned to you'
                  : 'Another admin'
                : 'Unassigned'}
          </dd>
        </div>
        <div>
          <dt>Case opened</dt>
          <dd>{formatSingaporeTime(value.createdAt)}</dd>
        </div>
      </dl>
      {!participant && (
        <details className="evidence-technical">
          <summary>Case references</summary>
          <dl className="case-facts">
            <div>
              <dt>Case ID</dt>
              <dd>{value.caseId}</dd>
            </div>
            <div>
              <dt>Errand ID</dt>
              <dd>{value.orderId}</dd>
            </div>
            <div>
              <dt>Reviewer account ID</dt>
              <dd>{value.reviewerId || 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Record version</dt>
              <dd>{value.revision}</dd>
            </div>
          </dl>
        </details>
      )}
    </>
  )
}

type Pending = { key: string; body: Record<string, string | number> }
function useMutation<T>(storageKey: string) {
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(storageKey) || 'null',
      ) as Pending | null
      return value &&
        isUuid(value.key) &&
        value.body &&
        typeof value.body === 'object'
        ? value
        : null
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<T>()
  async function submit(path: string, body: Pending['body']) {
    if (busy) return
    const operation = pending || { key: crypto.randomUUID(), body }
    // Save before sending: a reload or lost response retries the identical operation.
    sessionStorage.setItem(storageKey, JSON.stringify(operation))
    setPending(operation)
    setBusy(true)
    setError('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    try {
      setResult(await request<T>(path, controller.signal, operation))
      sessionStorage.removeItem(storageKey)
      setPending(null)
    } catch (e) {
      setError(
        e instanceof CaseError &&
          (e.status < 500 ||
            e.message.startsWith(
              'Reviewer independence could not be verified.',
            ))
          ? message(e)
          : 'We’re not sure your report went through. Tap retry to check.',
      )
      if (e instanceof CaseError && e.status < 500) {
        sessionStorage.removeItem(storageKey)
        setPending(null)
      }
    } finally {
      clearTimeout(timeout)
      setBusy(false)
    }
  }
  return { pending, busy, error, result, submit }
}

function ReportEntry({ actor, orderId }: { actor: string; orderId: string }) {
  if (!isUuid(orderId))
    return (
      <section className="message-card">
        <h2>Choose an errand to report</h2>
        <p>Pick the errand this is about.</p>
        <a className="button" href="/errands/mine">
          Go to my errands
        </a>
      </section>
    )
  return <ReportEntryContext key={orderId} actor={actor} orderId={orderId} />
}
function ReportEntryContext({
  actor,
  orderId,
}: {
  actor: string
  orderId: string
}) {
  const context = useRemote<ReportContext>(`orders/${orderId}/report-context`)
  if (!context.data)
    return <Feedback {...context} loading="Checking reporting access…" />
  if (!isReportContext(context.data, orderId))
    return (
      <p role="alert">
        We couldn’t check reporting access. Refresh the page and try again.
      </p>
    )
  if (
    (context.data.status === 'OWN_REPORT' ||
      context.data.status === 'PREPARING_REVIEW') &&
    context.data.caseId &&
    isUuid(context.data.caseId)
  )
    return (
      <section className="case-panel">
        <h2>
          {context.data.status === 'PREPARING_REVIEW'
            ? 'Preparing review'
            : 'You already reported this errand'}
        </h2>
        <p>
          {context.data.status === 'PREPARING_REVIEW'
            ? 'Your request is saved. Check progress while the errand and chat are prepared for review.'
            : 'View your report, case status, and messages.'}
        </p>
        <a className="button" href={'/admin/reports/' + context.data.caseId}>
          View your report
        </a>
      </section>
    )
  if (
    context.data.status === 'CASE_PARTICIPANT' &&
    context.data.state === 'RESOLVED'
  )
    return (
      <section className="case-panel">
        <h2>This review is resolved</h2>
        <p>Reporting is closed. You can view the case and its outcome.</p>
        <a className="button" href={'/admin/reports/' + context.data.caseId}>
          View case
        </a>
      </section>
    )
  if (
    context.data.status !== 'ELIGIBLE' &&
    context.data.status !== 'REPORT_REQUEST_AVAILABLE' &&
    context.data.status !== 'PREPARATION_AVAILABLE' &&
    context.data.status !== 'CASE_PARTICIPANT'
  )
    return (
      <section className="case-panel">
        <h2>Reporting is not available</h2>
        <p>
          Reporting is closed for this errand, or your account is not eligible.
        </p>
        <a className="button-secondary" href={'/errands/' + orderId}>
          Back to errand
        </a>
      </section>
    )
  return <ReportForm actor={actor} orderId={orderId} />
}
function ReportForm({ actor, orderId }: { actor: string; orderId: string }) {
  const mutation = useMutation<Report>('foc.report-pending.' + actor)
  const order = orderId
  const [description, setDescription] = useState(
    String(mutation.pending?.body.description || ''),
  )
  if (mutation.pending && mutation.pending.body.orderId !== orderId)
    return (
      <section className="message-card">
        <h2>Finish your pending report</h2>
        <p>
          A previous submission still needs confirmation. Retry it before
          starting a report for another errand.
        </p>
        <a
          className="button"
          href={
            '/admin/reports/new?orderId=' +
            encodeURIComponent(String(mutation.pending.body.orderId))
          }
        >
          Resume pending report
        </a>
      </section>
    )
  if (mutation.result?.preparation?.status === 'PENDING')
    return <ReportStatusData id={mutation.result.case.caseId} />
  if (mutation.result)
    return (
      <section className="case-panel" role="status">
        <h2>Report submitted</h2>
        <p>
          An admin will review your case. Keep your case ID and check your
          report for updates.
        </p>
        <SummaryCard value={mutation.result.case} participant />
        <a
          className="button"
          href={'/admin/reports/' + mutation.result.case.caseId}
        >
          View your report
        </a>
      </section>
    )
  return (
    <section className="case-panel report-form-panel">
      <h2>Describe the issue</h2>
      <p>
        Describe what happened and when. You can submit one report for this
        errand, visible only to you and authorized admins. Your involvement is
        checked while review is prepared.
      </p>
      <form
        className="case-form"
        onSubmit={(e) => {
          e.preventDefault()
          void mutation.submit('reports', {
            orderId: order.trim(),
            description: description.trim(),
          })
        }}
      >
        <div className="report-context">
          <span>Errand being reported</span>
          <strong>{order}</strong>
        </div>
        <label htmlFor="description">What happened?</label>
        <textarea
          id="description"
          required
          maxLength={2000}
          rows={7}
          value={description}
          disabled={mutation.busy || !!mutation.pending}
          onChange={(e) => setDescription(e.target.value)}
        />
        <small>
          {description.length}/2,000 characters. Check before submitting; you
          cannot edit your report afterward.
        </small>
        {mutation.error && (
          <p role="alert" className="workspace-error">
            {mutation.error}
          </p>
        )}
        {mutation.pending && (
          <p role="status">
            Submission is unconfirmed. Select “Retry submission” to check the
            same report.
          </p>
        )}
        <button disabled={mutation.busy || !description.trim()}>
          {mutation.busy
            ? 'Submitting…'
            : mutation.pending
              ? 'Retry submission'
              : 'Submit report'}
        </button>
      </form>
    </section>
  )
}
function ReportStatus({ id }: { id: string }) {
  if (!isUuid(id))
    return (
      <p role="alert">
        This report link is invalid. Open the errand and use its report link.
      </p>
    )
  return <ReportStatusData id={id} />
}
function ReportStatusData({ id }: { id: string }) {
  const state = useRemote<Report>('reports/' + id, true)
  if (!state.data) return <Feedback {...state} loading="Loading your report…" />
  return (
    <section className="case-panel">
      <a className="back-link" href={'/errands/' + state.data.case.orderId}>
        <Arrow direction="back" />
        Back to errand
      </a>
      <h2>Report status</h2>
      {state.data.case.state === 'RESOLVED' && (
        <p role="status">
          Your case is closed. You can read existing messages but can no longer
          reply.
        </p>
      )}
      <SummaryCard value={state.data.case} participant />
      {state.data.preparation?.status === 'PENDING' ? (
        <p role="status">
          Preparing review. Your request is saved. The errand pauses when Order
          processes it; we will confirm here after the errand and chat are
          ready.
        </p>
      ) : state.data.preparation?.status === 'REJECTED' ? (
        <p role="alert">
          Review preparation was rejected. Refresh to check the case before
          sending another request.
        </p>
      ) : state.data.ownStatement ? (
        <>
          <h3>Your statement</h3>
          <p className="statement-text">
            {state.data.ownStatement.description}
          </p>
          <p className="muted">
            Submitted {formatSingaporeTime(state.data.ownStatement.submittedAt)}
          </p>
        </>
      ) : (
        <div role="status">
          <p>
            This errand is under review following a reported issue. You can add
            your statement and contact the assigned admin.
          </p>
          {state.data.case.state !== 'RESOLVED' && (
            <a
              className="button"
              href={'/admin/reports/new?orderId=' + state.data.case.orderId}
            >
              Add your statement
            </a>
          )}
        </div>
      )}
      <button onClick={state.retry}>Refresh status</button>
      {state.data.preparation?.status !== 'PENDING' &&
        state.data.preparation?.status !== 'REJECTED' && (
          <ParticipantConversationStatus
            summary={state.data.case}
            actorId={
              state.data.ownStatement?.reporterId || readSession()?.userId || ''
            }
          />
        )}
    </section>
  )
}
type QueueFilter = { status: string; query: string; page: number }
const statuses = [
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: '', label: 'All cases' },
]
function initialFilters(): QueueFilter {
  const params = new URLSearchParams(window.location.search)
  const status =
    params.get('status') === 'ALL' ? '' : (params.get('status') ?? 'OPEN')
  const query = params.get('query') || ''
  const page = Number(params.get('page') || 0)
  return {
    status: statuses.some((item) => item.value === status) ? status : 'OPEN',
    query: isUuid(query) ? query : '',
    page:
      Number.isSafeInteger(page) && page >= 0 && page <= 2147483647 ? page : 0,
  }
}
function queueParams(filters: QueueFilter) {
  return new URLSearchParams({
    page: String(filters.page),
    size: '20',
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.query ? { query: filters.query } : {}),
  }).toString()
}
function queueLocation(filters: QueueFilter) {
  return queueParams(filters) + (filters.status ? '' : '&status=ALL')
}

export function AdminDashboardOverview({ actor }: { actor: string }) {
  const open = useRemote<Page>('cases?page=0&size=2&status=OPEN')
  const underReview = useRemote<Page>('cases?page=0&size=1&status=UNDER_REVIEW')
  const resolved = useRemote<Page>('cases?page=0&size=1&status=RESOLVED')
  const all = useRemote<Page>('cases?page=0&size=1')
  const metrics = [
    {
      label: 'Open cases',
      value: open.data?.totalElements,
      detail: 'Needs attention',
      icon: FileExclamationPoint,
    },
    {
      label: 'Under review',
      value: underReview.data?.totalElements,
      detail: 'In active review',
      icon: FileSearch,
    },
    {
      label: 'Resolved cases',
      value: resolved.data?.totalElements,
      detail: 'Review completed',
      icon: FileCheck,
    },
    {
      label: 'Total cases',
      value: all.data?.totalElements,
      detail: 'All reported issues',
      icon: FolderOpen,
    },
  ]
  const retry = () => {
    open.retry()
    underReview.retry()
    resolved.retry()
    all.retry()
  }

  return (
    <div className="admin-overview">
      <section className="admin-metrics" aria-label="Case overview">
        {metrics.map((metric) => (
          <article key={metric.label} aria-busy={metric.value === undefined}>
            <div className="admin-metric-heading">
              <span>{metric.label}</span>
              <div className="admin-metric-art" aria-hidden="true">
                <metric.icon focusable="false" strokeWidth={1.7} />
              </div>
            </div>
            <strong>{metric.value ?? '—'}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>

      <section aria-labelledby="priority-queue-title">
        <div className="admin-priority-heading">
          <div>
            <p className="eyebrow">Priority queue</p>
            <h2 id="priority-queue-title">Cases needing attention</h2>
          </div>
          <a className="admin-view-all" href="/admin/cases?status=OPEN">
            View all cases
            <Arrow />
          </a>
        </div>

        <div
          className="admin-priority-list"
          aria-busy={!open.data && !open.error}
        >
          {open.error ? (
            <div className="admin-priority-state" role="alert">
              <h3>Cases could not be loaded</h3>
              <p>{open.error}</p>
              <button onClick={retry} type="button">
                Try again
              </button>
            </div>
          ) : !open.data ? (
            <div className="admin-priority-state" role="status">
              Loading priority cases…
            </div>
          ) : open.data.content.length === 0 ? (
            <div className="admin-priority-state">
              <span className="empty-queue-icon" aria-hidden="true">
                <ClipboardList aria-hidden="true" className="ui-icon" />
              </span>
              <h3>No open cases</h3>
              <p>New participant reports will appear here.</p>
            </div>
          ) : (
            <ul>
              {open.data.content.map((value) => (
                <li key={value.caseId}>
                  <a
                    href={`/admin/cases/${value.caseId}?page=0&size=20&status=OPEN`}
                    aria-label={`Review case ${value.caseId}`}
                  >
                    <span className="admin-priority-icon" aria-hidden="true">
                      <ShieldCheck />
                    </span>
                    <span className="admin-priority-main">
                      <span className="case-status status-open">
                        <span aria-hidden="true" />
                        Open
                      </span>
                      <strong>Case {value.caseId}</strong>
                      <span>Errand {value.orderId}</span>
                    </span>
                    <span className="admin-priority-meta">
                      <span>
                        {value.reviewerId
                          ? value.reviewerId === actor
                            ? 'Assigned to you'
                            : 'Assigned'
                          : 'Unassigned'}
                      </span>
                      <time dateTime={value.createdAt}>
                        {formatSingaporeTime(value.createdAt)}
                      </time>
                    </span>
                    <span className="admin-priority-action">
                      Review
                      <Arrow />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

export function CaseQueue({ actor }: { actor: string }) {
  const [filters, setFilters] = useState(initialFilters)
  const [query, setQuery] = useState(filters.query)
  const params = queueParams(filters)
  const state = useRemote<Page>('cases?' + params)
  function apply(next: QueueFilter) {
    setFilters(next)
    window.history.replaceState(
      null,
      '',
      window.location.pathname + '?' + queueLocation(next),
    )
  }
  function clear() {
    setQuery('')
    apply({ status: '', query: '', page: 0 })
  }
  const emptyOpen = filters.status === 'OPEN' && !filters.query
  return (
    <section
      className="case-panel report-queue"
      aria-labelledby="report-queue-title"
    >
      <div className="section-heading queue-heading">
        <div>
          <h2 id="report-queue-title">
            Case queue{' '}
            {state.data && (
              <span className="queue-count">{state.data.totalElements}</span>
            )}
          </h2>
          <p>Assign yourself an open case to begin reviewing reports.</p>
        </div>
        <button
          className="button-secondary"
          onClick={state.retry}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="ui-icon" />
          Refresh
        </button>
      </div>
      <div
        className="queue-statuses"
        role="group"
        aria-label="Filter cases by status"
      >
        {statuses.map((status) => (
          <button
            key={status.value}
            type="button"
            aria-pressed={filters.status === status.value}
            onClick={() => apply({ ...filters, status: status.value, page: 0 })}
          >
            {status.label}
          </button>
        ))}
      </div>
      <form
        className="queue-search"
        onSubmit={(e) => {
          e.preventDefault()
          apply({ ...filters, query: query.trim(), page: 0 })
        }}
      >
        <label htmlFor="queue-search">Find a case or errand</label>
        <div className="queue-search-row">
          <input
            id="queue-search"
            pattern={uuidPattern}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a case or errand ID"
          />
          <button type="submit">
            <Search aria-hidden="true" className="ui-icon" />
            Search
          </button>
          {filters.query && (
            <button
              className="button-secondary"
              type="button"
              onClick={() => {
                setQuery('')
                apply({ ...filters, query: '', page: 0 })
              }}
            >
              Clear search
            </button>
          )}
        </div>
      </form>
      <div aria-busy={!state.data && !state.error}>
        {!state.data ? (
          state.error ? (
            <div className="queue-state" role="alert">
              <h3>Cases could not be loaded</h3>
              <p>{state.error}</p>
              <button onClick={state.retry} type="button">
                Try again
              </button>
            </div>
          ) : (
            <div className="queue-state" role="status">
              <p>Loading case queue…</p>
            </div>
          )
        ) : (
          <>
            {state.data.content.length === 0 ? (
              <div className="queue-state">
                <span className="empty-queue-icon" aria-hidden="true">
                  <ClipboardList aria-hidden="true" className="ui-icon" />
                </span>
                <h3>
                  {emptyOpen ? 'No open cases' : 'No cases match these filters'}
                </h3>
                <p>
                  {emptyOpen
                    ? 'New cases appear when participants submit reports. Refresh to check for updates.'
                    : 'Try another status or clear the search.'}
                </p>
                {!emptyOpen && (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={clear}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <ul className="case-list">
                {state.data.content.map((value) => (
                  <li key={value.caseId}>
                    <a
                      className="case-row"
                      href={
                        '/admin/cases/' +
                        value.caseId +
                        '?' +
                        queueLocation(filters)
                      }
                      aria-label={'Review case ' + value.caseId}
                    >
                      <div className="case-row-main">
                        <span
                          className={
                            'case-status status-' + value.state.toLowerCase()
                          }
                        >
                          <span aria-hidden="true" />
                          {
                            statuses.find((item) => item.value === value.state)
                              ?.label
                          }
                        </span>
                        <strong>Case {value.caseId}</strong>
                        <span className="case-row-errand">
                          Errand {value.orderId}
                        </span>
                      </div>
                      <div className="case-row-meta">
                        <span>
                          {value.reviewerId
                            ? value.reviewerId === actor
                              ? 'Assigned to you'
                              : 'Assigned to another reviewer'
                            : 'Unassigned'}
                        </span>
                        <time dateTime={value.createdAt}>
                          {formatSingaporeTime(value.createdAt)}
                        </time>
                      </div>
                      <span className="case-row-action">
                        Review
                        <Arrow />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="case-pagination">
              <span className="queue-range">
                {state.data.totalElements
                  ? `Showing ${state.data.page * state.data.size + 1}–${Math.min((state.data.page + 1) * state.data.size, state.data.totalElements)} of ${state.data.totalElements}`
                  : '0 cases'}
              </span>
              <div className="queue-page-controls">
                <button
                  className="button-secondary"
                  type="button"
                  disabled={state.data.page === 0}
                  onClick={() =>
                    apply({ ...filters, page: state.data!.page - 1 })
                  }
                >
                  <Arrow direction="back" />
                  Previous
                </button>
                <span>
                  Page {state.data.page + 1} of{' '}
                  {Math.max(1, state.data.totalPages)}
                </span>
                <button
                  className="button-secondary"
                  type="button"
                  disabled={state.data.page + 1 >= state.data.totalPages}
                  onClick={() =>
                    apply({ ...filters, page: state.data!.page + 1 })
                  }
                >
                  Next
                  <Arrow />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
function CaseDetail({ id, actor }: { id: string; actor: string }) {
  if (!isUuid(id))
    return (
      <p role="alert">
        This case link is invalid. Return to the case queue and try again.
      </p>
    )
  return <DetailData key={`${actor}.${id}`} id={id} actor={actor} />
}
function DetailData({ id, actor }: { id: string; actor: string }) {
  const state = useRemote<Detail>('cases/' + id, true)
  const [closureLocked, setClosureLocked] = useState(
    () => !!readPendingClosure(actor, id),
  )
  const [evidence, setEvidence] = useState<Timeline | null>(null)
  const participantNames = useParticipantNames([
    ...(state.data?.statements.map((s) => s.reporterId) || []),
    ...(evidence
      ? [
          evidence.order.requesterId,
          ...(evidence.order.courierId ? [evidence.order.courierId] : []),
          ...evidence.participants.map((p) => p.userId),
        ]
      : []),
  ])
  const [claimNotice, setClaimNotice] = useState('')
  useEffect(() => {
    if (!claimNotice) return
    const timer = window.setTimeout(() => setClaimNotice(''), 6000)
    return () => clearTimeout(timer)
  }, [claimNotice])
  const mutation = useMutation<Summary>('foc.claim-pending.' + actor + '.' + id)
  if (!state.data) return <Feedback {...state} />
  const value =
    mutation.result && mutation.result.revision > state.data.case.revision
      ? mutation.result
      : state.data.case
  return (
    <>
      <section className="case-panel">
        <div className="section-heading">
          <h2>Case details</h2>
          <button onClick={state.retry}>Refresh case</button>
        </div>
        <SummaryCard value={value} actor={actor} />
        {claimNotice && (
          <p role="status" className="workspace-error">
            {claimNotice}
          </p>
        )}
        {mutation.error && (
          <p role="alert" className="workspace-error">
            {mutation.error}
          </p>
        )}
        {mutation.result?.reviewerId === actor && (
          <p role="status">Case assigned to you.</p>
        )}
        {value.reviewStatus === 'PREPARING' && (
          <p role="status">
            Preparing review. Assignment will be available after the errand and
            chat confirmations arrive.
          </p>
        )}
        {value.state === 'OPEN' || mutation.pending ? (
          <>
            <button
              disabled={mutation.busy || value.reviewStatus === 'PREPARING'}
              onClick={() => {
                if (
                  evidence &&
                  (evidence.order.requesterId === actor ||
                    evidence.order.courierId === actor ||
                    evidence.participants.some(
                      (person) => person.userId === actor,
                    ))
                ) {
                  setClaimNotice(
                    'You took part in this errand. Another admin must review it.',
                  )
                  return
                }
                void mutation.submit('cases/' + id + '/claim', {
                  expectedRevision: value.revision,
                })
              }}
            >
              {mutation.busy
                ? 'Assigning…'
                : mutation.pending
                  ? 'Retry assignment'
                  : value.reviewStatus === 'PREPARING'
                    ? 'Preparing review…'
                    : value.reviewStatus === 'LEGACY'
                      ? 'Prepare review'
                      : 'Assign to me'}
            </button>
            {mutation.pending && (
              <p role="status">
                Assignment is unconfirmed. Select “Retry assignment” to check.
              </p>
            )}
          </>
        ) : null}
      </section>
      {closureLocked && !state.data.closure && value.state !== 'RESOLVED' && (
        <p role="status" className="evidence-notice">
          Case closure is in progress. Participant actions and conversations are
          read-only until the outcome is confirmed.
        </p>
      )}
      <CaseParticipants
        key={`${actor}.${id}`}
        detail={state.data}
        summary={value}
        actorId={actor}
        evidence={evidence}
        names={participantNames}
        closing={closureLocked}
      />
      <EvidencePanel
        key={id}
        caseId={id}
        orderId={value.orderId}
        onSnapshot={setEvidence}
        names={participantNames}
      />
      <ResolutionPanel
        key={`resolve.${actor}.${id}.${state.data.closure?.operationId || ''}`}
        summary={value}
        actor={actor}
        actions={state.data.actions}
        resolution={state.data.resolution}
        closure={state.data.closure}
        refresh={state.retry}
        onClosingChange={setClosureLocked}
      />
    </>
  )
}
