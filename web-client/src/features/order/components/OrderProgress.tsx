import type { Order, OrderStatus } from '@/api/order/order'
import { formatDateTime } from '../format'

// The happy path, in order. Each one is a status the errand passes through.
const FLOW: { status: OrderStatus; label: string }[] = [
  { status: 'Open', label: 'Posted' },
  { status: 'Accepted', label: 'Accepted by a courier' },
  { status: 'PickedUp', label: 'Items picked up' },
  { status: 'Delivered', label: 'Delivered' },
  { status: 'Completed', label: 'Confirmed and paid' },
]

type StepState = 'done' | 'current' | 'notReached' | 'ended'

type Step = { key: string; label: string; state: StepState; time?: string; note?: string }

/*
 * The order-service keeps only the current status, so earlier stages are worked out from the
 * rules of the lifecycle:
 *  - an errand can only be cancelled while Open or Accepted, and a courier is set once it is
 *    accepted, so a cancelled errand with a courier got as far as Accepted, one without did not;
 *  - an expired errand was never accepted.
 * Times are known only for posting (created_at) and for the latest change (updated_at).
 */
function stepsOf(order: Order): Step[] {
  const { status } = order
  const flowIndex = FLOW.findIndex((stage) => stage.status === status)

  if (status === 'Cancelled' || status === 'Expired') {
    const reached = status === 'Cancelled' && order.courier_id ? 2 : 1
    const endLabel = status === 'Cancelled' ? 'Cancelled' : 'Expired'
    const steps: Step[] = FLOW.map((stage, i) => ({
      key: stage.status,
      label: stage.label,
      state: i < reached ? 'done' : 'notReached',
      time: i === 0 ? order.created_at : undefined,
    }))
    steps.splice(reached, 0, {
      key: status,
      label: endLabel,
      state: 'ended',
      time: order.updated_at,
      note:
        status === 'Cancelled'
          ? 'The errand was cancelled. Reserved credits were released.'
          : 'Nobody accepted it in time. Reserved credits were released.',
    })
    return steps
  }

  return FLOW.map((stage, i): Step => {
    // Pending means the credits are still being reserved, so nothing has been reached yet.
    if (status === 'Pending') return { key: stage.status, label: stage.label, state: 'notReached' }
    const done = i < flowIndex || status === 'Completed'
    const current = i === flowIndex && status !== 'Completed'
    return {
      key: stage.status,
      label: stage.label,
      state: done ? 'done' : current ? 'current' : 'notReached',
      time: i === 0 ? order.created_at : current ? order.updated_at : status === 'Completed' && i === flowIndex ? order.updated_at : undefined,
    }
  })
}

const STATE_TEXT: Record<StepState, string> = {
  done: 'Done',
  current: 'Current step',
  notReached: 'Not reached',
  ended: 'Ended here',
}

const MARKER: Record<StepState, { symbol: string; className: string }> = {
  done: { symbol: '✓', className: 'bg-accent text-on-accent' },
  current: { symbol: '●', className: 'border-2 border-accent bg-backdrop text-accent' },
  notReached: { symbol: '', className: 'border border-border bg-backdrop text-subtle' },
  ended: { symbol: '✕', className: 'bg-neutral-mark text-on-accent' },
}

export function OrderProgress({ order }: { order: Order }) {
  const steps = stepsOf(order)
  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5" aria-labelledby="progress-title">
      <h2 id="progress-title">Progress</h2>
      {order.status === 'Pending' && <p className="text-sm text-muted">Reserving the reward credits…</p>}
      <ol aria-label="Errand progress" className="m-0 list-none p-0">
        {steps.map((step) => (
          <li
            key={step.key}
            className="relative pb-6 pl-10 before:absolute before:top-7 before:left-3.5 before:h-full before:w-px before:bg-border last:pb-0 last:before:hidden"
          >
            <span
              aria-hidden="true"
              className={`absolute top-0 left-0 grid size-7 place-items-center rounded-chip text-sm ${MARKER[step.state].className}`}
            >
              {MARKER[step.state].symbol}
            </span>
            <p className={step.state === 'notReached' ? 'text-muted' : 'font-[600]'}>{step.label}</p>
            <p className="text-sm text-muted">
              {STATE_TEXT[step.state]}
              {step.time && ` · ${formatDateTime(step.time)}`}
            </p>
            {step.note && <p className="mt-1 text-sm">{step.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}
