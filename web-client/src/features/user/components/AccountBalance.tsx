import { useBalance } from '@/api/credit/wallet'
import { QueryView } from '@/components/QueryView'

type AccountBalanceProps = {
  accountId: string
}

// Part of F5.5.1, from the credit-service. An account that never became Active has no credit account,
// so the credit-service's own refusal shows instead.
export function AccountBalance({ accountId }: AccountBalanceProps) {
  const balance = useBalance(accountId)

  return (
    <section aria-labelledby="account-balance" className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2 id="account-balance">Credits</h2>
      <QueryView query={balance} loadingLabel="Loading credits">
        {(b) => (
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-1">
              <p className="ds-label">Available</p>
              <p className="nums-tabular text-3xl font-semibold">{b.available}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="ds-surface ds-surface--sunken grid grid-cols-1 gap-1 p-3">
                <dt className="ds-label">Reserved</dt>
                <dd className="nums-tabular text-lg font-medium">{b.reserved}</dd>
              </div>
              <div className="ds-surface ds-surface--sunken grid grid-cols-1 gap-1 p-3">
                <dt className="ds-label">Total</dt>
                <dd className="nums-tabular text-lg font-medium">{b.total}</dd>
              </div>
            </dl>
          </div>
        )}
      </QueryView>
    </section>
  )
}
