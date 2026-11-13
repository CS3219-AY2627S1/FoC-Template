import { useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { isCancel } from 'axios'
import { useDisputeActions } from '../../hooks/useDisputes'
import {
  disputeDecisionLabels,
  disputeErrorMessage,
  disputeStatusLabels,
} from '../../utils/disputes'
import { formatOrderTime, shortOrderId } from '../../utils/orderFormat'
import type { DisputeDecision } from '../../types/dispute.types'
import type { Errand } from '../../types/errand.types'
import common from '../../styles/order.module.scss'
import dialog from '../OrderActions/OrderActions.module.scss'
import styles from './OrderDispute.module.scss'

export const OrderDispute = ({
  order,
  userId,
  admin = false,
}: {
  order: Errand
  userId: string
  admin?: boolean
}) => {
  const { report, resolve, respond } = useDisputeActions(order.id)
  const [showReport, setShowReport] = useState(false)
  const [complaint, setComplaint] = useState('')
  const [response, setResponse] = useState('')
  const [explanation, setExplanation] = useState('')
  const [decision, setDecision] = useState<DisputeDecision>(
    ['PICKED_UP', 'DELIVERED'].includes(order.status)
      ? 'PAY_COURIER'
      : 'RELEASE_CREDITS',
  )
  const [confirm, setConfirm] = useState(false)
  const lock = useRef(false)
  const dispute = order.dispute
  const participant =
    order.requester.id === userId || order.courier?.id === userId
  const eligible =
    ['ACCEPTED', 'PICKED_UP', 'DELIVERED'].includes(order.status) &&
    order.creditState === 'RESERVED'
  const canResolve =
    admin && !participant && eligible && dispute?.status === 'OPEN'
  const canRespond =
    participant &&
    !!dispute &&
    dispute.reporterId !== userId &&
    dispute.status === 'OPEN' &&
    !dispute.response
  const validDecision =
    decision !== 'PAY_COURIER' ||
    (['PICKED_UP', 'DELIVERED'].includes(order.status) && !!order.courier)
  const submitReport = async () => {
    if (lock.current || !complaint.trim()) return
    lock.current = true
    try {
      await report.mutateAsync(complaint.trim())
    } catch {
      /* Mutation renders the error. */
    } finally {
      lock.current = false
    }
  }
  const submitDecision = async () => {
    if (
      lock.current ||
      !dispute ||
      !canResolve ||
      !validDecision ||
      !explanation.trim()
    )
      return
    lock.current = true
    try {
      await resolve.mutateAsync({
        id: dispute.id,
        decision,
        explanation: explanation.trim(),
      })
      setConfirm(false)
    } catch {
      /* Keep the decision visible for a retry after refresh. */
    } finally {
      lock.current = false
    }
  }
  const submitResponse = async () => {
    if (lock.current || !dispute || !canRespond || !response.trim()) return
    lock.current = true
    try {
      await respond.mutateAsync({ id: dispute.id, response: response.trim() })
    } catch {
      /* Mutation renders the error. */
    } finally {
      lock.current = false
    }
  }
  if (!dispute && (admin || !participant || !eligible)) return null
  const effect =
    decision === 'PAY_COURIER'
      ? `Complete this order and pay ${order.creditReward} reserved credits to ${order.courier?.name ?? 'the assigned courier'}.`
      : decision === 'RELEASE_CREDITS'
        ? `Cancel this order and release ${order.creditReward} reserved credits to the requester.`
        : 'Dismiss this dispute and allow the normal order workflow to resume. No credits will move.'
  return (
    <section
      className={`${common.panel} ${styles.section}`}
      aria-label="Order dispute"
    >
      <h2 className={common.sectionTitle}>
        Dispute{dispute ? ` · ${disputeStatusLabels[dispute.status]}` : ''}
      </h2>
      {!dispute ? (
        <>
          {!showReport ? (
            <Button
              className={common.secondary}
              onClick={() => setShowReport(true)}
            >
              Report dispute
            </Button>
          ) : (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault()
                void submitReport()
              }}
            >
              <label>
                Reason for dispute
                <textarea
                  className={common.input}
                  rows={4}
                  maxLength={2000}
                  required
                  value={complaint}
                  onChange={(event) => setComplaint(event.target.value)}
                  disabled={report.isPending}
                />
              </label>
              <p className={common.muted}>
                Pickup and completion will pause while an admin reviews the
                case. Credits remain reserved. One case can be submitted per
                order.
              </p>
              {report.error && !isCancel(report.error) && (
                <p role="alert" className={common.error}>
                  {disputeErrorMessage(report.error)}
                </p>
              )}
              <div className={common.actions}>
                <Button
                  type="button"
                  className={common.secondary}
                  disabled={report.isPending}
                  onClick={() => setShowReport(false)}
                >
                  Go back
                </Button>
                <Button
                  type="submit"
                  className={common.button}
                  disabled={report.isPending || !complaint.trim()}
                >
                  {report.isPending ? 'Submitting…' : 'Submit dispute'}
                </Button>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <p className={common.muted} title={dispute.id}>
            Case #{shortOrderId(dispute.id)}
          </p>
          <div className={styles.statements}>
            <div>
              <h3 className={common.sectionTitle}>Complaint</h3>
              <p className={common.muted}>
                Reported by{' '}
                {dispute.reporterId === order.requester.id
                  ? (order.requester.name ?? 'Requester')
                  : (order.courier?.name ?? 'Courier')}{' '}
                · {formatOrderTime(dispute.createdAt)}
              </p>
              <p className={styles.text}>{dispute.complaint}</p>
            </div>
            <div>
              <h3 className={common.sectionTitle}>Participant response</h3>
              {dispute.response ? (
                <>
                  <p className={common.muted}>
                    Responded by{' '}
                    {dispute.responderId === order.requester.id
                      ? (order.requester.name ?? 'Requester')
                      : (order.courier?.name ?? 'Courier')}{' '}
                    {dispute.respondedAt &&
                      `· ${formatOrderTime(dispute.respondedAt)}`}
                  </p>
                  <p className={styles.text}>{dispute.response}</p>
                </>
              ) : canRespond ? (
                <form
                  className={styles.form}
                  onSubmit={(event) => {
                    event.preventDefault()
                    void submitResponse()
                  }}
                >
                  <label>
                    Your response
                    <textarea
                      className={common.input}
                      rows={3}
                      maxLength={2000}
                      required
                      value={response}
                      onChange={(event) => setResponse(event.target.value)}
                      disabled={respond.isPending}
                    />
                  </label>
                  <p className={common.muted}>
                    One response per case. Both participants and the admin can
                    read it.
                  </p>
                  {respond.error && !isCancel(respond.error) && (
                    <p role="alert" className={common.error}>
                      {disputeErrorMessage(respond.error)}
                    </p>
                  )}
                  <Button
                    type="submit"
                    className={common.button}
                    disabled={respond.isPending || !response.trim()}
                  >
                    {respond.isPending ? 'Submitting…' : 'Submit response'}
                  </Button>
                </form>
              ) : (
                <p className={common.muted}>
                  {dispute.status === 'OPEN'
                    ? 'The other participant has not responded yet.'
                    : 'No response was submitted.'}
                </p>
              )}
            </div>
          </div>
          {dispute.status === 'OPEN' && (
            <p>
              Pickup and completion are paused. Credits remain reserved while an
              admin reviews this case.
            </p>
          )}
          {dispute.status === 'PROCESSING' && (
            <p role="status">
              The admin decision is recorded. Waiting for credit confirmation.
            </p>
          )}
          {dispute.status === 'NEEDS_ATTENTION' && (
            <p role="alert" className={common.error}>
              Credit processing reported a conflict and needs investigation. The
              original decision remains recorded.
            </p>
          )}
          {dispute.decision && (
            <dl className={styles.history}>
              <dt>Admin decision</dt>
              <dd>{disputeDecisionLabels[dispute.decision]}</dd>
              <dt>Explanation</dt>
              <dd className={styles.text}>{dispute.explanation}</dd>
              <dt>Decided by</dt>
              <dd title={dispute.adminId ?? undefined}>
                {dispute.adminId} ·{' '}
                {dispute.decidedAt && formatOrderTime(dispute.decidedAt)}
              </dd>
              {dispute.resolvedAt && (
                <>
                  <dt>Resolved</dt>
                  <dd>
                    {formatOrderTime(dispute.resolvedAt)} ·{' '}
                    {dispute.decision === 'DISMISS'
                      ? 'Dismissed; normal order workflow resumed.'
                      : dispute.decision === 'PAY_COURIER'
                        ? 'Payment confirmed.'
                        : 'Reserved credits released.'}
                  </dd>
                </>
              )}
            </dl>
          )}
          {admin && participant && dispute.status === 'OPEN' && (
            <p className={common.muted}>
              Another admin must resolve a dispute involving your own order.
            </p>
          )}
          {canResolve && (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault()
                setConfirm(true)
              }}
            >
              <label>
                Decision
                <select
                  className={common.select}
                  value={decision}
                  disabled={resolve.isPending}
                  onChange={(event) =>
                    setDecision(event.target.value as DisputeDecision)
                  }
                >
                  {order.status === 'PICKED_UP' && order.courier && (
                    <option value="PAY_COURIER">Pay courier</option>
                  )}
                  <option value="RELEASE_CREDITS">
                    Cancel and release credits
                  </option>
                  <option value="DISMISS">Dismiss dispute</option>
                </select>
              </label>
              <label>
                Resolution explanation
                <textarea
                  className={common.input}
                  rows={3}
                  maxLength={2000}
                  required
                  disabled={resolve.isPending}
                  value={explanation}
                  onChange={(event) => setExplanation(event.target.value)}
                />
              </label>
              <div className={common.actions}>
                <Button
                  type="submit"
                  className={common.button}
                  disabled={
                    resolve.isPending || !explanation.trim() || !validDecision
                  }
                >
                  Review decision
                </Button>
              </div>
            </form>
          )}
          {dispute.status === 'OPEN' &&
            resolve.error &&
            !isCancel(resolve.error) && (
              <p role="alert" className={common.error}>
                {disputeErrorMessage(resolve.error)}
              </p>
            )}
          <Dialog.Root
            open={confirm && canResolve}
            onOpenChange={(open) => {
              if (!resolve.isPending) setConfirm(open)
            }}
          >
            <Dialog.Portal>
              <Dialog.Backdrop className={dialog.backdrop} />
              <Dialog.Popup className={dialog.popup}>
                <Dialog.Title>Confirm admin decision</Dialog.Title>
                <Dialog.Description>
                  {effect} This decision will be recorded and cannot be
                  replaced.
                </Dialog.Description>
                <p className={styles.text}>{explanation}</p>
                {resolve.error && !isCancel(resolve.error) && (
                  <p role="alert" className={common.error}>
                    {disputeErrorMessage(resolve.error)}
                  </p>
                )}
                <div className={common.actions}>
                  <Dialog.Close
                    className={common.secondary}
                    disabled={resolve.isPending}
                  >
                    Go back
                  </Dialog.Close>
                  <Button
                    className={common.button}
                    disabled={
                      resolve.isPending ||
                      !canResolve ||
                      !validDecision ||
                      !explanation.trim()
                    }
                    onClick={() => void submitDecision()}
                  >
                    {resolve.isPending ? 'Saving…' : 'Confirm decision'}
                  </Button>
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      )}
    </section>
  )
}
