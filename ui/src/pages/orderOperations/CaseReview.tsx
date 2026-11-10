import { resolutionLabel, settlementLabel, statusLabels, type Dispute, type Order } from '../orders/models'
import { caseTitle, heldMismatch, movementLabel, rejectionGuidance, reporterRole } from './models'
import type { ReviewAction } from '../../api/orderOperations'
import type { ReviewDetail } from './useCaseReview'
import styles from './OrderOperations.module.css'
import orderStyles from '../orders/Orders.module.css'

type Props = { order: Order; dispute: Dispute; detail?: ReviewDetail; disabled: boolean; person: (id?: string | null) => string; onChoose: (action: ReviewAction) => void }
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded'
const operationName = (operation: string) => ({ RESERVE: 'Hold requester credits', RELEASE: 'Return held credits to requester', TRANSFER: 'Pay courier from held credits' }[operation] ?? operation)

export const CaseReview = ({ order, dispute, detail, disabled, person, onChoose }: Props) => {
  const resolved = !!dispute.closed_at
  const financial = dispute.kind === 'financial'
  const evidenceReady = !!detail?.diagnostics && !detail.evidence_error
  const mismatches = detail?.diagnostics?.accounts.filter(heldMismatch) ?? []
  const actions = new Set(dispute.available_actions ?? [])
  const reportingSide = !dispute.opened_by ? null : dispute.opened_by === order.courier_id ? 'courier' : dispute.opened_by === order.requester_id ? 'requester' : null
  const problem = <section className={`${orderStyles.disputeReason} ${resolved ? orderStyles.resolvedDispute : ''} ${styles.problem}`} aria-label={financial ? 'Payment problem' : 'Reported problem'}>
        <div className={styles.cardHeading}><span className={styles.eyebrow}>{financial ? 'Payment investigation' : reporterRole(order, dispute)}</span><span className={styles.status}>{resolved ? 'Resolved' : 'Open'}</span></div>
        {!reportingSide && <h3>{financial ? caseTitle(dispute) : dispute.opened_by ? person(dispute.opened_by) : 'System-detected problem'}</h3>}
        <p className={styles.meta}>{dispute.opened_by ? `Reported ${date(dispute.created_at)}` : `Detected ${date(dispute.created_at)}`}</p>
        <h4>{financial ? resolved ? 'Why this investigation was opened' : 'Why this needs review' : caseTitle(dispute)}</h4><p className={styles.complaint}>{dispute.reason}</p>
        {!financial && !dispute.opened_by && <p className={styles.meta}>A missed deadline is not proof that either participant is at fault.</p>}
        {resolved ? <div className={styles.recordedDecision}><h4>{resolutionLabel(dispute)}</h4><p>{dispute.resolution_reason}</p><p className={styles.meta}>{person(dispute.closed_by)} · {date(dispute.closed_at)}</p><p>{settlementLabel(order)}</p></div>
          : <>
            {!evidenceReady && <p role="status">Actions require supporting evidence to load successfully.</p>}
            {!financial ? <div className={styles.caseResolution}><h4>Resolve this problem</h4><p>Refund the requester or approve payment to the courier. A reason is required. Neither choice changes the fulfilment milestone.</p>
              <div className={styles.actions}><button data-admin-action disabled={disabled || !evidenceReady || !actions.has('refund')} onClick={() => onChoose('refund')}>Refund requester</button><button data-admin-action disabled={disabled || !evidenceReady || !actions.has('pay')} onClick={() => onChoose('pay')}>Pay courier</button></div>
              {detail && !actions.has('refund') && <p className={styles.warning}>This decision needs confirmed held credits and no prior refund or payment attempt. Any pending or conflicting payment must be investigated first.</p>}
            </div> : <>
              {order.credit_status === 'pending' && <p className={styles.warning}>Awaiting credit confirmation. Automatic reconciliation continues; do not submit another payment.</p>}
              {order.credit_reason && <p>{rejectionGuidance(order.credit_reason)}</p>}
              {detail && <div className={styles.caseResolution}>
                {!!mismatches.length && <p>Review the mismatch below before choosing who funds the shortfall.</p>}
                {(actions.has('charge_reserved') || actions.has('cover_reserved')) && <>
                  <p>Funding and payment are one backend action. Credit checks the live shortfall; if payment fails, funding is rolled back.</p>
                  <button data-admin-action disabled={disabled || !evidenceReady || !actions.has('charge_reserved')} onClick={() => onChoose('charge_reserved')}>Charge requester again</button>
                  <button data-admin-action disabled={disabled || !evidenceReady || !actions.has('cover_reserved')} onClick={() => onChoose('cover_reserved')}>Cover missing credits — no charge to requester</button>
                </>}
                <p className={styles.meta}>The investigation stays open until Credit confirms successful recovery. Unsupported failures require technical investigation.</p>
              </div>}
            </>}
          </>}
      </section>
  const accountEvidence = (userId: string | null) => financial && detail?.diagnostics?.accounts.filter((account) => account.user_id === userId).map((account) => <section className={!resolved && heldMismatch(account) ? styles.accountProblem : styles.accountEvidence} key={account.user_id} aria-label="Account evidence">
    <h4>Credit account</h4>
    {account.missing ? <p>Credit account missing. This needs investigation; there is no automatic account-creation repair here.</p> : <>
      <p>Available: {account.available_credits} · Held: {account.reserved_credits}</p>
      {heldMismatch(account) ? <><h4>Held balance mismatch</h4><p>Stored: {account.reserved_credits} · Active reservations: {account.active_reservation_total}</p>
        <p className={styles.meta}>The backend validates whether this order’s active reservation can safely be funded.</p>
      </> : <p className={styles.meta}>Held balance matches active reservations. This does not verify available credits.</p>}
    </>}
  </section>)
  return <section className={styles.caseReview} aria-label={caseTitle(dispute)}>
    <div className={styles.parties}>
      <section className={styles.party} aria-label="Courier">
        <span className={styles.eyebrow}>Courier</span><h3>{order.courier_id ? person(order.courier_id) : 'Unassigned'}</h3>
        {reportingSide === 'courier' && problem}
        {accountEvidence(order.courier_id)}
      </section>
      <section className={styles.party} aria-label="Requester">
        <span className={styles.eyebrow}>Requester</span><h3>{person(order.requester_id)}</h3>
        {reportingSide === 'requester' && problem}
        {accountEvidence(order.requester_id)}
      </section>
    </div>
    {!reportingSide && <div className={styles.systemProblem}>{problem}</div>}
      <section className={styles.orderContext} aria-label={financial ? 'Payment evidence' : 'What was ordered'}>
        <span className={styles.eyebrow}>{financial ? 'Relevant payment evidence' : 'What was ordered'}</span>
        <h3>{order.supplier_snapshot?.name ?? 'Order'}</h3>
        <ul className={styles.items}>{order.items.map((item, index) => <li key={index}>{item.quantity} × {item.name}</li>)}</ul>
        {order.pickup_notes && <p className={styles.complaint}><strong>Order notes:</strong> {order.pickup_notes}</p>}
        <dl className={styles.orderFacts}><div><dt>Order credits</dt><dd>{order.credits}</dd></div><div><dt>Fulfilment milestone</dt><dd>{statusLabels[order.status]}</dd></div></dl>
        <p className={styles.meta}>The recorded order milestone is separate from the dispute decision and credit settlement.</p>
        {financial && <>
          <p className={styles.payment}>{settlementLabel(order)}</p>
          {detail?.diagnostics?.reservation && <p>{detail.diagnostics.reservation.amount} credits · Reservation {detail.diagnostics.reservation.status.toLowerCase()}</p>}
          {detail?.commands.map((command) => <div className={styles.attempt} key={command.request_id}><strong>{operationName(command.operation)}</strong><p>{command.result?.outcome === 'SUCCEEDED' ? 'Succeeded' : command.result?.outcome === 'REJECTED' ? 'Rejected — not an additional transaction' : 'Awaiting confirmation'} · {date(command.created_at)}</p></div>)}
          {detail?.diagnostics?.accounts.filter((account) => ![order.requester_id, order.courier_id].includes(account.user_id)).map((account) => <div key={account.user_id}><h4>Related account · {person(account.user_id)}</h4>{accountEvidence(account.user_id)}</div>)}
          {detail?.diagnostics && <details className={styles.disclosure}><summary>Executed movements on this order ({detail.diagnostics.audit_logs?.length ?? 0})</summary><ol className={styles.history}>{detail.diagnostics.audit_logs?.map((entry) => <li key={entry.log_id}><strong>{movementLabel(entry, entry.user_id)}</strong><p>{person(entry.user_id)}{entry.recipient_user_id && ` → ${person(entry.recipient_user_id)}`} · {date(entry.created_at)}</p>{entry.reason && <p>{entry.reason}</p>}</li>)}</ol><p className={styles.meta}>These are this order’s records, not a complete account statement.</p></details>}
        </>}
      </section>
  </section>
}
