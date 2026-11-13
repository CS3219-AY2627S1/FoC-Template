import { useState } from 'react'
import { describeOrderError, useAcceptOrder, useUpdateOrderStatus } from '@/api/order/order'
import type { Order, OrderStatus } from '@/api/order/order'
import { Notice } from '@/components/Notice'
import { ACCEPT_LABEL, STATUS_ACTIONS } from './statusActions'

type ErrandActionsProps = {
  order: Order
  // The account looking at the errand, to offer Accept to everyone but its requester.
  me: string | undefined
  // From the order-service: the status changes this account may make now.
  allowed: OrderStatus[]
}

type Outcome = { kind: 'ok' | 'error'; text: string }

// The next steps of an errand on its own page, the same ones its card offers on the Errands page.
// Renders nothing when this account has nothing to do.
export function ErrandActions({ order, me, allowed }: ErrandActionsProps) {
  const accept = useAcceptOrder()
  const updateStatus = useUpdateOrderStatus()
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const pending = accept.isPending || updateStatus.isPending

  const canAccept = order.status === 'Open' && me !== undefined && order.requester_id !== me
  const steps = allowed.filter((status) => STATUS_ACTIONS[status])
  if (!canAccept && steps.length === 0 && !outcome) return null

  async function run(action: () => Promise<unknown>, success: string, failure: string) {
    setOutcome(null)
    try {
      await action()
      setOutcome({ kind: 'ok', text: success })
    } catch (err) {
      setOutcome({ kind: 'error', text: describeOrderError(err, failure) })
    }
  }

  function change(status: OrderStatus) {
    const action = STATUS_ACTIONS[status]
    if (!action || pending) return
    if (action.confirm && !window.confirm(action.confirm(order))) return
    void run(() => updateStatus.mutateAsync({ id: order.id, status }), action.success, 'Could not update this errand.')
  }

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border pt-4">
      {outcome && (
        <Notice
          tone={outcome.kind === 'ok' ? 'success' : 'danger'}
          role={outcome.kind === 'ok' ? 'status' : 'alert'}
          title={outcome.text}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {canAccept && (
          <button
            type="button"
            className="ds-btn ds-btn--primary"
            aria-disabled={pending}
            onClick={() =>
              !pending &&
              void run(() => accept.mutateAsync(order.id), 'Accepted. You are now the courier of this errand.', 'Could not accept this errand.')
            }
          >
            {ACCEPT_LABEL}
          </button>
        )}
        {steps.map((status) => (
          <button
            key={status}
            type="button"
            // Cancelling is the one step that undoes the errand, so it is not styled as the main action.
            className={status === 'Cancelled' ? 'ds-btn ds-btn--glass' : 'ds-btn ds-btn--primary'}
            aria-disabled={pending}
            onClick={() => change(status)}
          >
            {STATUS_ACTIONS[status]!.label(order)}
          </button>
        ))}
      </div>
    </div>
  )
}
