import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import { Modal } from '../../components/modal/Modal'
import { useToast } from '../../components/toast/useToast'
import { useUser } from '../../components/user/UserContext'
import { routes } from '../../routes'
import { statusLabels, type Order } from '../orders/models'
import { CaseReview } from './CaseReview'
import type { ReviewAction } from '../../api/orderOperations'
import { errorMessage as message, useCaseReview } from './useCaseReview'
import { decisionReducer } from './decision'
import type { OperationsFilter } from './models'
import styles from './OrderOperations.module.css'

const labels: Record<ReviewAction, string> = { refund: 'Refund requester', pay: 'Pay courier', charge_reserved: 'Charge requester again and retry payment', cover_reserved: 'Cover missing credits and retry payment' }
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded'

const OrderOperations = () => {
  const api = useCampusErrandsAPI()
  const { session } = useUser()
  const { showSuccessToast } = useToast()
  const isAdmin = session.role === 'admin' || session.role === 'admin_manager'
  const [orders, setOrders] = useState<Order[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<OperationsFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { reviews, loading: loadingDetail, inspect } = useCaseReview(api)
  const [decisionState, dispatch] = useReducer(decisionReducer, { status: 'closed' })
  const decision = decisionState.status === 'closed' ? null : decisionState
  const saving = decision?.status === 'submitting'
  const reason = decision?.reason ?? ''
  const decisionError = decision?.status === 'uncertain' ? decision.error : ''
  const mutation = useRef(false)
  const loading = useRef(false)

  const refresh = useCallback(async () => {
    if (loading.current || mutation.current) return
    loading.current = true
    try {
      const [queue] = await Promise.all([api.order.disputed(), selectedId ? inspect(selectedId) : Promise.resolve()])
      setOrders(queue); setLoaded(true); setError('')
    }
    catch (failure) { setError(message(failure)) }
    finally { loading.current = false }
  }, [api, inspect, selectedId])
  useEffect(() => {
    if (!isAdmin) return
    const initial = window.setTimeout(() => void refresh(), 0)
    const poll = window.setInterval(() => void refresh(), 15000)
    return () => { window.clearTimeout(initial); window.clearInterval(poll) }
  }, [isAdmin, refresh])
  if (!isAdmin) return <Navigate to={routes.home} replace />

  const selected = selectedId && reviews[selectedId]
  const people = selected && selected.status === 'ready' ? selected.detail.people : []
  const person = (id?: string | null) => id ? people.find((entry) => entry.user_id === id)?.email ?? id : 'System'
  const choose = (order: Order, action: ReviewAction, caseId: string) => {
    dispatch({ type: 'choose', decision: { order, action, caseId, requestId: crypto.randomUUID() } })
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!decision || mutation.current || !reason.trim()) return
    mutation.current = true
    const submittedReason = reason.trim()
    dispatch({ type: 'submit' })
    try {
      const { action, requestId, caseId } = decision
      if (action === 'refund' || action === 'pay') {
        await api.order.resolve(caseId, action, submittedReason)
      } else {
        await api.order.repair(caseId, requestId, action, submittedReason)
      }
      showSuccessToast('Action recorded. The case decision and actual payment outcome remain separate.')
      dispatch({ type: 'accepted' })
    } catch (failure) {
      dispatch({ type: 'failed', error: message(failure) })
    }
    finally { mutation.current = false; await refresh() }
  }
  const visible = orders.filter((order) => filter === 'all' || order.review_category === filter)
  return <main className={styles.page}>
    <header className={styles.heading}><div><span className="adminBadge">Admin only · Dispute review</span><h1>Review the problem. Resolve it here.</h1><p>Each open problem contains its relevant actions. Resolved cases show the recorded decision.</p></div><button disabled={saving} onClick={() => void refresh()}>Refresh queue</button></header>
    <nav className={styles.filters} aria-label="Filter disputed orders">{(['all', 'fulfilment', 'financial', 'history'] as const).map((key) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{({ all: 'All cases', fulfilment: 'Service disputes', financial: 'Payment investigations', history: 'Resolved history' })[key]} ({orders.filter((order) => key === 'all' || order.review_category === key).length})</button>)}</nav>
    {error && <p className={styles.error} role="alert">{error} Actions disabled until refresh succeeds.</p>}
    {!loaded && !error && <p role="status">Loading disputed orders…</p>}
    {loaded && !visible.length && <p className={styles.empty}>No orders in this view.</p>}
    <div className={styles.queue}>{visible.map((queuedOrder) => {
      const review = reviews[queuedOrder.id]
      const detail = review?.status === 'ready' ? review.detail : undefined
      const open = selectedId === queuedOrder.id
      const order = open && detail ? detail.order : queuedOrder
      const disabled = saving || !!error
      return <article className={styles.card} key={order.id}>
        <div className={styles.cardHeading}><div><span className={styles.status}>{statusLabels[order.status]}</span><h2>{order.supplier_snapshot?.name ?? 'Order'}</h2><p className={styles.meta}>{order.disputes.some((case_) => !case_.closed_at) ? 'Open review' : 'Resolved cases'} · {order.disputes.length} {order.disputes.length === 1 ? 'case' : 'cases'}</p></div><strong>{order.credits} credits</strong></div>
        <button aria-expanded={open} disabled={saving || loadingDetail} onClick={() => { setSelectedId(open ? null : order.id); if (!open) void inspect(order.id) }}>{open ? 'Collapse review' : 'Review case'}</button>
        {open && <div className={styles.review}>
          {review?.status === 'failed' && <p role="alert" className={styles.error}>{review.error} Actions require evidence to load successfully.</p>}
          {detail?.evidence_error && <p role="alert" className={styles.error}>{detail.evidence_error} Actions disabled until evidence is available.</p>}
          {detail && order.disputes.map((case_) => <CaseReview key={case_.id} order={order} dispute={case_} detail={detail} disabled={disabled} person={person} onChoose={(action) => choose(order, action, case_.id)} />)}
          <div className={styles.evidenceRefresh}><p className={styles.meta}>{detail ? `Evidence checked ${date(detail.inspectedAt)}` : 'Loading supporting records…'}</p><button disabled={loadingDetail || saving} onClick={() => void inspect(order.id)}>{review?.status === 'loading' ? 'Loading…' : 'Refresh supporting records'}</button></div>
          {detail && <details className={styles.disclosure}><summary>Order activity & decisions</summary><ol className={styles.history}>{detail.audit.map((entry) => <li key={entry.log_id}><strong>{entry.action.replaceAll('_', ' ')}</strong> · {date(entry.created_at)}<p>{person(entry.actor_id)}{entry.reason && ` · ${entry.reason}`}</p></li>)}</ol></details>}
          <details className={styles.disclosure}><summary>Technical details & immutable IDs</summary><p className={styles.identifier}>Order: {order.id}<br />Requester: {order.requester_id}<br />Courier: {order.courier_id ?? 'Unassigned'}</p>{order.disputes.map((case_) => <p className={styles.identifier} key={case_.id}>Case: {case_.id} · Opened by: {case_.opened_by ?? 'System'} · Closed by: {case_.closed_by ?? '—'}</p>)}{detail && <pre className={styles.raw}>{JSON.stringify({ diagnostics: detail.diagnostics, commands: detail.commands, audit: detail.audit }, null, 2)}</pre>}</details>
        </div>}
      </article>
    })}</div>
    {decision && <Modal id="dispute-action" labelledBy="action-title" busy={saving} onClose={() => dispatch({ type: 'close' })}><section className={styles.confirmation}>
      <h2 id="action-title">{labels[decision.action]}?</h2>
      <p>{decision.order.credits} credits · {decision.order.supplier_snapshot?.name ?? 'Order'}</p>
      {decision.action === 'refund' && <p>Release {decision.order.credits} held credits to {person(decision.order.requester_id)} without changing the recorded fulfilment milestone. The refund remains pending until Credit confirms it.</p>}
      {decision.action === 'pay' && <p>Transfer {decision.order.credits} held credits to {person(decision.order.courier_id)} without marking the order delivered, received, or completed. Payment remains pending until Credit confirms it.</p>}
      {(decision.action === 'charge_reserved' || decision.action === 'cover_reserved') && <div className={styles.preview}><p>{decision.action === 'charge_reserved' ? 'Charge the requester’s available credits again to fund the reservation. This may be an additional charge; check the evidence first.' : 'Issue new credits into the reservation. The platform covers the shortfall; the requester is not charged.'}</p><p>Credit calculates the live shortfall, bounded by this reservation, and settles payment atomically. If payment fails, funding is rolled back. The investigation resolves only after confirmed success.</p></div>}
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="action-reason">Decision reason & supporting evidence</label><textarea id="action-reason" rows={4} required maxLength={2000} disabled={decision.status !== 'editing'} value={reason} onChange={(event) => dispatch({ type: 'edit', reason: event.target.value })} />
        {decisionError && <p role="alert" className={styles.error}>{decisionError} Retry retains the same request ID and payload.</p>}
        <p>Once recorded, the backend finishes this action even if you close this page.</p>
        <details className={styles.disclosure}><summary>Action identifiers</summary><p className={styles.identifier}>Order {decision.order.id} · Case {decision.caseId} · Request {decision.requestId}</p></details>
        <div className={styles.actions}><button type="button" disabled={saving} onClick={() => dispatch({ type: 'close' })}>Cancel</button><button type="submit" data-admin-action disabled={saving || !!error || !reason.trim()}>{saving ? 'Recording…' : 'Confirm action'}</button></div>
      </form>
    </section></Modal>}
  </main>
}
export default OrderOperations
