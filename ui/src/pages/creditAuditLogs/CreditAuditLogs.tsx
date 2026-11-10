/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-10-27
Scope: Implemented audit-log fetching, automatic refresh, pagination, and empty/error states
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { useEffect, useState } from 'react'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import { useUser } from '../../components/user/UserContext'
import { creditAuditDetails, creditAuditTimestamp, type CreditAuditLog } from './models'
import styles from './CreditAuditLogs.module.css'

type HistoryState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; logs: CreditAuditLog[] }

const PAGE_SIZE = 5
const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const amountFormat = new Intl.NumberFormat()

const CreditAuditLogs = () => {
  const api = useCampusErrandsAPI()
  const { session } = useUser()
  const [history, setHistory] = useState<HistoryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let active = true
    let inFlight = false
    const load = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const logs = await api.credit.auditLogs()
        if (!Array.isArray(logs)) throw new Error('Invalid credit history response')
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
  }, [api.credit, attempt])

  const retry = () => {
    setHistory({ status: 'loading' })
    setAttempt((value) => value + 1)
  }
  const logs = history.status === 'ready' ? history.logs : []
  const pages = Math.ceil(logs.length / PAGE_SIZE)
  const visibleLogs = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.heading}>
          <h1>Credit audit logs</h1>
          <p>Your credit activity, from initial allocation to payments and refunds.</p>
        </header>

        <section className={styles.history} aria-label="Credit history" aria-busy={history.status === 'loading'}>
          {history.status === 'loading' && <p className={styles.empty} role="status">Loading your credit audit logs…</p>}
          {history.status === 'error' && (
            <div className={styles.notice} role="status">
              <strong>Credit balance is temporarily unavailable</strong>
              <p>You can still submit requests and manage orders. Credits will be checked when your request is processed.</p>
              <button className={styles.button} type="button" onClick={retry}>Try again</button>
            </div>
          )}
          {history.status === 'ready' && (logs.length === 0
            ? <p className={styles.empty} role="status">No logs.</p>
            : <>
              <div className={styles.listHeading}>
                <h2>History</h2>
                <span>Newest first</span>
              </div>
              <ol className={styles.list}>
                {visibleLogs.map((log) => {
                  const details = creditAuditDetails(log, session.user_id)
                  const timestamp = creditAuditTimestamp(log.created_at)
                  const adminRepair = log.action === 'ADMIN_CHARGE_RESERVED' || log.action === 'ADMIN_COVER_RESERVED'
                  const before = log.before
                  const after = log.after
                  return (
                    <li className={styles.entry} key={log.log_id}>
                      <div className={styles.entryHeading}>
                        <h3>{details.label}</h3>
                        <strong className={styles.amount}>{amountFormat.format(log.amount)} <span>credits</span></strong>
                      </div>
                      <p>{details.description}</p>
                      <time dateTime={timestamp}>{dateFormat.format(new Date(timestamp))}</time>
                      {log.order_id && <p className={styles.order}>Order <span>{log.order_id}</span></p>}
                      {log.reason && !adminRepair && <p className={styles.reason}>{log.reason}</p>}
                      {adminRepair && (
                        <details className={styles.adminDetails} open>
                          <summary>Admin dispute details</summary>
                          <dl>
                            <div><dt>Administrator ID</dt><dd>{log.actor_id ?? 'Not recorded'}</dd></div>
                            <div><dt>Request ID</dt><dd>{log.request_id ?? 'Not recorded'}</dd></div>
                            <div><dt>Reason</dt><dd>{log.reason ?? 'Not recorded'}</dd></div>
                          </dl>
                          {before && after && (
                            <>
                              <table>
                                <caption>Wallet before and after reservation funding</caption>
                                <thead><tr><th scope="col">Balance</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
                                <tbody>
                                  {(['available_credits', 'reserved_credits'] as const).map((balance) => (
                                    <tr key={balance}>
                                      <th scope="row">{balance === 'available_credits' ? 'Available credits' : 'Reserved credits'}</th>
                                      <td>{typeof before[balance] === 'number' ? amountFormat.format(before[balance]) : 'Not recorded'}</td>
                                      <td>{typeof after[balance] === 'number' ? amountFormat.format(after[balance]) : 'Not recorded'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <p>Funding step only. The release or transfer is logged separately.</p>
                            </>
                          )}
                        </details>
                      )}
                    </li>
                  )
                })}
              </ol>
              {pages > 1 && (
                <nav className={styles.pagination} aria-label="Credit history pages">
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

export default CreditAuditLogs
