import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CaseError,
  caseErrorMessage,
  isUuid,
  request,
  type AdminAction,
  type Summary,
} from './cases'
import { formatSingaporeTime } from './time'
import { Coins, ShieldBan } from 'lucide-react'
import type { ParticipantSelection } from './casePeople'

type Input = {
  type: 'CREDIT_ADJUSTMENT' | 'BAN'
  targetUserId: string
  amount?: number
  reason: string
}
type Pending = { key: string; body: Input }
function validateAction(value: AdminAction, caseId: string): AdminAction {
  if (
    !value ||
    !isUuid(value.operationId) ||
    value.caseId !== caseId ||
    !isUuid(value.targetUserId) ||
    !['CREDIT_ADJUSTMENT', 'BAN'].includes(value.type) ||
    (value.type === 'BAN'
      ? value.amount !== null
      : !Number.isInteger(value.amount) ||
        value.amount === 0 ||
        value.amount < -2147483648 ||
        value.amount > 2147483647) ||
    typeof value.reason !== 'string' ||
    !value.reason.trim() ||
    value.reason.length > 2000 ||
    !['PENDING', 'UNKNOWN', 'SUCCEEDED', 'REJECTED'].includes(value.status) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    (value.completedAt !== null &&
      !Number.isFinite(Date.parse(value.completedAt))) ||
    !(
      (value.status === 'SUCCEEDED' || value.status === 'REJECTED') ===
      (value.completedAt !== null)
    ) ||
    !(value.reasonCode === null || typeof value.reasonCode === 'string')
  )
    throw new Error('Invalid action response')
  return value
}
const actionFailure = (e: unknown, ban: boolean) =>
  e instanceof CaseError &&
  (e.message.startsWith('You cannot review this case because') ||
    e.message.startsWith('Reviewer independence could not be verified.'))
    ? caseErrorMessage(e)
    : e instanceof CaseError && [401, 403, 404].includes(e.status)
      ? e.status === 401
        ? 'You’ve been signed out. Please sign in again.'
        : 'These actions aren’t available to you. Refresh the case to check.'
      : e instanceof CaseError && e.status === 409
        ? 'This case just changed. Refresh and check its actions first — don’t send it again yet.'
        : `We couldn’t confirm the ${ban ? 'ban' : 'correction'} request’s outcome. Check its status or retry the same submission. Do not submit a replacement.`
const explanations = {
  PENDING: 'Correction sent. Waiting for confirmation.',
  UNKNOWN:
    'This is taking longer than usual and may already be done. Refresh its status — don’t send it again.',
  SUCCEEDED: 'Credit correction applied.',
  REJECTED:
    'Correction rejected. No credits were changed. See the reason below.',
}
export function CreditActions({
  summary,
  actorId,
  participantIds,
  initialActions = [],
  kind = 'CREDIT_ADJUSTMENT',
  closing = false,
  selection,
  participantLabels = {},
  onPendingTargetChange,
  onParticipantChange,
}: {
  summary: Summary
  actorId: string
  participantIds: string[]
  initialActions?: AdminAction[]
  kind?: 'CREDIT_ADJUSTMENT' | 'BAN'
  closing?: boolean
  selection?: ParticipantSelection
  participantLabels?: Record<string, string>
  onPendingTargetChange?: (target: string | null) => void
  onParticipantChange?: (target: string) => void
}) {
  const ban = kind === 'BAN'
  const failure = useCallback((e: unknown) => actionFailure(e, ban), [ban])
  const headingId = ban ? 'ban-actions-title' : 'credit-actions-title'
  const storageKey = `foc.${ban ? 'ban' : 'credit'}-action-pending.${actorId}.${summary.caseId}`
  const labels = ban
    ? {
        PENDING: 'Ban sent. Waiting for confirmation.',
        UNKNOWN: explanations.UNKNOWN,
        SUCCEEDED: 'Account banned. You can reactivate it from Manage users.',
        REJECTED: 'Ban rejected. The account wasn’t changed.',
      }
    : explanations
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const p = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
      return p &&
        isUuid(p.key) &&
        p.body?.type === kind &&
        isUuid(p.body.targetUserId) &&
        (ban
          ? p.body.amount === undefined
          : Number.isInteger(p.body.amount) && p.body.amount !== 0) &&
        typeof p.body.reason === 'string'
        ? p
        : null
    } catch {
      return null
    }
  })
  const [actions, setActions] = useState<AdminAction[]>(() => {
    try {
      return initialActions
        .map((a) => validateAction(a, summary.caseId))
        .filter((a) => a.type === kind)
    } catch {
      return []
    }
  })
  const [historyUnavailable] = useState(() => {
    try {
      initialActions.forEach((a) => validateAction(a, summary.caseId))
      return false
    } catch {
      return true
    }
  })
  const [target, setTarget] = useState(pending?.body.targetUserId || '')
  const [direction, setDirection] = useState<'add' | 'subtract'>(
    pending && (pending.body.amount ?? 0) < 0 ? 'subtract' : 'add',
  )
  const [amount, setAmount] = useState(
    pending ? String(Math.abs(pending.body.amount ?? 0)) : '',
  )
  const [reason, setReason] = useState(pending?.body.reason || '')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const [denied, setDenied] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [handledSelection, setHandledSelection] = useState<number>()
  const confirmButton = useRef<HTMLButtonElement>(null)
  const reviewButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirm) confirmButton.current?.focus()
  }, [confirm])
  useEffect(() => {
    onParticipantChange?.(target)
  }, [target, onParticipantChange])
  useEffect(() => {
    onPendingTargetChange?.(pending?.body.targetUserId || null)
  }, [pending, onPendingTargetChange])
  if (selection && handledSelection !== selection.request) {
    setHandledSelection(selection.request)
    if (
      !pending &&
      !busy &&
      !confirm &&
      participantIds.includes(selection.userId)
    ) {
      setTarget(selection.userId)
    }
  }
  const participantName = (id: string) =>
    participantLabels[id] ||
    (participantIds.includes(id)
      ? `Participant ${participantIds.indexOf(id) + 1}`
      : 'Case participant')
  const guard = useRef(false)
  const active = useRef(true)
  const abort = useRef<AbortController | null>(null)
  const current = useRef(actions)
  useEffect(() => {
    current.current = actions
  }, [actions])
  const writable =
    !closing &&
    summary.state === 'UNDER_REVIEW' &&
    summary.reviewerId === actorId &&
    !denied &&
    !historyUnavailable
  const eligible = [...new Set(participantIds)]
  const visibleActions =
    selection && target
      ? actions.filter((a) => a.targetUserId === target)
      : actions
  const numeric = Number(amount)
  const valid =
    eligible.includes(target) &&
    (ban ||
      (/^\d+$/.test(amount) &&
        Number.isSafeInteger(numeric) &&
        numeric > 0 &&
        numeric <= 2147483647)) &&
    reason.trim().length > 0 &&
    reason.trim().length <= 2000
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      abort.current?.abort()
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    let controller = new AbortController()
    let timer: number | undefined
    async function poll() {
      controller = new AbortController()
      const outstanding = current.current.filter(
        (a) => a.status === 'PENDING' || a.status === 'UNKNOWN',
      )
      if (!outstanding.length && refresh === 0) return
      const targets = outstanding.length ? outstanding : current.current
      const timeout = window.setTimeout(() => controller.abort(), 8000)
      try {
        const updates = await Promise.all(
          targets.map((a) =>
            request<AdminAction>(
              `cases/${summary.caseId}/actions/${a.operationId}`,
              controller.signal,
            ).then((v) => {
              const result = validateAction(v, summary.caseId)
              if (
                result.type !== kind ||
                result.operationId !== a.operationId ||
                result.targetUserId !== a.targetUserId ||
                result.amount !== a.amount ||
                result.reason !== a.reason
              )
                throw new Error('Mismatched action')
              if (
                ['SUCCEEDED', 'REJECTED'].includes(a.status) &&
                JSON.stringify(result) !== JSON.stringify(a)
              )
                throw new Error('Changed terminal outcome')
              return result
            }),
          ),
        )
        if (cancelled) return
        setActions((old) =>
          old.map(
            (a) => updates.find((u) => u.operationId === a.operationId) || a,
          ),
        )
        setPollError('')
      } catch (e) {
        if (cancelled) return
        setPollError(failure(e))
        if (e instanceof CaseError && [401, 403, 404].includes(e.status)) {
          setDenied(true)
          setActions([])
          return
        }
      } finally {
        clearTimeout(timeout)
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 5000)
    }
    timer = window.setTimeout(() => void poll(), refresh ? 0 : 5000)
    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [summary.caseId, refresh, actions.length, kind, failure])
  async function submit() {
    if (guard.current || !writable || (!pending && !valid)) return
    const operation: Pending = pending || {
      key: crypto.randomUUID(),
      body: {
        type: kind,
        targetUserId: target,
        ...(!ban
          ? { amount: direction === 'subtract' ? -numeric : numeric }
          : {}),
        reason: reason.trim(),
      },
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(operation))
    } catch {
      setError(
        'Nothing was sent. Allow this site to use browser storage, then try again.',
      )
      return
    }
    guard.current = true
    setBusy(true)
    setPending(operation)
    setError('')
    const controller = new AbortController()
    abort.current = controller
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const value = validateAction(
        await request<AdminAction>(
          `cases/${summary.caseId}/actions`,
          controller.signal,
          operation,
        ),
        summary.caseId,
      )
      if (!active.current) return
      if (
        value.type !== kind ||
        value.targetUserId !== operation.body.targetUserId ||
        value.amount !== (operation.body.amount ?? null) ||
        value.reason !== operation.body.reason
      )
        throw new Error('Mismatched acceptance')
      setActions((old) =>
        old.some((a) => a.operationId === value.operationId)
          ? old
          : [...old, value],
      )
      sessionStorage.removeItem(storageKey)
      setPending(null)
      setConfirm(false)
      setAmount('')
      setReason('')
      setRefresh((n) => n + 1)
    } catch (e) {
      if (active.current) {
        setError(failure(e))
        if (e instanceof CaseError && [401, 403, 404].includes(e.status)) {
          setDenied(true)
          setActions([])
        }
        if (e instanceof CaseError && e.status === 400) {
          sessionStorage.removeItem(storageKey)
          setPending(null)
        }
      }
    } finally {
      clearTimeout(timer)
      if (active.current) {
        guard.current = false
        setBusy(false)
      }
    }
  }
  return (
    <section className="case-panel credit-actions" aria-labelledby={headingId}>
      <div className="section-heading">
        <div>
          {!selection && (
            <p className="eyebrow">
              {ban ? 'Account safety' : 'Administrative correction'}
            </p>
          )}
          <h2
            id={headingId}
            className={selection ? 'visually-hidden' : 'icon-heading'}
          >
            {ban ? (
              <ShieldBan aria-hidden="true" />
            ) : (
              <Coins aria-hidden="true" />
            )}
            {ban ? 'Account ban requests' : 'Credit corrections'}
          </h2>
        </div>
        {target && participantLabels[target] && (
          <p className="action-person">
            Selected account:{' '}
            <a href={`#person-${target}`}>{participantName(target)}</a>
          </p>
        )}
        <button
          className="button-secondary"
          disabled={busy || denied}
          onClick={() => setRefresh((n) => n + 1)}
        >
          {ban ? 'Refresh ban status' : 'Refresh correction status'}
        </button>
      </div>
      {selection &&
        target &&
        selection.userId !== target &&
        (pending || busy || confirm) && (
          <p role="status" className="evidence-lag">
            Finish or cancel the current review before choosing another account.
            An unconfirmed submission must be retried for its original account.
          </p>
        )}
      {!selection && (
        <p>
          {ban
            ? 'Ban a participant who reported this errand. You can’t ban yourself or the last admin.'
            : 'Add or remove a participant’s available credits. It’s only done once it’s confirmed.'}
        </p>
      )}
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      {pollError && (
        <p role="alert" className="workspace-error">
          Status could not be refreshed. Last confirmed information is shown.{' '}
          {pollError}
        </p>
      )}
      {historyUnavailable && (
        <p role="alert" className="workspace-error">
          We couldn’t load this case’s actions. Refresh before starting a new
          one.
        </p>
      )}
      {ban && (
        <p>
          <a href="/?view=users">Manage accounts and reactivation</a>
        </p>
      )}
      {!denied && (
        <>
          {visibleActions.length ? (
            <details
              className="action-history"
              open={
                !selection ||
                visibleActions.some(
                  (a) => a.status === 'PENDING' || a.status === 'UNKNOWN',
                ) ||
                undefined
              }
            >
              <summary>Action history ({visibleActions.length})</summary>
              <ul className="credit-action-list">
                {visibleActions.map((a) => (
                  <li key={a.operationId}>
                    <div className="section-heading">
                      <h3>
                        {ban
                          ? 'Reversible account ban'
                          : `${Number(a.amount) > 0 ? 'Add' : 'Subtract'} ${Math.abs(Number(a.amount))} credits`}
                      </h3>
                      <span
                        className={`action-state action-${a.status.toLowerCase()}`}
                      >
                        {
                          {
                            PENDING: 'Awaiting confirmation',
                            UNKNOWN: 'Outcome unconfirmed',
                            SUCCEEDED: 'Completed',
                            REJECTED: 'Rejected',
                          }[a.status]
                        }
                      </span>
                    </div>
                    <p>{labels[a.status]}</p>
                    <p>
                      Participant:{' '}
                      {participantLabels[a.targetUserId] ? (
                        <a href={`#person-${a.targetUserId}`}>
                          {participantName(a.targetUserId)}
                        </a>
                      ) : (
                        participantName(a.targetUserId)
                      )}
                    </p>
                    <p className="statement-text">{a.reason}</p>
                    {a.reasonCode && (
                      <p>
                        Reason:{' '}
                        {(
                          {
                            SELF_SANCTION_FORBIDDEN:
                              'Your own account is protected. You cannot ban yourself.',
                            LAST_ADMIN_PROTECTED:
                              'The final active administrator is protected.',
                            ACTOR_NOT_AUTHORIZED:
                              'You no longer have admin access.',
                            INVALID_ACCOUNT_STATE:
                              'This account cannot be banned in its current state.',
                            INSUFFICIENT_AVAILABLE_CREDITS:
                              'This account doesn’t have enough credits for that.',
                            BALANCE_OVERFLOW:
                              'That would go over the balance limit.',
                          } as Record<string, string>
                        )[a.reasonCode] ||
                          'This was rejected. See the details for why.'}
                      </p>
                    )}
                    <p className="evidence-meta">
                      Requested{' '}
                      <time dateTime={a.createdAt}>
                        {formatSingaporeTime(a.createdAt)}
                      </time>
                      {a.completedAt && (
                        <>
                          {' '}
                          · Completed{' '}
                          <time dateTime={a.completedAt}>
                            {formatSingaporeTime(a.completedAt)}
                          </time>
                        </>
                      )}
                    </p>
                    <details className="evidence-technical">
                      <summary>Operation details</summary>
                      <p>Operation ID: {a.operationId}</p>
                      {a.reasonCode && <p>Reason code: {a.reasonCode}</p>}
                      <p>Target account ID: {a.targetUserId}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            !historyUnavailable &&
            !selection && (
              <p>
                {ban
                  ? 'No ban requests recorded for this case.'
                  : 'No credit corrections recorded for this case.'}
              </p>
            )
          )}
          {writable ? (
            <form
              className="case-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!pending) setConfirm(true)
                else void submit()
              }}
            >
              {!selection && (
                <details className="action-account-picker" open>
                  <summary>Change participant</summary>
                  <label htmlFor={`${kind}-target`}>Participant</label>
                  <select
                    id={`${kind}-target`}
                    value={target}
                    disabled={busy || !!pending || confirm}
                    onChange={(e) => setTarget(e.target.value)}
                    required
                  >
                    <option value="">Choose a reporting participant</option>
                    {eligible.map((id) => (
                      <option key={id} value={id}>
                        {participantName(id)}
                      </option>
                    ))}
                  </select>
                </details>
              )}
              {!ban && (
                <>
                  <fieldset
                    className="credit-direction"
                    disabled={busy || !!pending || confirm}
                  >
                    <legend>Correction</legend>
                    <label>
                      <input
                        type="radio"
                        name="credit-direction"
                        checked={direction === 'add'}
                        onChange={() => setDirection('add')}
                      />{' '}
                      Add credits
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="credit-direction"
                        checked={direction === 'subtract'}
                        onChange={() => setDirection('subtract')}
                      />{' '}
                      Subtract credits
                    </label>
                  </fieldset>
                  <label htmlFor={`${kind}-amount`}>Number of credits</label>
                  <input
                    id={`${kind}-amount`}
                    type="number"
                    min="1"
                    max="2147483647"
                    step="1"
                    required
                    value={amount}
                    disabled={busy || !!pending || confirm}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </>
              )}
              <label htmlFor={`${kind}-reason`}>
                {ban ? 'Reason for ban' : 'Reason for correction'}
              </label>
              <small id={`${kind}-reason-help`}>
                Internal reason. Visible to authorized admins, not participants.
              </small>
              <textarea
                id={`${kind}-reason`}
                aria-describedby={`${kind}-reason-help`}
                rows={2}
                required
                maxLength={2000}
                value={reason}
                disabled={busy || !!pending || confirm}
                onChange={(e) => setReason(e.target.value)}
              />
              {pending && (
                <p role="status">
                  Submission is unconfirmed. Retry the same request below; do
                  not submit a replacement.
                </p>
              )}
              {confirm && !pending ? (
                <div
                  className="credit-confirm"
                  role="region"
                  aria-label={
                    ban ? 'Confirm account ban' : 'Confirm credit correction'
                  }
                >
                  <p>
                    {ban
                      ? `Request a ban for ${participantName(target)}? Once applied, they won’t be able to sign in or do anything new.`
                      : `${direction === 'add' ? 'Add' : 'Subtract'} ${numeric} credits ${direction === 'add' ? 'to' : 'from'} ${participantName(target)}. This changes available credits independently of the errand reward.`}
                  </p>
                  <div className="conversation-picker">
                    <button
                      type="button"
                      ref={confirmButton}
                      className={ban ? 'button-danger' : undefined}
                      disabled={busy || !valid}
                      onClick={() => void submit()}
                    >
                      {ban
                        ? 'Confirm ban request'
                        : 'Confirm credit correction'}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy}
                      onClick={() => {
                        setConfirm(false)
                        requestAnimationFrame(() =>
                          reviewButton.current?.focus(),
                        )
                      }}
                    >
                      Back to editing
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  ref={reviewButton}
                  disabled={busy || (!pending && !valid)}
                >
                  {busy
                    ? 'Submitting…'
                    : pending
                      ? ban
                        ? 'Retry same ban request'
                        : 'Retry same correction'
                      : ban
                        ? 'Review ban request'
                        : 'Review correction'}
                </button>
              )}
            </form>
          ) : (
            <p>
              {summary.state === 'RESOLVED'
                ? 'This case is closed. Actions are read-only.'
                : closing
                  ? 'This case is closing. Actions are read-only until the outcome is confirmed.'
                  : ban
                    ? 'Only the assigned reviewer can ban participants on this case.'
                    : 'Only the assigned reviewer can adjust credits on this case.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}
