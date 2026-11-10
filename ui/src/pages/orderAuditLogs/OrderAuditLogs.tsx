/*
AI Assistance Disclosure:
Tool: Gemini, date: 2026-10-29
Scope: Implemented audit-log fetching, automatic refresh, pagination, and empty/error states
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import { useUser } from '../../components/user/UserContext'
import { orderAuditDetails, orderAuditTimestamp, type OrderAuditLog } from './models'
import styles from './OrderAuditLogs.module.css'

type HistoryState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; logs: OrderAuditLog[] }

const PAGE_SIZE = 5
const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

const OrderAuditLogs = () => {
  const { orderId } = useParams<{ orderId: string }>()
  const api = useCampusErrandsAPI()
  const { session } = useUser()
  const [history, setHistory] = useState<HistoryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!orderId) {
      setHistory({ status: 'error' })
      return
    }

    let active = true
    let inFlight = false
    const load = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const logs = await api.order.auditLogs(orderId)
        if (!Array.isArray(logs)) throw new Error('Invalid order history response')
        if (active) {
          setHistory({ status: 'ready', logs })
          setPage((current) => Math.min(current, Math.max(1, Math.ceil(logs.length / PAGE_SIZE))))
        }
      } catch {
        if (active) setHistory({ status: 'error' })
      } finally {
        inFlight = false
      }
    }
    const initialLoad = window.setTimeout(() => void load(), 0)
    const poll = window.setInterval(() => void load(), 5000)
    return () => {
      active = false
      window.clearTimeout(initialLoad)
      window.clearInterval(poll)
    }
  }, [api.order, orderId, attempt])

  const retry = () => {
    setHistory({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  const logs = history.status === 'ready' ? history.logs : []
  const pages = Math.ceil(logs.length / PAGE_SIZE)
  const visibleLogs = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const displayOrderId = orderId ? orderId.split('-')[0] : ''

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.heading}>
          <h1>Timeline for Order {displayOrderId}</h1>
          <p>A complete chronological record of status changes and actions for this order.</p>
        </header>

        <section className={styles.history} aria-label="Order history" aria-busy={history.status === 'loading'}>
          {history.status === 'loading' && <p className={styles.empty} role="status">Loading order history…</p>}
          {history.status === 'error' && (
            <div className={styles.notice} role="status">
              <strong>Order history is temporarily unavailable</strong>
              <p>We couldn't retrieve the audit logs right now, but the order is still active.</p>
              <button className={styles.button} type="button" onClick={retry}>Try again</button>
            </div>
          )}
          {history.status === 'ready' && (logs.length === 0
            ? <p className={styles.empty} role="status">No logs recorded yet.</p>
            : <>
              <div className={styles.listHeading}>
                <h2>Timeline</h2>
                <span>Newest first</span>
              </div>
              <ol className={styles.list}>
                {visibleLogs.map((log) => {
                  const details = orderAuditDetails(log)
                  const timestamp = orderAuditTimestamp(log.created_at)

                  // Determine how to display the actor (System vs User)
                  const isSystem = log.actor_id === null
                  const isCurrentUser = log.actor_id === session?.user_id
                  let actorDisplay = isSystem ? 'System' : (isCurrentUser ? 'You' : 'User')

                  return (
                    <li className={styles.entry} key={log.log_id}>
                      <div className={styles.entryHeading}>
                        <h3>{details.label}</h3>
                        <span className={`${styles.actorBadge} ${isSystem ? styles.system : ''}`}>
                          {actorDisplay}
                        </span>
                      </div>
                      <p>{details.description}</p>
                      <time dateTime={timestamp}>{dateFormat.format(new Date(timestamp))}</time>

                      {log.reason && (
                        <p className={`${styles.reason} ${log.action === 'disputed' ? styles.disputed : ''}`}>
                          <strong>Reason: </strong>{log.reason}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
              {pages > 1 && (
                <nav className={styles.pagination} aria-label="Order history pages">
                  <button className={styles.button} type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                  <span role="status">Page {page} of {pages}</span>
                  <button className={styles.button} type="button" disabled={page === pages} onClick={() => setPage((value) => value + 1)}>Next</button>
                </nav>
              )}
            </>)}
        </section>
      </main>
      <footer className={styles.footer}>Campus Errands · Small favours, better campus days.</footer>
    </div>
  )
}

export default OrderAuditLogs