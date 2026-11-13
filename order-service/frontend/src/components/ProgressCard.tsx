import type { Order, OrderState } from '../api/orderApi'
import { credits } from '../utils/orderFormatting'

const STEPS: { state: OrderState; label: string }[] = [
  { state: 'OPEN', label: 'Open' },
  { state: 'ACCEPTED', label: 'Accepted' },
  { state: 'PICKED_UP', label: 'Picked up' },
  { state: 'DELIVERED', label: 'Delivered' },
  { state: 'COMPLETED', label: 'Completed' },
]

/** The "Progress" card from the active-order designs. */
export function ProgressCard({
  order,
  rewardLabel,
  children,
}: {
  order: Order
  rewardLabel: string
  children?: React.ReactNode
}) {
  const reached = STEPS.findIndex((step) => step.state === order.state)
  return (
    <aside aria-labelledby="progress-heading" className="card">
      <h2 id="progress-heading">Progress</h2>
      {order.reviewResolved ? (
        <p>Finished after dispute review.</p>
      ) : (
        <>
          {order.reviewCaseId && <p>Progress is paused during review.</p>}
          <ol className="progress">
            {STEPS.map((step, index) => {
              const status =
                index < reached
                  ? 'done'
                  : index === reached
                    ? 'current'
                    : 'todo'
              return (
                <li
                  aria-current={status === 'current' ? 'step' : undefined}
                  className={status}
                  key={step.state}
                >
                  <span className="step">{index + 1}</span>
                  {step.label}
                </li>
              )
            })}
          </ol>
        </>
      )}
      <dl className="facts">
        <dt>{order.reviewCaseId ? 'Recorded reward' : rewardLabel}</dt>
        <dd>{credits(order.creditReward)}</dd>
      </dl>
      {children && <div className="progress-note">{children}</div>}
    </aside>
  )
}
