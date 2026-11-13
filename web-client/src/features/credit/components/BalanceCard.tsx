import { useBalance } from '@/api/credit/wallet'
import { useCurrentUser } from '@/api/user/session'
import { QueryView } from '@/components/QueryView'

// F4.1.4: available large, reserved and total below. Self-contained so both the app
// sidebar and the wallet page can drop it in. Only used below RequireSession.
export function BalanceCard() {
  const user = useCurrentUser()
  const balance = useBalance(user.id)

  return (
    <QueryView query={balance} loadingLabel="Loading balance">
      {(b) => (
        <div className="ds-surface grid grid-cols-1 gap-4 p-6">
          <div className="grid gap-1">
            <p className="ds-label">Available</p>
            <p className="nums-tabular text-4xl font-semibold">{b.available}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <div className="ds-surface ds-surface--sunken grid gap-1 p-3">
              <dt className="ds-label">Reserved</dt>
              <dd className="nums-tabular text-lg font-medium">{b.reserved}</dd>
            </div>
            <div className="ds-surface ds-surface--sunken grid gap-1 p-3">
              <dt className="ds-label">Total</dt>
              <dd className="nums-tabular text-lg font-medium">{b.total}</dd>
            </div>
          </dl>
        </div>
      )}
    </QueryView>
  )
}
