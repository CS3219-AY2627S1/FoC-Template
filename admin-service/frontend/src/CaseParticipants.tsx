import { useRef, useState } from 'react'
import {
  Bike,
  Coins,
  FileText,
  MessageSquare,
  ShieldBan,
  UserRound,
  X,
} from 'lucide-react'
import { CaseConversations } from './CaseConversations'
import { CreditActions } from './CreditActions'
import { type Timeline } from './EvidencePanel'
import { participantLabels, type ParticipantSelection } from './casePeople'
import { type Detail, type Summary } from './cases'
import { formatSingaporeTime } from './time'

type Tool = 'chat' | 'credit' | 'ban'

export function CaseParticipants({
  detail,
  summary,
  actorId,
  evidence,
  names = {},
  closing = false,
}: {
  detail: Detail
  summary: Summary
  actorId: string
  evidence: Timeline | null
  names?: Record<string, string>
  closing?: boolean
}) {
  const [selection, setSelection] = useState<ParticipantSelection>()
  const [tool, setTool] = useState<Tool>()
  const opener = useRef<HTMLButtonElement | null>(null)
  const [pendingCredit, setPendingCredit] = useState<string | null>(null)
  const [pendingBan, setPendingBan] = useState<string | null>(null)
  const [creditTarget, setCreditTarget] = useState('')
  const [banTarget, setBanTarget] = useState('')
  const [chatTarget, setChatTarget] = useState('')
  const selectedId =
    tool === 'credit' ? creditTarget : tool === 'ban' ? banTarget : chatTarget
  const reporters = detail.statements.map((s) => s.reporterId)
  const ids = [
    ...new Set([
      ...(evidence
        ? [
            evidence.order.requesterId,
            ...evidence.participants.map((p) => p.userId),
            ...(evidence.order.courierId ? [evidence.order.courierId] : []),
          ]
        : []),
      ...reporters,
    ]),
  ]
  const historyLabel = participantLabels(evidence?.participants || [], names)
  const label = (id: string) => {
    if (evidence?.order.requesterId === id)
      return names[id] ? `Requester [${names[id]}]` : 'Requester'
    if (evidence?.participants.some((p) => p.userId === id))
      return historyLabel(id)
    if (evidence?.order.courierId === id)
      return names[id] ? `Courier [${names[id]}]` : 'Courier'
    const reporter = reporters.indexOf(id)
    return reporter >= 0
      ? `Reporting participant ${reporter + 1}${names[id] ? ` [${names[id]}]` : ''}`
      : 'Account awaiting confirmation'
  }
  const labels = Object.fromEntries(ids.map((id) => [id, label(id)]))
  const eligibleIds = evidence ? ids : reporters
  const caseClosing = closing || !!detail.closure
  const assigned =
    summary.state === 'UNDER_REVIEW' &&
    summary.reviewerId === actorId &&
    !caseClosing
  function open(userId: string, next: Tool, trigger: HTMLButtonElement) {
    opener.current = trigger
    setSelection((previous) => ({
      userId,
      request: (previous?.request || 0) + 1,
    }))
    setTool(next)
    // Wait for the chosen panel to become visible before moving keyboard focus.
    requestAnimationFrame(() =>
      document.getElementById('participant-tools-title')?.focus(),
    )
  }
  return (
    <section
      className="case-panel participant-review"
      aria-labelledby="participants-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">People involved</p>
          <h2 id="participants-title">Reports and participant actions</h2>
        </div>
      </div>
      {(pendingCredit || pendingBan) && (
        <div className="evidence-notice evidence-warning" role="status">
          <h3>Some requests still need confirmation</h3>
          <p>
            Resume the original request to check its outcome before submitting
            another.
          </p>
          {pendingCredit && (
            <button
              className="button-secondary"
              onClick={(event) =>
                open(pendingCredit, 'credit', event.currentTarget)
              }
            >
              Resume credit correction for {label(pendingCredit)}
            </button>
          )}
          {pendingBan && (
            <button
              className="button-secondary"
              onClick={(event) => open(pendingBan, 'ban', event.currentTarget)}
            >
              Resume ban request for {label(pendingBan)}
            </button>
          )}
        </div>
      )}
      {!evidence && (
        <p className="evidence-meta" role="status">
          Requester and courier roles will appear when errand evidence is
          available. Account references identify each reporter below.
        </p>
      )}
      <div className="case-people-grid">
        {ids.map((id) => {
          const statement = detail.statements.find((s) => s.reporterId === id)
          const courier =
            evidence?.order.courierId === id ||
            evidence?.participants.some(
              (p) => p.userId === id && p.relationship === 'HISTORICAL_COURIER',
            )
          const Icon = courier ? Bike : UserRound
          return (
            <article
              key={id}
              id={`person-${id}`}
              className={`case-person${selectedId === id && tool ? ' case-person-selected' : ''}`}
              aria-labelledby={`person-title-${id}`}
            >
              <header className="case-person-heading">
                <span className="case-symbol">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h3 id={`person-title-${id}`}>{label(id)}</h3>
                </div>
                {statement && (
                  <span className="role-chip reporter-badge">Reporter</span>
                )}
              </header>
              <p className="person-reference">
                <span>Account reference</span>
                <code>{id}</code>
              </p>
              <div className="person-statement">
                <h4>
                  <FileText aria-hidden="true" /> Reported issue
                </h4>
                {statement ? (
                  <>
                    <p className="statement-text">{statement.description}</p>
                    <time
                      className="evidence-meta"
                      dateTime={statement.submittedAt}
                    >
                      {formatSingaporeTime(statement.submittedAt)}
                    </time>
                  </>
                ) : (
                  <p className="evidence-meta">
                    This person has not provided a statement for this case.
                  </p>
                )}
              </div>
              <div
                className="person-actions"
                aria-label={`Actions for ${label(id)}`}
              >
                <button
                  className="button-secondary"
                  disabled={!eligibleIds.includes(id)}
                  aria-controls="participant-chat"
                  onClick={(event) => open(id, 'chat', event.currentTarget)}
                >
                  <MessageSquare aria-hidden="true" /> Private chat
                </button>
                <button
                  className="button-secondary"
                  disabled={!eligibleIds.includes(id)}
                  aria-controls="participant-credit"
                  onClick={(event) => open(id, 'credit', event.currentTarget)}
                >
                  <Coins aria-hidden="true" />{' '}
                  {assigned ? 'Adjust credits' : 'Credit history'}
                </button>
                <button
                  className="button-secondary person-ban"
                  disabled={!eligibleIds.includes(id)}
                  aria-controls="participant-ban"
                  onClick={(event) => open(id, 'ban', event.currentTarget)}
                >
                  <ShieldBan aria-hidden="true" />{' '}
                  {assigned ? 'Ban account' : 'Ban history'}
                </button>
              </div>
            </article>
          )
        })}
        {evidence && !ids.some((id) => id !== evidence.order.requesterId) && (
          <article className="case-person case-person-empty">
            <span className="case-symbol">
              <Bike aria-hidden="true" />
            </span>
            <h3>Courier</h3>
            <p>No courier is identified in the available errand history.</p>
          </article>
        )}
        <div
          className="participant-tools-area"
          hidden={!tool}
          style={{
            gridColumn:
              (Math.max(0, ids.indexOf(selectedId || selection?.userId || '')) %
                2) +
              1,
          }}
        >
          {tool && selection && (
            <div className="participant-tools-heading">
              <h3 id="participant-tools-title" tabIndex={-1}>
                {tool === 'chat'
                  ? 'Private chat'
                  : tool === 'credit'
                    ? 'Credit corrections'
                    : 'Account ban requests'}{' '}
              </h3>
              <button
                className="button-secondary"
                aria-label="Close participant tools"
                onClick={() => {
                  setTool(undefined)
                  opener.current?.focus()
                }}
              >
                <X aria-hidden="true" /> Close
              </button>
            </div>
          )}
          <div id="participant-chat" hidden={tool !== 'chat'}>
            <CaseConversations
              summary={summary}
              actorId={actorId}
              participantIds={eligibleIds}
              closing={caseClosing}
              selection={tool === 'chat' ? selection : undefined}
              participantLabels={labels}
              onParticipantChange={setChatTarget}
            />
          </div>
          <div id="participant-credit" hidden={tool !== 'credit'}>
            <CreditActions
              summary={summary}
              actorId={actorId}
              participantIds={eligibleIds}
              initialActions={detail.actions}
              closing={caseClosing}
              selection={tool === 'credit' ? selection : undefined}
              participantLabels={labels}
              onPendingTargetChange={setPendingCredit}
              onParticipantChange={setCreditTarget}
            />
          </div>
          <div id="participant-ban" hidden={tool !== 'ban'}>
            <CreditActions
              kind="BAN"
              summary={summary}
              actorId={actorId}
              participantIds={eligibleIds}
              initialActions={detail.actions}
              closing={caseClosing}
              selection={tool === 'ban' ? selection : undefined}
              participantLabels={labels}
              onPendingTargetChange={setPendingBan}
              onParticipantChange={setBanTarget}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
