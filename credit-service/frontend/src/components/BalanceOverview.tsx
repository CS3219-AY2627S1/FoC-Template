import type { CreditBalance } from '../api/creditApi'

export function BalanceOverview({ balance }: { balance: CreditBalance }) {
  const availablePercent =
    balance.totalBalance === 0
      ? 0
      : Math.round((balance.availableBalance / balance.totalBalance) * 100)

  return (
    <section aria-labelledby="balance-heading" className="balance-panel">
      <div className="balance-copy">
        <p className="eyebrow">Credit balance</p>
        <h2 id="balance-heading">
          <strong>{balance.availableBalance}</strong>
          <span>available</span>
        </h2>
        <p>
          Use credits to request campus errands. Credits are reserved while an
          errand is active, then transferred or returned when it closes.
        </p>
      </div>
      <div
        aria-label={`${balance.availableBalance} of ${balance.totalBalance} credits available`}
        className="balance-ring"
        role="img"
        style={
          {
            '--available': `${availablePercent * 3.6}deg`,
          } as React.CSSProperties
        }
      >
        <span>{balance.totalBalance}</span>
        <small>total</small>
      </div>
      <dl className="balance-breakdown">
        <div>
          <dt>
            <span className="status-dot available" aria-hidden="true" />
            Available
          </dt>
          <dd>{balance.availableBalance}</dd>
        </div>
        <div>
          <dt>
            <span className="status-dot reserved" aria-hidden="true" />
            Reserved
          </dt>
          <dd>{balance.reservedBalance}</dd>
        </div>
      </dl>
    </section>
  )
}
