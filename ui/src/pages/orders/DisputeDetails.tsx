import { disputeStatus, isAutomaticResolution, resolutionLabel, type Dispute } from './models'

export const DisputeDetails = ({ dispute, className }: { dispute: Dispute; className: string }) => {
  const resolved = disputeStatus(dispute) === 'resolved'
  const automatic = isAutomaticResolution(dispute)
  return <section className={className} aria-label={resolved ? 'Resolved dispute details' : 'Open dispute details'}>
    <strong>{resolved ? automatic ? 'Payment issue resolved automatically' : 'Resolved by administrator' : dispute.kind === 'fulfilment' ? 'Fulfilment review · progress paused' : 'Financial review'}</strong>
    <p>{resolved && 'Original issue: '}{dispute.reason}</p>
    {dispute.closed_at ? <>
      <p>{resolutionLabel(dispute)}</p>
      {dispute.resolution_reason && <p>Resolution reason: {dispute.resolution_reason}</p>}
      <p>Resolved <time dateTime={dispute.closed_at}>{new Date(dispute.closed_at).toLocaleString()}</time></p>
      <p>{automatic ? 'No administrator action was required. See the current credit settlement below.' : 'A recorded decision does not itself confirm payment. See the credit settlement below.'}</p>
    </> : <p>Reporting does not automatically refund or pay credits. Fulfilment milestones are retained.</p>}
  </section>
}

export const OrderReviews = ({ disputes, className, resolvedClassName }: { disputes: Dispute[]; className: string; resolvedClassName: string }) => {
  const open = disputes.filter((case_) => !case_.closed_at)
  const resolved = disputes.filter((case_) => !!case_.closed_at)
  return <>
    {open.map((case_) => <DisputeDetails key={case_.id} dispute={case_} className={className} />)}
    {!!resolved.length && <details><summary>Resolved reviews ({resolved.length})</summary>
      {resolved.map((case_) => <DisputeDetails key={case_.id} dispute={case_} className={`${className} ${resolvedClassName}`} />)}
    </details>}
  </>
}
