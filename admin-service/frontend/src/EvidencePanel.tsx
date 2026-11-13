import { useEffect, useRef, useState } from 'react'
import { CaseError, request } from './cases'
import { EvidenceImage } from './EvidenceImage'
import { participantLabels } from './casePeople'
import { formatSingaporeTime as date } from './time'
import {
  Bike,
  CheckCheck,
  CircleAlert,
  Clock3,
  Coins,
  FileText,
  MapPin,
  MessageSquare,
  Route,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'

type Checkpoint = {
  source: string
  stream: string
  aggregateId: string
  committedSequence: number
  projectedSequence: number
  checkedAt: string
}
type Gap = {
  source: string
  stream: string
  aggregateId: string
  fromSequence: number
  toSequence: number
  reason: string
}
type Participant = {
  userId: string
  relationship: 'REQUESTER' | 'HISTORICAL_COURIER'
  assignedAt: string | null
  unassignedAt: string | null
}
type Snapshot = {
  orderId: string
  requesterId: string
  courierId: string | null
  status: string
  title: string
  description: string
  creditReward: number
  pickupDeadline: string
  pickupLocationId: string
  dropoffLocationId: string
  pickupLocationName: string | null
  dropoffLocationName: string | null
}
type Data =
  | {
      kind: 'CHAT'
      caseId: string
      conversationId: string
      conversationType: 'ERRAND' | 'CASE'
      participantUserId: string | null
      messageId: string
      messageType: 'TEXT' | 'QUICK_REPLY' | 'IMAGE'
      text: string | null
      attachment: {
        id: string
        contentType: string
        filename: string
        size: number
      } | null
    }
  | {
      kind: 'ORDER'
      fromState: string | null
      toState: string
      requesterId: string
      courierId: string | null
      previousCourierId: string | null
      snapshot: Snapshot
    }
  | {
      kind: 'CREDIT'
      operationId: string
      result: string
      reasonCode: string | null
      ledgerEntries: {
        ledgerEntryId: string
        userId: string
        availableDelta: number
        reservedDelta: number
        availableBalance: number
        reservedBalance: number
      }[]
    }
  | {
      kind: 'ADMIN'
      caseId: string
      operationId: string | null
      targetUserId: string | null
      result: string | null
    }
export type EvidenceRecord = {
  eventId: string
  source: string
  stream: string
  sourceSequence: number
  orderId: string
  action: string
  actorUserId: string | null
  occurredAt: string
  ingestedAt: string
  data: Data
}
export type Timeline = {
  caseId: string
  orderId: string
  evidenceRevision: string
  order: Snapshot
  participants: Participant[]
  records: EvidenceRecord[]
  coverage: {
    status: 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN'
    asOf: string
    checkpoints: Checkpoint[]
    blockingGaps: Gap[]
  }
  nextCursor: string | null
}

const readable = (value: string) => {
  const words = value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const historyName = (source: string) => {
  const names: Record<string, string> = {
    'order-service': 'Errand history',
    'credit-service': 'Credit history',
    'admin-service': 'Case history',
  }
  return Object.hasOwn(names, source) ? names[source] : 'Other history source'
}
const categoryName = {
  ORDER: 'Errand',
  CREDIT: 'Credits',
  ADMIN: 'Case review',
  CHAT: 'Chat',
}
function activityTitle(record: EvidenceRecord) {
  const orderActions: Record<string, string> = {
    REVIEW_STARTED: 'Errand placed under review',
    DISPUTE_RESOLVED: 'Errand resolved after review',
    SUBMIT: 'Errand submitted',
    OPEN: 'Errand opened',
    FAIL_RESERVATION: 'Credit reservation failed',
    CANCEL: 'Errand cancelled',
    EXPIRE: 'Errand expired',
    ACCEPT: 'Errand accepted',
    WITHDRAW: 'Courier withdrew',
    PICK_UP: 'Errand picked up',
    DELIVER: 'Errand delivered',
    COMPLETE: 'Errand completed',
    EDIT: 'Errand details updated',
    REWARD_CHANGE_APPLIED: 'Reward change applied',
    REWARD_CHANGE_REJECTED: 'Reward change rejected',
  }
  const caseActions: Record<string, string> = {
    CaseOpened: 'Case opened',
    CaseClaimed: 'Reviewer assigned',
    CaseActionCompleted: 'Case action completed',
    CaseResolved: 'Case resolved',
  }
  const actions =
    record.data.kind === 'ORDER'
      ? orderActions
      : record.data.kind === 'ADMIN'
        ? caseActions
        : {}
  return Object.hasOwn(actions, record.action)
    ? actions[record.action]
    : readable(record.action)
}
function EvidenceTime({ value }: { value: string }) {
  return <time dateTime={value}>{date(value)}</time>
}
function compare(a: EvidenceRecord, b: EvidenceRecord) {
  return (
    Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
    (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
    a.sourceSequence - b.sourceSequence ||
    (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
  )
}
function complete(timeline: Timeline) {
  const c = timeline.coverage
  return (
    c.status === 'COMPLETE' &&
    !c.blockingGaps.length &&
    c.checkpoints.length > 0 &&
    c.checkpoints.every((p) => p.projectedSequence >= p.committedSequence)
  )
}
function failure(error: unknown) {
  if (error instanceof CaseError) {
    if (error.status === 401)
      return 'You’ve been signed out. Sign in again to see the evidence.'
    if (error.status === 403 || error.status === 404)
      return 'You no longer have access to this evidence.'
    if (error.status === 409)
      return 'This evidence changed. Reload the timeline to see the latest.'
  }
  return 'We couldn’t load all the evidence. Try again — this view may be incomplete.'
}
function EvidenceData({
  record,
  participant,
  linkParticipants = false,
  compactChat = false,
}: {
  record: EvidenceRecord
  participant: (id: string) => string
  linkParticipants?: boolean
  compactChat?: boolean
}) {
  const data = record.data
  if (data.kind === 'CHAT')
    return (
      <div className="evidence-data">
        {!compactChat && (
          <p>
            {data.conversationType === 'ERRAND'
              ? 'Errand conversation'
              : 'Private conversation with ' +
                (data.participantUserId
                  ? participant(data.participantUserId)
                  : 'case participant')}
          </p>
        )}
        {data.text !== null && <p className="statement-text">{data.text}</p>}
        {data.attachment && (
          <EvidenceImage
            caseId={data.caseId}
            messageId={data.messageId}
            filename={data.attachment.filename}
          />
        )}
      </div>
    )
  const debits =
    data.kind === 'CREDIT'
      ? data.ledgerEntries.filter(
          (entry) => entry.availableDelta + entry.reservedDelta < 0,
        )
      : []
  const credits =
    data.kind === 'CREDIT'
      ? data.ledgerEntries.filter(
          (entry) => entry.availableDelta + entry.reservedDelta > 0,
        )
      : []
  const debit = debits[0]
  const credit = credits[0]
  const movement =
    data.kind === 'CREDIT' &&
    data.result === 'APPLIED' &&
    data.ledgerEntries.length === 2 &&
    debits.length === 1 &&
    credits.length === 1 &&
    debit &&
    credit &&
    debit.userId !== credit.userId &&
    -(debit.availableDelta + debit.reservedDelta) ===
      credit.availableDelta + credit.reservedDelta
      ? {
          from: debit.userId,
          to: credit.userId,
          amount: credit.availableDelta + credit.reservedDelta,
        }
      : null
  const person = (id: string) =>
    linkParticipants &&
    !participant(id).startsWith('Account not identified') ? (
      <a href={`#person-${id}`}>{participant(id)}</a>
    ) : (
      participant(id)
    )
  if (data.kind === 'ORDER')
    return (
      <div className="evidence-data">
        <p>
          {data.fromState ? readable(data.fromState) : 'Initial state'} →{' '}
          {readable(data.toState)}
        </p>
        <p>Requester: {person(data.requesterId)}</p>
        <p>
          Courier: {data.courierId ? person(data.courierId) : 'Unassigned'}
          {data.previousCourierId &&
            ` · Previous courier: ${participant(data.previousCourierId)}`}
        </p>
        <details>
          <summary>Errand details at this event</summary>
          <p>{data.snapshot.title}</p>
          <p className="statement-text">{data.snapshot.description}</p>
          <p>
            {data.snapshot.creditReward} credits · Deadline{' '}
            {date(data.snapshot.pickupDeadline)}
          </p>
          <p>
            {data.snapshot.pickupLocationName || 'Pickup name unavailable'} →{' '}
            {data.snapshot.dropoffLocationName || 'Drop-off name unavailable'}
          </p>
        </details>
      </div>
    )
  if (data.kind === 'CREDIT')
    return (
      <div className="evidence-data">
        <p>
          Outcome: {readable(data.result)}
          {data.reasonCode && ` · ${readable(data.reasonCode)}`}
        </p>
        {movement && (
          <div
            className="credit-movement"
            aria-label="Recorded credit movement"
          >
            <span>{person(movement.from)}</span>
            <span className="credit-movement-amount">
              <Coins aria-hidden="true" />
              {movement.amount} credits
              <ArrowRight aria-hidden="true" />
            </span>
            <span>{person(movement.to)}</span>
          </div>
        )}
        {data.ledgerEntries.length ? (
          <ul className="timeline-credit-people">
            {data.ledgerEntries.map((entry) => (
              <li key={entry.ledgerEntryId}>
                <strong>{person(entry.userId)}</strong>
                <dl className="timeline-credit-facts">
                  <div>
                    <dt>Available credits</dt>
                    <dd>
                      <strong>
                        {entry.availableDelta === 0
                          ? 'No change'
                          : `${entry.availableDelta > 0 ? 'Added' : 'Removed'} ${Math.abs(entry.availableDelta)} ${Math.abs(entry.availableDelta) === 1 ? 'credit' : 'credits'}`}
                      </strong>
                      <span>
                        {entry.availableBalance - entry.availableDelta} →{' '}
                        {entry.availableBalance} available after this event
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Credits held for errands</dt>
                    <dd>
                      <strong>
                        {entry.reservedDelta === 0
                          ? 'No change'
                          : `${entry.reservedDelta > 0 ? 'Held' : 'Released'} ${Math.abs(entry.reservedDelta)} ${Math.abs(entry.reservedDelta) === 1 ? 'credit' : 'credits'}`}
                      </strong>
                      <span>
                        {entry.reservedBalance - entry.reservedDelta} →{' '}
                        {entry.reservedBalance} held after this event
                      </span>
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        ) : (
          <p>No credit balance changes were recorded for this outcome.</p>
        )}
      </div>
    )
  return (
    <div className="evidence-data">
      {data.targetUserId && (
        <p>Affected account: {person(data.targetUserId)}</p>
      )}
      {data.result && <p>Outcome: {readable(data.result)}</p>}
    </div>
  )
}

function RecordDetails({ record }: { record: EvidenceRecord }) {
  const data = record.data
  return (
    <details className="evidence-technical">
      <summary>Technical details</summary>
      <dl className="evidence-identifiers">
        <div>
          <dt>Event ID</dt>
          <dd>{record.eventId}</dd>
        </div>
        <div>
          <dt>Action</dt>
          <dd>{record.action}</dd>
        </div>
        <div>
          <dt>Source / broker stream</dt>
          <dd>
            {record.source} / {record.stream}
          </dd>
        </div>
        <div>
          <dt>Source sequence</dt>
          <dd>{record.sourceSequence}</dd>
        </div>
        <div>
          <dt>Errand ID</dt>
          <dd>{record.orderId}</dd>
        </div>
        <div>
          <dt>Actor ID</dt>
          <dd>{record.actorUserId || 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Added to evidence</dt>
          <dd>
            <EvidenceTime value={record.ingestedAt} />
          </dd>
        </div>
        {data.kind === 'ORDER' && (
          <>
            <div>
              <dt>Requester ID</dt>
              <dd>{data.requesterId}</dd>
            </div>
            <div>
              <dt>Courier ID</dt>
              <dd>{data.courierId || 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Previous courier ID</dt>
              <dd>{data.previousCourierId || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Pickup location ID</dt>
              <dd>{data.snapshot.pickupLocationId}</dd>
            </div>
            <div>
              <dt>Drop-off location ID</dt>
              <dd>{data.snapshot.dropoffLocationId}</dd>
            </div>
          </>
        )}
        {data.kind === 'ADMIN' && (
          <>
            <div>
              <dt>Case ID</dt>
              <dd>{data.caseId}</dd>
            </div>
            <div>
              <dt>Operation ID</dt>
              <dd>{data.operationId || 'Not supplied'}</dd>
            </div>
            <div>
              <dt>Target account ID</dt>
              <dd>{data.targetUserId || 'Not supplied'}</dd>
            </div>
          </>
        )}
        {data.kind === 'CREDIT' && (
          <>
            <div>
              <dt>Operation ID</dt>
              <dd>{data.operationId}</dd>
            </div>
            <div>
              <dt>Reason code</dt>
              <dd>{data.reasonCode || 'Not supplied'}</dd>
            </div>
            {data.ledgerEntries.map((entry) => (
              <div key={entry.ledgerEntryId}>
                <dt>Ledger entry / account ID</dt>
                <dd>
                  {entry.ledgerEntryId} / {entry.userId}
                </dd>
              </div>
            ))}
          </>
        )}
      </dl>
    </details>
  )
}

// Group in producer order, before filtering: hidden intervening events still break a message run.
type ActivityRecords = [EvidenceRecord, ...EvidenceRecord[]]
function groupActivity(records: EvidenceRecord[]): ActivityRecords[] {
  const groups: ActivityRecords[] = []
  for (const record of records) {
    const group = groups[groups.length - 1]
    const previous = group?.[group.length - 1]
    const gap = previous
      ? Date.parse(record.occurredAt) - Date.parse(previous.occurredAt)
      : NaN
    if (
      previous &&
      previous.data.kind === 'CHAT' &&
      record.data.kind === 'CHAT' &&
      previous.actorUserId !== null &&
      previous.actorUserId === record.actorUserId &&
      previous.data.conversationId === record.data.conversationId &&
      previous.data.conversationType === record.data.conversationType &&
      previous.data.participantUserId === record.data.participantUserId &&
      gap >= 0 &&
      gap <= 5 * 60 * 1000 &&
      date(previous.occurredAt).split(',')[0] ===
        date(record.occurredAt).split(',')[0]
    ) {
      group.push(record)
    } else groups.push([record])
  }
  return groups
}

function ActivityGroup({
  records,
  participant,
  linkParticipants,
}: {
  records: ActivityRecords
  participant: (id: string) => string
  linkParticipants: boolean
}) {
  const first = records[0]
  const chat = first.data.kind === 'CHAT'
  const author = first.actorUserId
    ? participant(first.actorUserId)
    : 'Person not recorded'
  return (
    <li className={chat ? 'timeline-message-group' : undefined}>
      <article>
        <div className="section-heading">
          <h4 className="icon-heading">
            {chat ? (
              <MessageSquare aria-hidden="true" />
            ) : first.data.kind === 'ORDER' ? (
              <Route aria-hidden="true" />
            ) : first.data.kind === 'CREDIT' ? (
              <Coins aria-hidden="true" />
            ) : (
              <ShieldCheck aria-hidden="true" />
            )}
            {chat ? author : activityTitle(first)}
          </h4>
          <span className="role-chip">{categoryName[first.data.kind]}</span>
        </div>
        {chat && first.data.kind === 'CHAT' && (
          <p className="evidence-meta">
            {first.data.conversationType === 'ERRAND'
              ? 'Errand conversation'
              : 'Private conversation with ' +
                (first.data.participantUserId
                  ? participant(first.data.participantUserId)
                  : 'case participant')}
          </p>
        )}
        {!chat && (
          <p className="evidence-meta">
            {first.actorUserId && 'By '}
            {first.actorUserId &&
            linkParticipants &&
            !author.startsWith('Account not identified') ? (
              <a href={`#person-${first.actorUserId}`}>{author}</a>
            ) : (
              author
            )}
          </p>
        )}
        {records.map((record) => (
          <div
            key={record.eventId}
            className={chat ? 'timeline-message' : undefined}
          >
            <p className="evidence-meta">
              {!chat && 'Occurred '}
              <EvidenceTime value={record.occurredAt} />
            </p>
            <EvidenceData
              record={record}
              participant={participant}
              linkParticipants={linkParticipants}
              compactChat={chat}
            />
            <RecordDetails record={record} />
          </div>
        ))}
      </article>
    </li>
  )
}

export function EvidencePanel({
  caseId,
  orderId,
  onSnapshot,
  names = {},
}: {
  caseId: string
  orderId: string
  onSnapshot?: (value: Timeline | null) => void
  names?: Record<string, string>
}) {
  const [filter, setFilter] = useState('ALL')
  const [snapshot, setSnapshot] = useState<Timeline>()
  const [records, setRecords] = useState<EvidenceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [restartRequired, setRestartRequired] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(Symbol())
  const busy = useRef(false)
  const loaded = useRef<Timeline | undefined>(undefined)
  const knownRecords = useRef<EvidenceRecord[]>([])
  const cursors = useRef(new Set<string>())
  const focused = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let active = true
    const currentGeneration = Symbol()
    generation.current = currentGeneration
    loaded.current = undefined
    knownRecords.current = []
    cursors.current.clear()
    async function firstPage() {
      busy.current = true
      setLoading(true)
      const abort = new AbortController()
      controller.current = abort
      const timeout = window.setTimeout(() => abort.abort(), 8000)
      try {
        const data = await request<Timeline>(
          `cases/${caseId}/timeline?limit=20`,
          abort.signal,
        )
        if (!active || generation.current !== currentGeneration) return
        if (
          data.caseId !== caseId ||
          data.orderId !== orderId ||
          !data.coverage ||
          !Array.isArray(data.records) ||
          !Array.isArray(data.participants)
        )
          throw new Error('Mismatched evidence')
        loaded.current = data
        knownRecords.current = data.records
        setSnapshot(data)
        onSnapshot?.(data)
        setRecords(data.records)
      } catch (e) {
        if (active) {
          setError(failure(e))
          onSnapshot?.(null)
        }
      } finally {
        clearTimeout(timeout)
        if (active) {
          busy.current = false
          setLoading(false)
        }
      }
    }
    void firstPage()
    return () => {
      active = false
      generation.current = Symbol()
      controller.current?.abort()
      busy.current = false
    }
  }, [caseId, orderId, attempt, onSnapshot])

  async function more() {
    const previous = loaded.current
    if (busy.current || !previous?.nextCursor || restartRequired) return
    busy.current = true
    setLoading(true)
    setError('')
    const requestGeneration = generation.current
    const abort = new AbortController()
    controller.current = abort
    const timeout = window.setTimeout(() => abort.abort(), 8000)
    try {
      const cursor = previous.nextCursor
      const data = await request<Timeline>(
        `cases/${caseId}/timeline?limit=20&cursor=${encodeURIComponent(cursor)}`,
        abort.signal,
      )
      if (generation.current !== requestGeneration) return
      if (
        data.caseId !== caseId ||
        data.orderId !== orderId ||
        data.evidenceRevision !== previous.evidenceRevision ||
        JSON.stringify(data.order) !== JSON.stringify(previous.order) ||
        JSON.stringify(data.participants) !==
          JSON.stringify(previous.participants) ||
        JSON.stringify(data.coverage) !== JSON.stringify(previous.coverage) ||
        (data.nextCursor &&
          (data.nextCursor === cursor || cursors.current.has(data.nextCursor)))
      ) {
        throw new CaseError(409, 'Changed snapshot')
      }
      const existing = new Map(
        knownRecords.current.map((record) => [record.eventId, record]),
      )
      const additions: EvidenceRecord[] = []
      for (const record of data.records) {
        const duplicate = existing.get(record.eventId)
        if (duplicate) {
          if (JSON.stringify(duplicate) !== JSON.stringify(record))
            throw new CaseError(409, 'Conflicting evidence')
          continue
        }
        const last = additions.at(-1) || knownRecords.current.at(-1)
        if (last && compare(last, record) > 0)
          throw new CaseError(409, 'Unordered evidence')
        additions.push(record)
        existing.set(record.eventId, record)
      }
      if (!additions.length && data.nextCursor)
        throw new CaseError(409, 'Non-progressing evidence')
      cursors.current.add(cursor)
      loaded.current = data
      knownRecords.current = [...knownRecords.current, ...additions]
      setRecords(knownRecords.current)
      setSnapshot(data)
      onSnapshot?.(data)
    } catch (e) {
      if (generation.current !== requestGeneration) return
      setError(failure(e))
      if (e instanceof CaseError && e.status === 409) setRestartRequired(true)
      if (e instanceof CaseError && [401, 403, 404].includes(e.status)) {
        setSnapshot(undefined)
        onSnapshot?.(null)
        setRecords([])
        loaded.current = undefined
      }
    } finally {
      clearTimeout(timeout)
      if (generation.current === requestGeneration) {
        busy.current = false
        setLoading(false)
      }
    }
  }
  function restart() {
    controller.current?.abort()
    generation.current = Symbol()
    setSnapshot(undefined)
    onSnapshot?.(null)
    setRecords([])
    setError('')
    setRestartRequired(false)
    setAttempt((n) => n + 1)
    focused.current?.focus()
  }
  const trustworthy =
    snapshot && !error && !restartRequired && complete(snapshot)
  const participant = participantLabels(snapshot?.participants || [], names)
  return (
    <section
      className="case-panel evidence-panel"
      aria-labelledby="evidence-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Case evidence</p>
          <h2
            id="evidence-title"
            className="icon-heading"
            ref={focused}
            tabIndex={-1}
          >
            <Clock3 aria-hidden="true" /> Errand details and activity
          </h2>
        </div>
        <button
          type="button"
          className="button-secondary"
          disabled={loading}
          onClick={restart}
        >
          Refresh evidence
        </button>
      </div>
      <p>
        Review errand, credit, and case history. Check the evidence status below
        before making a decision.
      </p>
      {loading && (
        <p role="status">
          {snapshot ? 'Loading more evidence…' : 'Loading evidence…'}
        </p>
      )}
      {error && (
        <div role="alert" className="evidence-notice evidence-warning">
          <h3>Evidence {restartRequired ? 'has changed' : 'unavailable'}</h3>
          <p>{error}</p>
          {snapshot && (
            <p>
              Earlier records are shown for reference. They may not reflect the
              current history.
            </p>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={snapshot && !restartRequired ? () => void more() : restart}
          >
            {snapshot && !restartRequired
              ? 'Try loading evidence again'
              : 'Reload timeline'}
          </button>
        </div>
      )}
      {snapshot && (
        <>
          <section
            className={
              'evidence-notice ' +
              (trustworthy ? 'evidence-complete' : 'evidence-warning')
            }
            aria-labelledby="coverage-title"
          >
            <h3 id="coverage-title" className="icon-heading">
              {trustworthy ? (
                <CheckCheck aria-hidden="true" />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
              {trustworthy
                ? 'History checked through the latest update'
                : error || restartRequired
                  ? 'History completeness unverified'
                  : snapshot.coverage.status === 'UNKNOWN'
                    ? 'History completeness unverified'
                    : 'Evidence is incomplete'}
            </h3>
            {!trustworthy && (
              <p>
                Some activity may be missing or unverified. Refresh evidence
                before resolving.
              </p>
            )}
            <p>
              Completeness checked{' '}
              <EvidenceTime value={snapshot.coverage.asOf} />
            </p>
          </section>
          <section className="evidence-section">
            <h3 className="icon-heading">
              <FileText aria-hidden="true" /> Recorded errand details
            </h3>
            <h4>{snapshot.order.title}</h4>
            <p className="statement-text">{snapshot.order.description}</p>
            <dl className="case-facts">
              <div>
                <dt>Status</dt>
                <dd>{readable(snapshot.order.status)}</dd>
              </div>
              <div>
                <dt>
                  <Coins aria-hidden="true" /> Reward
                </dt>
                <dd>{snapshot.order.creditReward} credits</dd>
              </div>
              <div>
                <dt>
                  <MapPin aria-hidden="true" /> Pickup
                </dt>
                <dd>
                  {snapshot.order.pickupLocationName ||
                    'Historical location name unavailable'}
                </dd>
              </div>
              <div>
                <dt>
                  <Route aria-hidden="true" /> Drop-off
                </dt>
                <dd>
                  {snapshot.order.dropoffLocationName ||
                    'Historical location name unavailable'}
                </dd>
              </div>
              <div>
                <dt>
                  <Clock3 aria-hidden="true" /> Pickup deadline
                </dt>
                <dd>{date(snapshot.order.pickupDeadline)}</dd>
              </div>
            </dl>
          </section>
          <details
            className="evidence-section"
            open={onSnapshot ? undefined : true}
          >
            <summary>
              <Bike aria-hidden="true" /> Errand participants and assignment
              history
            </summary>
            {snapshot.participants.length ? (
              <ul className="evidence-participants">
                {snapshot.participants.map((p, index) => (
                  <li key={`${p.userId}:${p.assignedAt}:${index}`}>
                    <strong>{participant(p.userId)}</strong>
                    {p.relationship === 'HISTORICAL_COURIER' && (
                      <span className="role-chip">
                        Courier assigned during this errand
                      </span>
                    )}
                    {p.relationship === 'HISTORICAL_COURIER' && (
                      <span>
                        {p.assignedAt ? (
                          <>
                            Assigned <EvidenceTime value={p.assignedAt} />
                          </>
                        ) : (
                          'Assignment start unavailable'
                        )}{' '}
                        ·{' '}
                        {p.unassignedAt ? (
                          <>
                            Unassigned <EvidenceTime value={p.unassignedAt} />
                          </>
                        ) : (
                          'Assignment end not recorded in this view'
                        )}
                      </span>
                    )}
                    <details className="evidence-technical">
                      <summary>Account reference</summary>
                      <p>Account ID: {p.userId}</p>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Participant history is unavailable in this view. Do not assume
                there were no participants.
              </p>
            )}
          </details>
          <details className="evidence-section evidence-technical">
            <summary>Evidence details</summary>
            <dl className="evidence-identifiers">
              <div>
                <dt>Snapshot revision</dt>
                <dd>{snapshot.evidenceRevision}</dd>
              </div>
              <div>
                <dt>Case ID</dt>
                <dd>{snapshot.caseId}</dd>
              </div>
              <div>
                <dt>Errand ID</dt>
                <dd>{snapshot.orderId}</dd>
              </div>
              <div>
                <dt>Reported coverage status</dt>
                <dd>{snapshot.coverage.status}</dd>
              </div>
              <div>
                <dt>Pickup location ID</dt>
                <dd>{snapshot.order.pickupLocationId}</dd>
              </div>
              <div>
                <dt>Drop-off location ID</dt>
                <dd>{snapshot.order.dropoffLocationId}</dd>
              </div>
            </dl>
            <h4>
              Coverage checkpoints ({snapshot.coverage.checkpoints.length})
            </h4>
            {snapshot.coverage.checkpoints.length ? (
              <div className="evidence-table-scroll">
                <table>
                  <caption className="visually-hidden">
                    Producer committed sequences and Chat projection progress
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Source / stream</th>
                      <th scope="col">Aggregate</th>
                      <th scope="col">Committed</th>
                      <th scope="col">Projected</th>
                      <th scope="col">Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.coverage.checkpoints.map((cp) => (
                      <tr key={`${cp.source}:${cp.stream}:${cp.aggregateId}`}>
                        <th scope="row">
                          {cp.source}
                          <small>{cp.stream}</small>
                        </th>
                        <td>{cp.aggregateId}</td>
                        <td>{cp.committedSequence}</td>
                        <td>
                          {cp.projectedSequence}
                          {cp.projectedSequence < cp.committedSequence && (
                            <span> · Behind</span>
                          )}
                        </td>
                        <td>{date(cp.checkedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                No source checkpoints are available. History completeness cannot
                be verified.
              </p>
            )}
          </details>
          {(snapshot.coverage.blockingGaps.length > 0 ||
            snapshot.coverage.checkpoints.some(
              (cp) => cp.projectedSequence < cp.committedSequence,
            )) && (
            <section className="evidence-section">
              <h3>
                Missing activity ({snapshot.coverage.blockingGaps.length} known
                gaps)
              </h3>
              {snapshot.coverage.blockingGaps.length ? (
                <ul className="evidence-gaps">
                  {snapshot.coverage.blockingGaps.map((gap, index) => (
                    <li key={index}>
                      <strong>
                        {historyName(gap.source)}:{' '}
                        {gap.reason === 'MISSING_SEQUENCE'
                          ? 'Some activity is missing'
                          : readable(gap.reason)}
                      </strong>
                      <details className="evidence-technical">
                        <summary>Missing activity references</summary>
                        <p>Reason: {gap.reason}</p>
                        <p>
                          {gap.source} / {gap.stream} · Sequences{' '}
                          {gap.fromSequence}–{gap.toSequence}
                        </p>
                        <p>Aggregate ID: {gap.aggregateId}</p>
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No missing activity was reported. Check the evidence status
                  above to verify completeness.
                </p>
              )}
              {snapshot.coverage.checkpoints.some(
                (cp) => cp.projectedSequence < cp.committedSequence,
              ) && (
                <p className="evidence-lag">
                  Some activity has not reached the timeline yet:{' '}
                  {[
                    ...new Set(
                      snapshot.coverage.checkpoints
                        .filter(
                          (cp) => cp.projectedSequence < cp.committedSequence,
                        )
                        .map((cp) => historyName(cp.source)),
                    ),
                  ].join(', ')}
                  . Refresh evidence to check progress.
                </p>
              )}
            </section>
          )}
          <section className="evidence-section">
            <div className="section-heading">
              <h3 className="icon-heading">
                <Clock3 aria-hidden="true" /> Activity timeline
              </h3>
              <span className="role-chip">
                {records.length} {records.length === 1 ? 'event' : 'events'}{' '}
                loaded
              </span>
            </div>
            <div
              className="timeline-filters"
              role="group"
              aria-label="Filter loaded activity"
            >
              {(
                [
                  ['ALL', 'All activity'],
                  ['CHAT', 'Messages'],
                  ['ORDER', 'Errand events'],
                  ['CREDIT', 'Credits'],
                  ['ADMIN', 'Admin actions'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="button-secondary"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="evidence-meta" aria-live="polite">
              Showing{' '}
              {
                records.filter(
                  (r) => filter === 'ALL' || r.data.kind === filter,
                ).length
              }{' '}
              of {records.length} loaded events.
              {snapshot.nextCursor && ' More activity is available below.'}
            </p>
            {records.length ? (
              <ol className="evidence-records">
                {groupActivity(records)
                  .filter(
                    (group) =>
                      filter === 'ALL' || group[0].data.kind === filter,
                  )
                  .map((group) => (
                    <ActivityGroup
                      key={group[0].eventId}
                      records={group}
                      participant={participant}
                      linkParticipants={!!onSnapshot}
                    />
                  ))}
              </ol>
            ) : (
              <p>
                No activity appears on this page. Check the evidence status
                above; an empty page does not prove completeness.
              </p>
            )}
            {records.length > 0 &&
              !records.some(
                (r) => filter === 'ALL' || r.data.kind === filter,
              ) && (
                <p>
                  No matching events in loaded activity. Try another filter or
                  load more evidence.
                </p>
              )}
            {snapshot.nextCursor ? (
              <button
                disabled={loading || restartRequired || !!error}
                type="button"
                onClick={() => void more()}
              >
                Load more evidence
              </button>
            ) : (
              <p>
                All activity in this view is loaded. Check the evidence status
                and limits above before making a decision.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  )
}
