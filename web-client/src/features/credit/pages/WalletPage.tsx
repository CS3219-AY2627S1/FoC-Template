import { Link } from 'react-router'
import type { CreditTransactionType } from '@/api/credit/wallet'
import { useTransactions } from '@/api/credit/wallet'
import { useCurrentUser } from '@/api/user/session'
import { EmptyState } from '@/components/EmptyState'
import { Page } from '@/components/Page'
import { QueryView } from '@/components/QueryView'
import { formatDateTime } from '@/lib/format'
import { BalanceCard } from '../components/BalanceCard'

const typeBadges: Record<CreditTransactionType, { label: string; className: string }> = {
  allocation: { label: 'Allocation', className: 'ds-badge ds-badge--success' },
  reservation: { label: 'Reserved', className: 'ds-badge ds-badge--info' },
  transfer: { label: 'Transfer', className: 'ds-badge ds-badge--neutral' },
  release: { label: 'Released', className: 'ds-badge ds-badge--neutral' },
}

export function WalletPage() {
  // Safe below RequireSession: the app shell only renders for a logged-in account.
  const user = useCurrentUser()
  const transactions = useTransactions(user.id)

  return (
    <Page title="Wallet" subtitle="Your credit balance and history">
      <div className="grid grid-cols-1 gap-6">
        <BalanceCard />

        <section className="grid grid-cols-1 gap-3">
          <h2 className="ds-label">Transactions</h2>
          <QueryView
            query={transactions}
            loadingLabel="Loading transactions"
            isEmpty={(items) => items.length === 0}
            empty={
              <EmptyState
                title="No transactions yet"
                description="Your credit activity shows up here once you post or complete errands."
                action={
                  <Link to="/errands/new" className="ds-btn ds-btn--glass">
                    Post an errand
                  </Link>
                }
              />
            }
          >
            {(items) => (
              <ul className="ds-surface ds-rows">
                {[...items]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((tx) => {
                    const badge = typeBadges[tx.type]
                    return (
                      <li key={tx._id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                        <div className="grid gap-1">
                          <span className={badge.className}>{badge.label}</span>
                          {tx.errandRef && (
                            <span className="font-mono text-xs text-subtle wrap-anywhere">{tx.errandRef}</span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="nums-tabular text-lg font-medium">{tx.amount}</p>
                          <p className="text-xs text-muted">{formatDateTime(tx.createdAt)}</p>
                        </div>
                      </li>
                    )
                  })}
              </ul>
            )}
          </QueryView>
        </section>
      </div>
    </Page>
  )
}
