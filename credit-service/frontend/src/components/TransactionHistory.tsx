import type { CreditTransaction, TransactionPage } from '../api/creditApi'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, History } from 'lucide-react'
import {
  formatDate,
  formatDelta,
  netDelta,
  transactionLabel,
} from '../utils/creditFormatting'

function TransactionRow({ transaction }: { transaction: CreditTransaction }) {
  const change = netDelta(transaction)
  const reservedOnly = change === 0 && transaction.reservedDelta !== 0
  return (
    <li className="transaction-row">
      <span
        aria-hidden="true"
        className={`transaction-icon ${change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral'}`}
      >
        {change > 0 ? <ArrowDownLeft /> : change < 0 ? <ArrowUpRight /> : <ArrowLeftRight />}
      </span>
      <span className="transaction-main">
        <strong>{transactionLabel(transaction.type)}</strong>
        <time dateTime={transaction.createdAt}>
          {formatDate(transaction.createdAt)}
        </time>
      </span>
      <span className="transaction-change">
        <strong
          className={change > 0 ? 'positive' : change < 0 ? 'negative' : ''}
        >
          {reservedOnly ? 'Moved' : formatDelta(change)}
        </strong>
        <small>
          {transaction.availableBalanceAfter} available
          {transaction.reservedBalanceAfter > 0
            ? ` · ${transaction.reservedBalanceAfter} reserved`
            : ''}
        </small>
      </span>
    </li>
  )
}

export function TransactionHistory({
  history,
  onPageChange,
}: {
  history: TransactionPage
  onPageChange: (page: number) => void
}) {
  return (
    <section aria-labelledby="history-heading" className="history-panel">
      <div className="section-heading">
        <div>
          <h2 id="history-heading">Transaction history</h2>
        </div>
        <span className="record-count">
          {history.totalElements}{' '}
          {history.totalElements === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      {history.content.length === 0 ? (
        <div className="empty-history">
          <span aria-hidden="true"><History /></span>
          <h3>No transactions yet</h3>
          <p>
            Your credit activity will appear here once you create or fulfil an
            errand.
          </p>
        </div>
      ) : (
        <ul className="transaction-list">
          {history.content.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      )}
      {history.totalPages > 1 && (
        <nav aria-label="Transaction history pages" className="pagination">
          <button
            disabled={history.page === 0}
            onClick={() => onPageChange(history.page - 1)}
            type="button"
          >
            Previous
          </button>
          <span>
            Page {history.page + 1} of {history.totalPages}
          </span>
          <button
            disabled={history.page + 1 >= history.totalPages}
            onClick={() => onPageChange(history.page + 1)}
            type="button"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  )
}
