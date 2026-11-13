import type { StateChange } from '@/api/user/types'
import { formatDateTime } from '@/lib/format'
import { AccountStateBadge } from './AccountStateBadge'

type StateHistoryProps = {
  changes: StateChange[]
}

// F1.6.2: who suspended or reinstated the account, when and why. The user-service sends the newest first.
export function StateHistory({ changes }: StateHistoryProps) {
  return (
    <section aria-labelledby="state-history" className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2 id="state-history">State history</h2>
      {changes.length === 0 ? (
        <p className="text-muted">Never suspended.</p>
      ) : (
        <ol className="ds-rows grid grid-cols-1">
          {changes.map((change) => (
            <li key={change.id} className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <AccountStateBadge state={change.to} />
                <p className="min-w-0 text-sm text-muted wrap-anywhere">
                  by {change.actor ? change.actor.fullName : 'a deleted account'} · {formatDateTime(change.at)}
                </p>
              </div>
              <p className="wrap-anywhere">{change.reason}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
