import { useEffect, useRef, useState } from 'react'
import { useDecideReport } from '@/api/user/reports'
import type { Report, ReportOutcome } from '@/api/user/types'
import { FormError } from '@/components/FormError'
import { TextAreaField } from '@/components/TextAreaField'
import { fieldErrorsOf } from '@/lib/http'
import { formatDateTime } from '@/lib/format'
import { ReportStateBadge } from './ReportStateBadge'
import { useAdminCancelOrder, useAdminOrder } from  '@/api/order/order'
import { Notice } from '@/components/Notice'

type ReportDecisionProps = {
  report: Report
}

// F5.5.5: an Open report shows the two decisions, a decided one who decided it and why.
// One component for both, so it stays mounted when the report changes from one to the other.
export function ReportDecision({ report }: ReportDecisionProps) {
  const [justification, setJustification] = useState('')
  const decide = useDecideReport(report.id)
  const fieldErrors = fieldErrorsOf(decide.error)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pendingOutcome = decide.isPending ? decide.variables?.outcome : undefined
  const errandId = Number(report.errandId)
  const errand = useAdminOrder(Number.isInteger(errandId) ? errandId : 0)
  const cancel = useAdminCancelOrder()

  const status = errand.data?.status
  // The statuses the order-service lets an administrator cancel (ADMIN_CANCELLABLE); it still decides.
  // Delivered is one of them: the requester has not confirmed yet, so the reward is still only
  // reserved, and a report about an errand wrongly marked delivered can give it back.
  // Offered only once the errand has loaded, so its status and reward are known before confirming.
  const canCancel = status !== undefined && ['Open', 'Accepted', 'PickedUp', 'Delivered'].includes(status)
  const alreadyCancelled = status === 'Cancelled' || cancel.isSuccess

  function handleCancelErrand() {
    if (busy) return
    const reward = errand.data ? ` The ${errand.data.credit_reward} reserved credits go back to the requester.` : ''
    if (!window.confirm(`Cancel errand #${errandId}?${reward}`)) return
    cancel.mutate(errandId)
  }

  const busy = decide.isPending || cancel.isPending

  // The buttons that had focus are gone once the report is decided, so focus moves to the decision.
  // The mutation reports success only after the report reloaded, so that heading exists by now.
  useEffect(() => {
    if (decide.isSuccess) headingRef.current?.focus()
  }, [decide.isSuccess])

  function handleDecide(outcome: ReportOutcome) {
    // aria-disabled keeps keyboard focus on the button, so a running request is ignored here (as in SubmitButton).
    if (busy) return
    decide.mutate({ outcome, justification })
  }

  if (report.decision) {
    return (
      <section aria-labelledby="report-decision" className="ds-surface grid grid-cols-1 gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="report-decision" ref={headingRef} tabIndex={-1}>
            Decision
          </h2>
          <ReportStateBadge state={report.state} />
        </div>
        <p className="text-sm text-muted wrap-anywhere">
          by {report.decision.by ? report.decision.by.fullName : 'a deleted account'} · {formatDateTime(report.decision.decidedAt)}
        </p>
        <p className="wrap-anywhere">{report.decision.justification}</p>
      </section>
    )
  }

  // Shown by the state the user-service returns; it still decides what actioning a report does.
  const alreadySuspended = report.reported?.state === 'Suspended'

  return (
    <section aria-labelledby="report-decision" className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2 id="report-decision">Decide</h2>
      <p className="text-muted">
        {alreadySuspended
          ? 'The reported account is already suspended. Actioning the report keeps it that way.'
          : 'Suspending marks the report actioned and suspends the reported account with this justification.'}{' '}
        Cancelling the errand gives its reserved credits back to the requester.
      </p>
      <FormError error={decide.error} fields={['justification']} />
      <FormError error={cancel.error} />
      {alreadyCancelled ? (
        <Notice tone="success" role="status" title={`Errand #${errandId} is cancelled`} />
      ) : canCancel ? (
        <button
          type="button"
          className="ds-btn ds-btn--glass"
          aria-disabled={busy || undefined}
          aria-busy={cancel.isPending || undefined}
          onClick={handleCancelErrand}
        >
          {cancel.isPending ? 'Cancelling…' : 'Cancel errand'}
        </button>
      ) : status ? (
        <p className="text-sm text-muted">
          {status === 'Completed'
            ? 'This errand is Completed and the courier has been paid, so it cannot be cancelled.'
            : `This errand is ${status} and cannot be cancelled.`}
        </p>
      ) : errand.isError ? (
        <p className="text-sm text-muted">Errand #{errandId} could not be loaded, so it cannot be cancelled right now.</p>
      ) : null}
      <TextAreaField
        label="Justification"
        name="justification"
        value={justification}
        onChange={setJustification}
        hint="Between 20 and 500 characters"
        characterLimit={500}
        errors={fieldErrors.justification}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <button
          type="button"
          className="ds-btn ds-btn--glass"
          aria-disabled={decide.isPending || undefined}
          aria-busy={pendingOutcome === 'Dismissed' || undefined}
          onClick={() => handleDecide('Dismissed')}
        >
          {pendingOutcome === 'Dismissed' ? 'Dismissing…' : 'Dismiss report'}
        </button>
        <button
          type="button"
          className="ds-btn ds-btn--primary"
          aria-disabled={decide.isPending || undefined}
          aria-busy={pendingOutcome === 'Actioned' || undefined}
          onClick={() => handleDecide('Actioned')}
        >
          {pendingOutcome === 'Actioned' ? 'Saving…' : alreadySuspended ? 'Mark actioned' : 'Suspend account'}
        </button>
      </div>
    </section>
  )
}
