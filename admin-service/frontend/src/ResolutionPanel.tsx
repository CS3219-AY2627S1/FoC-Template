import { useEffect, useRef, useState } from 'react'
import {
  CaseError,
  caseErrorMessage,
  request,
  type AdminAction,
  type Summary,
  type Detail,
} from './cases'

import {
  readPendingClosure,
  type ClosureSubmission as Submission,
} from './closureState'

export function ResolutionPanel({
  summary,
  actor,
  actions,
  resolution,
  closure,
  refresh,
  onClosingChange,
}: {
  summary: Summary
  actor: string
  actions?: AdminAction[]
  resolution?: string | null
  closure?: Detail['closure']
  refresh: () => void
  onClosingChange?: (closing: boolean) => void
}) {
  const storage = `foc.resolve-pending.${actor}.${summary.caseId}`
  const [pending, setPending] = useState<Submission | null>(() => {
    if (closure)
      return {
        key: closure.operationId,
        body: {
          resolution: closure.resolution,
          creditDisposition: closure.creditDisposition || 'KEEP_EXISTING',
          expectedRevision: closure.revision,
          rejectedActionExplanations: closure.explanations,
        },
      }
    return readPendingClosure(actor, summary.caseId)
  })
  const [disposition, setDisposition] = useState(
    pending?.body.creditDisposition || 'KEEP_EXISTING',
  )
  const [reason, setReason] = useState(pending?.body.resolution || '')
  const [explanations, setExplanations] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pending?.body.rejectedActionExplanations.map((e) => [
        e.operationId,
        e.explanation,
      ]) || [],
    ),
  )
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    onClosingChange?.(busy || !!pending || done || !!closure)
  }, [busy, pending, done, closure, onClosingChange])
  const guard = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const rejected = actions?.filter((a) => a.status === 'REJECTED') || []
  const blocked =
    !actions ||
    actions.some((a) => a.status === 'PENDING' || a.status === 'UNKNOWN')
  const valid =
    reason.trim().length > 0 &&
    reason.trim().length <= 2000 &&
    rejected.every(
      (a) =>
        explanations[a.operationId]?.trim() &&
        explanations[a.operationId]!.trim().length <= 2000,
    )
  async function submit() {
    if (guard.current || (!pending && (!valid || blocked))) return
    const operation = pending || {
      key: crypto.randomUUID(),
      body: {
        resolution: reason.trim(),
        creditDisposition: disposition,
        expectedRevision: summary.revision,
        rejectedActionExplanations: rejected.map((a) => ({
          operationId: a.operationId,
          explanation: explanations[a.operationId]!.trim(),
        })),
      },
    }
    try {
      sessionStorage.setItem(storage, JSON.stringify(operation))
    } catch {
      setError(
        'Nothing was sent. Allow this site to use browser storage, then try again.',
      )
      return
    }
    setPending(operation)
    onClosingChange?.(true)
    guard.current = true
    setBusy(true)
    setError('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const result = await request<Detail>(
        `cases/${summary.caseId}/resolve`,
        controller.signal,
        operation,
      )
      if (
        result.case.caseId === summary.caseId &&
        result.case.state !== 'RESOLVED' &&
        result.closure?.operationId === operation.key
      ) {
        setError('')
        setConfirm(false)
        refresh()
        return
      }
      if (
        result.case.caseId !== summary.caseId ||
        result.case.state !== 'RESOLVED' ||
        result.case.reviewerId !== actor
      )
        throw new Error('Invalid resolution response')
      sessionStorage.removeItem(storage)
      setPending(null)
      setDone(true)
      setConfirm(false)
      refresh()
      heading.current?.focus()
    } catch (e) {
      if (
        e instanceof CaseError &&
        [400, 401, 403, 404, 409].includes(e.status)
      ) {
        sessionStorage.removeItem(storage)
        setPending(null)
        setConfirm(false)
        setError(
          caseErrorMessage(e) +
            (e.status === 409 ? ' Refresh the case before trying again.' : ''),
        )
      } else
        setError(
          e instanceof CaseError
            ? caseErrorMessage(e)
            : 'We’re not sure the case closed. Tap “Resume case closure” to check.',
        )
    } finally {
      clearTimeout(timeout)
      guard.current = false
      setBusy(false)
    }
  }
  return (
    <section className="case-panel" aria-labelledby="resolution-title">
      <h2 id="resolution-title" ref={heading} tabIndex={-1}>
        Case resolution
      </h2>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {closure && summary.state !== 'RESOLVED' && (
        <p role="status">
          Closure is preparing. The decision is saved, and we are waiting for
          chat, errand and credit confirmations. Nothing new can be added while
          it is pending.
        </p>
      )}
      {done && (
        <p role="status">
          Case closed. The decision is final and conversations are read-only.
        </p>
      )}
      {summary.state === 'RESOLVED' ? (
        <>
          <p>
            This case is closed. No further reports or review actions can be
            added. Conversations are read-only.
          </p>
          {resolution && <p className="statement-text">{resolution}</p>}
        </>
      ) : (
        !done &&
        (summary.reviewerId !== actor || summary.state !== 'UNDER_REVIEW' ? (
          <p>Only the assigned reviewer can close this case.</p>
        ) : (
          <>
            <p>
              Closing a case is permanent. Complete, current evidence and
              confirmed action outcomes are required. Bans and credit
              corrections are optional.
            </p>
            {blocked && (
              <p role="status">
                {!actions
                  ? 'Refresh the case to verify action history.'
                  : 'Wait until every action is confirmed. Refresh to check.'}
              </p>
            )}
            <form
              className="case-form"
              onSubmit={(e) => {
                e.preventDefault()
                setConfirm(true)
              }}
            >
              <label htmlFor="resolution-reason">
                Internal resolution reason
              </label>
              <small>
                Explain your decision. Visible only to authorized admins.
              </small>
              <textarea
                id="resolution-reason"
                rows={4}
                maxLength={2000}
                required
                value={reason}
                disabled={busy || !!pending || confirm}
                onChange={(e) => setReason(e.target.value)}
              />
              <fieldset
                className="resolution-choices"
                disabled={busy || !!pending || confirm}
              >
                <legend>Reserved-credit outcome</legend>
                {(
                  [
                    [
                      'KEEP_EXISTING',
                      'Keep confirmed outcome',
                      'No active credit hold remains.',
                    ],
                    [
                      'RETURN_TO_REQUESTER',
                      'Return to requester',
                      'Release remaining held credits to the requester.',
                    ],
                    [
                      'PAY_COURIER',
                      'Pay courier',
                      'Transfer remaining held credits to the assigned courier.',
                    ],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label key={value} className="resolution-choice">
                    <input
                      type="radio"
                      name="credit-disposition"
                      value={value}
                      checked={disposition === value}
                      onChange={() => setDisposition(value)}
                    />
                    <span>
                      {label}
                      <small>{hint}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="muted">
                The errand finishes only after Credit confirms this outcome.
                Available-credit corrections are separate.
              </p>
              {rejected.map((a, i) => (
                <div key={a.operationId}>
                  <p>
                    Rejected action {i + 1}:{' '}
                    {a.type === 'BAN' ? 'Account ban' : 'Credit correction'} —{' '}
                    {a.reason}
                  </p>
                  <label htmlFor={`explain-${a.operationId}`}>
                    Why can the case close despite rejected action {i + 1}?
                  </label>
                  <textarea
                    id={`explain-${a.operationId}`}
                    required
                    rows={3}
                    maxLength={2000}
                    disabled={busy || !!pending || confirm}
                    value={explanations[a.operationId] || ''}
                    onChange={(e) =>
                      setExplanations({
                        ...explanations,
                        [a.operationId]: e.target.value,
                      })
                    }
                  />
                </div>
              ))}
              {pending ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  {busy ? 'Checking resolution…' : 'Check case closure'}
                </button>
              ) : confirm ? (
                <div role="region" aria-label="Confirm final resolution">
                  <p>
                    Close permanently? No further reports, review actions, or
                    messages can be added; participants see only the closed
                    status, while your reason stays private to admins.
                  </p>
                  <p>
                    This also finishes the errand. Reserved-credit outcome:{' '}
                    {disposition === 'RETURN_TO_REQUESTER'
                      ? 'return the reservation to the requester'
                      : disposition === 'PAY_COURIER'
                        ? 'pay the reservation to the assigned courier'
                        : 'preserve the existing confirmed outcome'}
                    .
                  </p>
                  <p className="statement-text">{reason.trim()}</p>
                  <button
                    type="button"
                    disabled={busy || blocked || !valid}
                    onClick={() => void submit()}
                  >
                    Close case permanently
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setConfirm(false)}
                  >
                    Back to editing
                  </button>
                </div>
              ) : (
                <button disabled={busy || blocked || !valid}>
                  Review case closure
                </button>
              )}
            </form>
          </>
        ))
      )}
    </section>
  )
}
