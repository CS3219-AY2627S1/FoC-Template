import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { LockKeyhole, ShieldAlert, WifiOff } from 'lucide-react'
import {
  CreditApiError,
  ensureCreditAccount,
  getTransactions,
} from './api/creditApi'
import { readSession, sessionChangedEvent } from './auth/session'
import { BalanceOverview } from './components/BalanceOverview'
import { CreditShell } from './components/CreditShell'
import { TransactionHistory } from './components/TransactionHistory'
import { navigateTo, signInPath } from './navigation'

function LoadingState() {
  return (
    <div
      aria-label="Loading your credits"
      className="dashboard-loading"
      role="status"
    >
      <div className="skeleton skeleton-balance" />
      <div className="skeleton skeleton-history" />
      <span className="visually-hidden">Loading your credits</span>
    </div>
  )
}

function MessageState({
  eyebrow,
  title,
  children,
  action,
  icon,
}: {
  eyebrow: string
  title: string
  children: string
  action?: { label: string; onClick: () => void }
  icon: ReactNode
}) {
  return (
    <section className="message-card">
      <span aria-hidden="true" className="message-illustration">
        {icon}
      </span>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{children}</p>
      {action && (
        <button onClick={action.onClick} type="button">
          {action.label}
        </button>
      )}
    </section>
  )
}

export function App() {
  const [session, setSession] = useState(readSession)
  const [page, setPage] = useState(0)
  useEffect(() => {
    const refreshSession = () => setSession(readSession())
    window.addEventListener(sessionChangedEvent, refreshSession)
    return () => window.removeEventListener(sessionChangedEvent, refreshSession)
  }, [])
  const balance = useQuery({
    queryKey: ['credit-balance'],
    queryFn: ensureCreditAccount,
    enabled: session !== null,
  })
  const history = useQuery({
    queryKey: ['credit-transactions', page],
    queryFn: () => getTransactions(page),
    enabled: session !== null && balance.isSuccess,
    placeholderData: (previous) => previous,
  })

  if (!session) {
    return (
      <CreditShell>
        <MessageState
          action={{
            label: 'Sign in to FoC',
            onClick: () => navigateTo(signInPath()),
          }}
          eyebrow="Please sign in"
          icon={<LockKeyhole />}
          title="Sign in to view your credits"
        >
          Sign in to see your balance and history.
        </MessageState>
      </CreditShell>
    )
  }

  const error = balance.error ?? history.error
  if (error instanceof CreditApiError && error.status === 401) {
    return (
      <CreditShell>
        <MessageState
          action={{
            label: 'Sign in again',
            onClick: () => navigateTo(signInPath()),
          }}
          eyebrow="Signed out"
          icon={<ShieldAlert />}
          title="Please sign in again"
        >
          You’ve been signed out. Sign in again to see your credits.
        </MessageState>
      </CreditShell>
    )
  }

  if (error) {
    return (
      <CreditShell>
        <MessageState
          action={{
            label: 'Try again',
            onClick: () => {
              void balance.refetch()
              void history.refetch()
            },
          }}
          eyebrow="Something went wrong"
          icon={<WifiOff />}
          title="We couldn’t load your credits"
        >
          Your credits are safe. Please try again.
        </MessageState>
      </CreditShell>
    )
  }

  return (
    <CreditShell>
      <div className="page-intro">
        <div>
          <p className="eyebrow">My wallet</p>
          <h1>Your credits</h1>
        </div>
        <span className="role-chip">{session.role.toLowerCase()}</span>
      </div>
      {balance.isPending ||
      history.isPending ||
      !balance.data ||
      !history.data ? (
        <LoadingState />
      ) : (
        <div className="dashboard-grid">
          <BalanceOverview balance={balance.data} />
          <TransactionHistory history={history.data} onPageChange={setPage} />
        </div>
      )}
    </CreditShell>
  )
}
