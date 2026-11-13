import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import { useUser } from '../../components/user/UserContext'
import { useToast } from '../../components/toast/useToast'
import type { Supplier } from '../suppliers/models'
import { settlementLabel, filterPersonalOrders, hasOpenDispute, orderDeadline, type OrderFilter, type OrderSort, isUnaccepted, matchesOpenFilters, remainingSeconds, statusLabels, type Order, type OrderAction, type CreditBalance, type OrderItem } from './models'
import { Modal } from '../../components/modal/Modal'
import { OrderReviews } from './DisputeDetails'
import styles from './Orders.module.css'
import { orderNotice, type OrderNotice } from './notifications'
import { buildOrderRequest, isRetryableSubmissionError, submitWithRetry, templateDraft, newCreationAttempt } from './submission'
import type { CreateOrderRequest } from './models'
import { SavedErrands } from './SavedErrands'
import type { SavedErrand } from './models'
import { canApplyOrderPoll, orderPollingGeneration } from '../../api/orderDemo'

type View = 'open' | 'requested' | 'assigned'
type Resource = View | 'credits' | 'suppliers'
type ResourceState = { loaded: boolean; error: boolean }
const initialResourceState: Record<Resource, ResourceState> = {
  open: { loaded: false, error: false },
  requested: { loaded: false, error: false },
  assigned: { loaded: false, error: false },
  credits: { loaded: false, error: false },
  suppliers: { loaded: false, error: false },
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'

const Orders = () => {
  const api = useCampusErrandsAPI()
  const { session } = useUser()
  const { showErrorToast, showSuccessToast } = useToast()
  const [view, setView] = useState<View>('open')
  const [orders, setOrders] = useState<Record<View, Order[]>>({ open: [], requested: [], assigned: [] })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [balance, setBalance] = useState<CreditBalance | null>(null)
  const [resources, setResources] = useState(initialResourceState)
  const [now, setNow] = useState(() => Date.now())
  const [formOpen, setFormOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [items, setItems] = useState<OrderItem[]>([{ name: '', quantity: 1 }])
  const [delivery, setDelivery] = useState('')
  const [notes, setNotes] = useState('')
  const [credits, setCredits] = useState('1')
  const [templateName, setTemplateName] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [templateMessage, setTemplateMessage] = useState('')
  const [templateRevision, setTemplateRevision] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [reportOrder, setReportOrder] = useState<Order | null>(null)
  const [reason, setReason] = useState('')
  const [reportError, setReportError] = useState('')
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)
  const [acceptOrder, setAcceptOrder] = useState<Order | null>(null)
  const [notices, setNotices] = useState<OrderNotice[]>([])
  const observedOrders = useRef(new Map<string, Order>())
  const announced = useRef(new Set<string>())
  const observeOrders = useCallback((incoming: Order[]) => {
    const additions: OrderNotice[] = []
    for (const order of incoming) {
      const notice = orderNotice(observedOrders.current.get(order.id), order, session.user_id)
      observedOrders.current.set(order.id, order)
      if (notice && !announced.current.has(notice.id)) {
        announced.current.add(notice.id)
        additions.push(notice)
      }
    }
    if (additions.length) setNotices((current) => [...current, ...additions])
  }, [session.user_id])
  const [statusFilter, setStatusFilter] = useState<OrderFilter>('all')
  const [sort, setSort] = useState<OrderSort>('newest')
  const [location, setLocation] = useState('')
  const [minCredits, setMinCredits] = useState('')
  const [maxCredits, setMaxCredits] = useState('')
  const refreshing = useRef(false)
  const mutationLock = useRef(false)
  const [creationAttempt, setCreationAttempt] = useState<{ payload: string; key: string } | null>(null)
  const cancellationIntent = useRef(false)
  const [cancellationRequested, setCancellationRequested] = useState(false)
  const [submissionMessage, setSubmissionMessage] = useState('')
  const submissionController = useRef<AbortController | null>(null)
  const submissionForm = useRef<HTMLFormElement | null>(null)
  useEffect(() => () => submissionController.current?.abort(), [])
  useEffect(() => {
    if (!creationAttempt) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [creationAttempt])

  const refresh = useCallback(async (background = false) => {
    const generation = orderPollingGeneration()
    const canApply = () => !background || canApplyOrderPoll(generation)
    if (!canApply() || refreshing.current) return
    refreshing.current = true
    try {
      const loaders: Record<Resource, () => Promise<void>> = {
        open: async () => {
          const open = await api.order.open()
          if (!canApply()) return
          setOrders((current) => ({ ...current, open }))
        },
        requested: async () => {
          const requested = await api.order.requested()
          if (!canApply()) return
          observeOrders(requested)
          setOrders((current) => ({ ...current, requested }))
        },
        assigned: async () => {
          const assigned = await api.order.assigned()
          if (!canApply()) return
          observeOrders(assigned)
          setOrders((current) => ({ ...current, assigned }))
        },
        credits: async () => { const value = await api.credit.current(); if (canApply()) setBalance(value) },
        suppliers: async () => { const value = await api.supplier.list(); if (canApply()) setSuppliers(value) },
      }
      await Promise.all((Object.entries(loaders) as [Resource, () => Promise<void>][]).map(async ([key, load]) => {
        try {
          await load()
          if (!canApply()) return
          setResources((current) => ({ ...current, [key]: { loaded: true, error: false } }))
        } catch {
          if (!canApply()) return
          setResources((current) => ({ ...current, [key]: { ...current[key], error: true } }))
        }
      }))
    } finally {
      refreshing.current = false
    }
  }, [api, observeOrders])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(true), 0)
    const poll = window.setInterval(() => void refresh(true), 5000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { window.clearTimeout(initialLoad); window.clearInterval(poll); window.clearInterval(clock) }
  }, [refresh])

  const selectTemplate = async (template: SavedErrand, edit: boolean) => {
    if (mutationLock.current || creationAttempt) return
    mutationLock.current = true
    setBusy('template-load')
    try {
      const draft = templateDraft(await api.savedErrands.draft(template.id))
      setSupplierId(draft.supplier_id); setItems(draft.items)
      setDelivery(draft.delivery_location); setNotes(draft.pickup_notes ?? ''); setCredits(String(draft.credits))
      setTemplateName(template.name); setEditingTemplate(edit ? template.id : null)
      setTemplateMessage(edit ? 'Editing this saved template. Save changes to update it.' : 'Template loaded. Review the details before submitting a new request.')
      setSubmissionMessage('')
      setFormOpen(true)
    } catch (error) { showErrorToast(`Template could not be loaded. ${errorMessage(error)}`) }
    finally { mutationLock.current = false; setBusy(null) }
  }

  const saveTemplate = async () => {
    if (mutationLock.current || creationAttempt) return
    const draft = templateDraft({ supplier_id: supplierId, items, delivery_location: delivery, pickup_notes: notes, credits: Number(credits) })
    const name = templateName.trim()
    if (!name || name.length > 100 || !draft.supplier_id || !draft.delivery_location || draft.delivery_location.length > 500 || !draft.items.length || draft.items.some((item) => !item.name || item.name.length > 200 || !Number.isSafeInteger(item.quantity) || item.quantity < 1) || !Number.isSafeInteger(draft.credits) || draft.credits < 1) {
      setTemplateMessage('Template not saved. Enter a name, supplier, destination, items and positive whole credits.')
      return
    }
    mutationLock.current = true
    setBusy('template-save')
    setTemplateMessage('Saving template…')
    try {
      const payload = { ...draft, name }
      const saved = editingTemplate ? await api.savedErrands.update(editingTemplate, payload) : await api.savedErrands.create(payload)
      setEditingTemplate(saved.id)
      setTemplateName(saved.name)
      setTemplateRevision((value) => value + 1)
      setTemplateMessage('Template saved. No order was submitted and no credits were reserved.')
      showSuccessToast('Template saved.')
    } catch (error) {
      setTemplateMessage(`Template save was not confirmed. ${errorMessage(error)} Refresh templates before trying again if the connection was lost. Order submission is separate.`)
    } finally { mutationLock.current = false; setBusy(null) }
  }

  const checkedBalance = resources.credits.loaded && !resources.credits.error ? balance : null

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(credits)
    const draft = buildOrderRequest({
      supplier_id: supplierId,
      items,
      delivery_location: delivery,
      pickup_notes: notes,
      credits: amount,
    })
    const payload = creationAttempt?.payload ?? JSON.stringify(draft)
    const request: CreateOrderRequest = JSON.parse(payload)
    const retry = creationAttempt !== null
    if (mutationLock.current) return
    if (!retry && (!suppliers.some((supplier) => supplier.id === supplierId) || !delivery.trim() || items.some((item) => !item.name.trim() || !Number.isSafeInteger(item.quantity) || item.quantity < 1) || !Number.isSafeInteger(amount) || amount < 1 || (checkedBalance !== null && amount > checkedBalance.available_credits))) {
      showErrorToast('Choose an active supplier, complete the delivery details, and offer whole credits within your available balance when it can be checked.')
      return
    }
    mutationLock.current = true
    setBusy('create')
    const controller = new AbortController()
    submissionController.current = controller
    setSubmissionMessage(cancellationIntent.current ? 'Recovering the request to confirm cancellation…' : 'Submitting request…')
    try {
      const attempt = creationAttempt ?? newCreationAttempt(request)
      setCreationAttempt(attempt)
      const { order: created, cancellationUnavailable } = await submitWithRetry({
        api: api.order, request, key: attempt.key, signal: controller.signal,
        wantsCancellation: () => cancellationIntent.current,
        onRetry: (number, delay) => setSubmissionMessage(`${cancellationIntent.current ? 'Cancellation not yet confirmed' : 'Request not yet confirmed'}. Retrying in ${Math.ceil(delay / 1000)}s (attempt ${number}/6)…`),
      })
      if (controller.signal.aborted) return
      if (!cancellationIntent.current) {
        // Seed the new request so even an immediate reservation is announced.
        observedOrders.current.set(created.id, { ...created, status: 'init' })
        observeOrders([created])
      }
      setCreationAttempt(null)
      setSubmissionMessage('')
      setFormOpen(false)
      setItems([{ name: '', quantity: 1 }]); setDelivery(''); setNotes(''); setCredits('1')
      setEditingTemplate(null); setTemplateName(''); setTemplateMessage('')
      setView('requested')
      if (cancellationUnavailable) showErrorToast(`Cancellation could not be completed: the request is ${statusLabels[created.status].toLowerCase()}. Check My requests.`)
      else showSuccessToast(cancellationIntent.current ? 'Request cancelled. Any reserved credits will be released.' : 'Request submitted. It becomes available once credits are reserved.')
      cancellationIntent.current = false
      setCancellationRequested(false)
      await refresh()
    } catch (error) {
      if (controller.signal.aborted) return
      const uncertain = isRetryableSubmissionError(error) || cancellationIntent.current
      if (!uncertain) setCreationAttempt(null)
      setSubmissionMessage(uncertain ? 'Automatic retries paused. The outcome is not confirmed. Retry this same request to resolve it; do not submit a duplicate. Keep this page open.' : errorMessage(error))
      showErrorToast(errorMessage(error))
    } finally {
      mutationLock.current = false
      if (!controller.signal.aborted) setBusy(null)
    }
  }

  const requestCancellation = () => {
    cancellationIntent.current = true
    setCancellationRequested(true)
    setSubmissionMessage('Cancellation requested. We must confirm the order first; cancellation is not guaranteed if it has already been accepted.')
    if (!mutationLock.current) submissionForm.current?.requestSubmit()
  }

  const update = async (order: Order, action: OrderAction) => {
    if (mutationLock.current) return
    mutationLock.current = true
    setBusy(order.id)
    try {
      await api.order.update(order.id, action)
      if (action === 'cancel') setCancelOrder(null)
      if (action === 'accept') { setAcceptOrder(null); setView('assigned') }
      showSuccessToast(action === 'receive' ? 'Receipt confirmed. Credit transfer is processing.' : 'Order updated.')
    } catch (error) { showErrorToast(errorMessage(error)) }
    finally { await refresh(); mutationLock.current = false; setBusy(null) }
  }

  const dispute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mutationLock.current || !reportOrder) return
    if (!reason.trim() || reason.trim().length > 2000) { setReportError('Enter a reason of 1–2,000 characters.'); return }
    mutationLock.current = true
    setBusy(reportOrder.id)
    setReportError('')
    try {
      const result = await api.order.dispute(reportOrder.id, reason.trim())
      setReportOrder(null)
      setReason('')
      showSuccessToast(result.disputes.some((case_) => case_.kind === 'fulfilment' && !case_.closed_at && case_.reason === reason.trim()) ? 'Order disputed.' : 'This order was already disputed. The original reason has been kept.')
    } catch (error) { setReportError(errorMessage(error)) }
    finally { await refresh(); mutationLock.current = false; setBusy(null) }
  }

  const loadError = resources[view].error
  const loadingOrders = !resources[view].loaded && !loadError
  const creationUnavailable = !creationAttempt && suppliers.length === 0

  const visibleOrders = view === 'open'
    ? orders.open.filter((order) => matchesOpenFilters(order, now, location, minCredits, maxCredits))
    : filterPersonalOrders(orders[view], statusFilter, sort)

  return <main className={styles.page}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>A little help goes a long way</p><h1>Orders</h1><p>Ask for a pickup. Help along your route. You can do both, anytime.</p></div>
      <button className={styles.primary} onClick={() => { if (!creationAttempt) { setEditingTemplate(null); setTemplateName(''); setTemplateMessage('') } setFormOpen(true) }} disabled={busy !== null} aria-haspopup="dialog" aria-controls="new-request">+ New request</button>
    </header>
    <section className={styles.wallet} aria-label="Credit balance">
      <div><span>Available credits</span><strong>{resources.credits.error ? '—' : balance?.available_credits ?? '—'}</strong></div>
      <div><span>Reserved credits</span><strong>{resources.credits.error ? '—' : balance?.reserved_credits ?? '—'}</strong></div>
      {resources.credits.error
        ? <div className={styles.notice} role="status"><strong>Credit balance is temporarily unavailable</strong><p>You can still submit requests and manage orders. Credits will be checked when your request is processed.</p><button onClick={() => void refresh()}>Try again</button></div>
        : !resources.credits.loaded ? <p role="status">Loading your credit balance…</p>
        : <p>Credits are reserved for your requests, returned on cancellation or expiry, and awarded to the courier after you confirm receipt.</p>}
    </section>
    <SavedErrands revision={templateRevision} disabled={busy !== null || creationAttempt !== null} onSelect={(template, edit) => void selectTemplate(template, edit)} />
    {formOpen && <Modal id="new-request" labelledBy="request-title" onClose={() => setFormOpen(false)} busy={busy !== null}><section className={styles.formPanel}>
      <div className={styles.formHeading}><h2 id="request-title">{editingTemplate ? 'Edit saved template' : 'What do you need picked up?'}</h2><button type="button" disabled={busy !== null} onClick={() => setFormOpen(false)}>Close</button></div>
      <p>Only active suppliers are available. Open requests expire after 15 minutes.</p>
      {resources.suppliers.error && <div className={styles.notice} role="status"><strong>Suppliers are temporarily unavailable</strong><p>Your draft is safe. Please try again before submitting a new request.</p><button onClick={() => void refresh()}>Try again</button></div>}
      {resources.credits.error && <div className={styles.notice} role="status"><p>Unable to check your credit limit right now. You can still submit, but you may not have enough credits. Your request will only open if enough credits can be reserved.</p><button onClick={() => void refresh()}>Retry balance</button></div>}
      {resources.open.error && <div className={styles.notice} role="status"><p>Orders are temporarily unavailable. You can still submit; we’ll retry if your request cannot be confirmed.</p></div>}
      {submissionMessage && <div className={styles.notice} role="status"><p>{submissionMessage}</p></div>}
      {!resources.credits.loaded && !resources.credits.error && <p role="status">Unable to check your credit limit yet. You can still submit, but you may not have enough credits.</p>}
      {!resources.suppliers.loaded && !resources.suppliers.error && <p role="status">Loading suppliers…</p>}
      {resources.suppliers.loaded && !resources.suppliers.error && suppliers.length === 0 && <p role="status">No active suppliers are available right now.</p>}
      {supplierId && resources.suppliers.loaded && !resources.suppliers.error && !suppliers.some((supplier) => supplier.id === supplierId) && <p role="alert">This template’s supplier is no longer active. Choose an active supplier before submitting.</p>}
      <form ref={submissionForm} onSubmit={(event) => void submit(event)}>
        <fieldset disabled={creationAttempt !== null || busy !== null}>
        <div className={styles.formGrid}>
          <label>Supplier<select required disabled={resources.suppliers.error || !resources.suppliers.loaded} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Choose an active supplier</option>{supplierId && !suppliers.some((supplier) => supplier.id === supplierId) && <option value={supplierId}>Saved supplier unavailable — choose another</option>}{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.building}, floor {supplier.floor}</option>)}</select></label>
          <label>Delivery location<input required maxLength={500} value={delivery} onChange={(event) => setDelivery(event.target.value)} placeholder="Building, floor and meeting point" /></label>
        </div>
        <fieldset><legend>Items for pickup</legend>{items.map((item, index) => <div className={styles.itemRow} key={index}>
          <label>Item {index + 1}<input required maxLength={200} value={item.name} onChange={(event) => setItems(items.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} placeholder="e.g. Iced coffee" /></label>
          <label>Quantity<input required type="number" min="1" step="1" value={item.quantity || ''} onChange={(event) => setItems(items.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} /></label>
          <button type="button" disabled={items.length === 1} aria-label={`Remove item ${index + 1}`} onClick={() => setItems(items.filter((_, i) => i !== index))}>Remove</button>
        </div>)}<button type="button" onClick={() => setItems([...items, { name: '', quantity: 1 }])}>+ Add item</button></fieldset>
        <div className={styles.formGrid}>
          <label>Pickup notes (optional)<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Special instructions, substitutions, or how to collect" /></label>
          <label>Credits to award<input required type="number" min="1" step="1" max={creationAttempt ? undefined : checkedBalance?.available_credits} value={credits} onChange={(event) => setCredits(event.target.value)} /><small>At least 1 whole credit. Available: {resources.credits.error ? 'unavailable' : balance?.available_credits ?? 'loading…'}.</small></label>
        </div>
        </fieldset>
        <section className={styles.templateSave} aria-label="Save reusable template">
          <label>Template name<input maxLength={100} value={templateName} disabled={busy !== null || creationAttempt !== null} onChange={(event) => setTemplateName(event.target.value)} placeholder="e.g. My usual tea" /></label>
          <button type="button" disabled={busy !== null || creationAttempt !== null} onClick={() => void saveTemplate()}>{busy === 'template-save' ? 'Saving template…' : editingTemplate ? 'Save template changes' : 'Save as template'}</button>
          {editingTemplate && <button type="button" disabled={busy !== null || creationAttempt !== null} onClick={() => { setEditingTemplate(null); setTemplateMessage('The next save will create a separate template.') }}>Save as a new template instead</button>}
          <p>Saving keeps reusable details only. Submit separately to create an order and reserve credits.</p>
          {templateMessage && <p role="status">{templateMessage}</p>}
        </section>
        <button className={styles.primary} disabled={busy !== null || (!creationAttempt && checkedBalance !== null && checkedBalance.available_credits < 1) || creationUnavailable || (!creationAttempt && !suppliers.some((supplier) => supplier.id === supplierId))} type="submit">{busy === 'create' ? (cancellationRequested ? 'Cancelling…' : 'Submitting…') : creationAttempt ? (cancellationRequested ? 'Retry cancellation' : 'Retry same request') : 'Submit request'}</button>
        {creationAttempt && !cancellationRequested && <button type="button" onClick={requestCancellation}>Cancel request</button>}
      </form>
    </section></Modal>}
    {notices.length > 0 && !formOpen && !reportOrder && !cancelOrder && !acceptOrder && <Modal id="order-notice" labelledBy="order-notice-title" onClose={() => setNotices((current) => current.slice(1))}><section className={styles.formPanel}>
      <h2 id="order-notice-title">{notices[0].title}</h2>
      <p>{notices[0].order.supplier_snapshot?.name ?? 'Order'} · {notices[0].order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</p>
      <p>{notices[0].message}</p>
      <button className={styles.primary} onClick={() => setNotices((current) => current.slice(1))}>Got it</button>
    </section></Modal>}
    {acceptOrder && <Modal id="accept-request" labelledBy="accept-title" onClose={() => setAcceptOrder(null)} busy={busy !== null}><section className={styles.formPanel}>
      <h2 id="accept-title">Accept this request?</h2>
      <p>{acceptOrder.supplier_snapshot?.name ?? 'Order'} · {acceptOrder.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</p>
      <p>Once you accept, you cannot rescind your acceptance or cancel this delivery. Only accept if you can complete it.</p>
      <div className={styles.cardActions}><button disabled={busy !== null} onClick={() => setAcceptOrder(null)}>Go back</button><button className={styles.primary} disabled={busy !== null || resources.open.error || remainingSeconds(acceptOrder, now) === 0} onClick={() => void update(acceptOrder, 'accept')}>{busy ? 'Accepting…' : 'Accept request'}</button></div>
    </section></Modal>}
    {reportOrder && <Modal id="report-problem" labelledBy="report-title" onClose={() => setReportOrder(null)} busy={busy !== null}><section className={styles.formPanel}>
      <h2 id="report-title">Report a problem</h2>
      <p>{reportOrder.supplier_snapshot?.name ?? 'Order'} · {reportOrder.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</p>
      <p>Reporting pauses order progress for administrator review. It does not automatically refund or pay credits. An administrator can decide to refund the requester or pay the courier. Your reason will be visible to both participants and cannot be edited by reporting again.</p>
      <form onSubmit={(event) => void dispute(event)}>
        <label htmlFor="dispute-reason">What went wrong?</label>
        <textarea id="dispute-reason" required rows={5} maxLength={2000} value={reason} disabled={busy !== null} aria-describedby="reason-help" aria-invalid={!!reportError} onChange={(event) => setReason(event.target.value)} />
        <small id="reason-help">{reason.length} / 2,000 characters</small>
        {reportError && <p role="alert" className={styles.error}>{reportError}</p>}
        <div className={styles.cardActions}><button type="button" disabled={busy !== null} onClick={() => setReportOrder(null)}>Go back</button><button className={styles.primary} type="submit" disabled={busy !== null || !reason.trim() || !!loadError}>{busy ? 'Reporting…' : 'Freeze order and report'}</button></div>
      </form>
    </section></Modal>}
    {cancelOrder && <Modal id="cancel-request" labelledBy="cancel-title" onClose={() => setCancelOrder(null)} busy={busy !== null}><section className={styles.formPanel}>
      <h2 id="cancel-title">Cancel this request?</h2><p>Reserved credits will be returned. This cannot be undone.</p>
      <div className={styles.cardActions}><button disabled={busy !== null} onClick={() => setCancelOrder(null)}>Keep request</button><button disabled={busy !== null || !!loadError} onClick={() => void update(cancelOrder, 'cancel')}>{busy ? 'Cancelling…' : 'Cancel request'}</button></div>
    </section></Modal>}
    <nav className={styles.views} aria-label="Order lists">{([['open', 'Open requests'], ['requested', 'My requests'], ['assigned', 'My deliveries']] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}{key !== 'open' && orders[key].some(hasOpenDispute) ? ` · ${orders[key].filter(hasOpenDispute).length} under review` : ''}</button>)}</nav>
    {view === 'open' && <section className={styles.filters} aria-label="Filter open requests">
      <label>Pickup location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Supplier or building" /></label>
      <label>Minimum credits<input type="number" min="1" step="1" value={minCredits} onChange={(event) => setMinCredits(event.target.value)} placeholder="Any" /></label>
      <label>Maximum credits<input type="number" min="1" step="1" value={maxCredits} onChange={(event) => setMaxCredits(event.target.value)} placeholder="Any" /></label>
    </section>}
    {view !== 'open' && <section className={styles.filters} aria-label="Filter and sort your orders">
      <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OrderFilter)}><option value="all">All orders</option><option value="disputed">Needs review</option><option value="active">Active</option><option value="finished">Finished</option></select></label>
      <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value as OrderSort)}><option value="newest">Newest created</option><option value="oldest">Oldest created</option></select></label>
    </section>}
    <div className={styles.listHeading}><h2>{view === 'open' ? 'Find a favour along your way' : view === 'requested' ? 'Your requests' : 'Your deliveries'}</h2><span>Updates every 5 seconds</span></div>
    {loadError && <div role="status" className={styles.notice}><strong>{view === 'open' ? 'Open requests' : view === 'requested' ? 'Your requests' : 'Your deliveries'} are temporarily unavailable</strong><p>{resources[view].loaded ? 'Showing the last loaded orders. They may be out of date; actions will return when we reconnect.' : 'We couldn’t load this list. Please try again shortly.'} Other sections are still available.</p><button onClick={() => void refresh()}>Try again</button></div>}
    {loadingOrders ? <p role="status">Loading orders…</p> : loadError && visibleOrders.length === 0 ? null : visibleOrders.length === 0 ? <div className={styles.empty}><h3>{view === 'open' ? 'No open requests right now' : 'No matching orders'}</h3><p>{view === 'open' ? 'Try adjusting your filters or check back soon.' : 'Try another status filter, or request or accept an errand.'}</p></div> : <div className={styles.grid}>{visibleOrders.map((order) => {
      const seconds = remainingSeconds(order, now)
      const unaccepted = isUnaccepted(order)
      const expired = unaccepted && seconds === 0
      const own = order.requester_id === session.user_id
      const deadline = orderDeadline(order)
      return <article className={`${styles.card} ${hasOpenDispute(order) ? styles.disputed : ''}`} key={order.id}>
        <div className={styles.cardTop}><span className={styles.status}>{expired ? 'Expired' : statusLabels[order.status]}</span><strong>{order.credits} <small>credits</small></strong></div>
        <h3>{order.supplier_snapshot?.name ?? 'Supplier'}</h3>
        <p className={styles.pickup}>{order.supplier_snapshot ? `${order.supplier_snapshot.building} · Floor ${order.supplier_snapshot.floor}` : 'Pickup location unavailable'}</p>
        <ul>{order.items.map((item, index) => <li key={index}>{item.quantity} × {item.name}</li>)}</ul>
        <p className={styles.notes}><strong>Delivery location:</strong> {order.delivery_location}</p>
        {order.pickup_notes && <p className={styles.notes}><strong>Pickup notes:</strong> {order.pickup_notes}</p>}
        {unaccepted && !expired && <p className={styles.countdown} aria-label="Time remaining before expiry">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} remaining{order.status === 'init' ? ' · Reserving credits…' : ''}</p>}
        {deadline && <p className={styles.countdown}>{deadline.label} due <time dateTime={deadline.at}>{new Date(deadline.at).toLocaleString()}</time>{Date.parse(deadline.at) <= now ? deadline.settlement ? ' · Settlement delayed; automatic recovery continues' : ' · Overdue; awaiting status update' : ''}</p>}
        <OrderReviews disputes={order.disputes ?? []} className={styles.disputeReason} resolvedClassName={styles.resolvedDispute} />
        {order.status_reason && <p className={styles.notes}>{order.status_reason}</p>}
        <p className={styles.notes} role="status">{settlementLabel(order)}{order.credit_reason && ` · Reason: ${order.credit_reason}`}</p>
        {order.status === 'rejected' && <p>Credits could not be reserved. Check your balance before creating another request.</p>}
        <div className={styles.cardActions}>
          {order.available_actions.includes('accept') && <button className={styles.primary} disabled={busy !== null || !!loadError} aria-haspopup="dialog" onClick={() => setAcceptOrder(order)}>{busy === order.id ? 'Updating…' : 'Accept request'}</button>}
          {order.available_actions.includes('cancel') && <button disabled={busy !== null || !!loadError} onClick={() => setCancelOrder(order)}>Cancel request</button>}
          {own && view === 'open' && <small>Your request · You cannot accept it</small>}
          {order.available_actions.includes('pickup') && <button className={styles.primary} disabled={busy !== null || !!loadError} onClick={() => void update(order, 'pickup')}>Mark picked up</button>}
          {order.available_actions.includes('deliver') && <button className={styles.primary} disabled={busy !== null || !!loadError} onClick={() => void update(order, 'deliver')}>Mark delivered</button>}
          {order.available_actions.includes('receive') && <small>Confirming receipt acknowledges fulfilment and starts payment. Report any delivery problem before confirming.</small>}
          {order.available_actions.includes('receive') && <button className={styles.primary} disabled={busy !== null || !!loadError} onClick={() => void update(order, 'receive')}>Confirm received</button>}
          {own && ['accepted', 'picked_up', 'delivered'].includes(order.status) && <small>Assigned to a courier · Cannot be cancelled</small>}
          {order.available_actions.includes('dispute') && <button disabled={busy !== null || !!loadError} aria-haspopup="dialog" onClick={() => { setReason(''); setReportError(''); setReportOrder(order) }}>Report a problem</button>}
          {order.status === 'received' && <small>{order.disputes?.some((case_) => case_.closed_at && case_.resolution === 'pay') ? 'An administrator approved courier payment. ' : ''}{order.credit_status === 'rejected' ? 'Payment was rejected and needs financial review. No new request is needed.' : 'Payment is processing. If delayed, the same payment is recovered automatically; do not submit another request.'}</small>}
          {order.status === 'completed' && <small>Complete · Credits transferred</small>}
          <Link to={`/order-audit-logs/${order.id}/history`} className={styles.historyLink}>
            View timeline
          </Link>
        </div>
      </article>
    })}</div>}
  </main>
}

export default Orders
