import { useNow } from '#/hooks/useNow'
import { useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { isCancel } from 'axios'
import { availableOrderActions, canDeliver } from '../../utils/orderPermissions'
import { useOrderActions } from '../../hooks/useOrderActions'
import { orderErrorMessage } from '../../utils/orderErrors'
import type { Errand, OrderAction } from '../../types/errand.types'
import { DeliverOrder } from '../DeliverOrder/DeliverOrder'
import styles from '../../styles/order.module.scss'
import dialog from './OrderActions.module.scss'

const labels: Record<OrderAction, string> = {
  accept: 'Accept errand',
  pickup: "I've collected it",
  complete: 'Confirm received',
  cancel: 'Cancel request',
}
export const OrderActions = ({
  order,
  userId,
  onError,
}: {
  order: Errand
  userId: string
  onError: (error: Error | null) => void
}) => {
  const { action } = useOrderActions()
  const [confirm, setConfirm] = useState<OrderAction | null>(null)
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const now = useNow(1_000)
  const allowed = availableOrderActions(order, userId, now)
  const submit = async (operation: OrderAction) => {
    if (lock.current) return
    lock.current = true
    setMessage('')
    onError(null)
    try {
      await action.mutateAsync({ id: order.id, action: operation })
      setConfirm(null)
      setMessage('Errand updated.')
    } catch (error) {
      if (isCancel(error)) return
      onError(
        error instanceof Error ? error : new Error('Unable to update errand'),
      )
    } finally {
      lock.current = false
    }
  }
  if (
    !allowed.length &&
    !confirm &&
    !message &&
    !action.error &&
    order.status !== 'PICKED_UP' &&
    order.status !== 'DELIVERED' &&
    order.status !== 'ACCEPTED'
  )
    return null
  return (
    <section className={styles.feedback} aria-label="Order actions">
      {order.status === 'ACCEPTED' && order.requester.id === userId && (
        <p className={styles.muted}>
          {order.courier?.name ?? 'Your Courier'} is collecting your item.
        </p>
      )}
      {order.status === 'PICKED_UP' && order.requester.id === userId && (
        <p className={styles.muted}>
          {order.courier?.name ?? 'Your Courier'} has your item and is on the
          way.
        </p>
      )}
      {canDeliver(order, userId) && (
        <DeliverOrder order={order} onDelivered={setMessage} />
      )}
      {order.status === 'DELIVERED' && (
        <p className={styles.muted}>
          {order.requester.id === userId
            ? 'Check the delivery photo. Confirm only after you receive your item. Credit settlement starts after confirmation.'
            : `Delivered. Waiting for ${order.requester.name ?? 'the Requester'} to confirm receipt.`}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className={styles.actions}>
        {allowed.map((operation) => (
          <Button
            key={operation}
            className={
              operation === 'cancel' ? styles.secondary : styles.button
            }
            disabled={action.isPending}
            onClick={() => {
              action.reset()
              if (operation === 'cancel' || operation === 'complete')
                setConfirm(operation)
              else void submit(operation)
            }}
          >
            {action.isPending ? 'Saving…' : labels[operation]}
          </Button>
        ))}
      </div>
      <Dialog.Root
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !action.isPending) {
            setConfirm(null)
            action.reset()
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={dialog.backdrop} />
          <Dialog.Popup className={dialog.popup}>
            <Dialog.Title>
              {confirm === 'cancel'
                ? 'Cancel this request?'
                : 'Have you received your item?'}
            </Dialog.Title>
            <Dialog.Description>
              {confirm === 'cancel'
                ? `Your ${order.creditReward} reserved credits will be released after cancellation is processed.`
                : `Confirm only after receiving your item. This completes the errand and starts settlement of ${order.creditReward} credits to ${order.courier?.name ?? 'your Courier'}.`}
            </Dialog.Description>
            {action.error && (
              <p role="alert" className={styles.error}>
                {orderErrorMessage(action.error)}
              </p>
            )}
            {confirm && !allowed.includes(confirm) && (
              <p role="alert">
                This action is no longer available. Close this dialog to view
                the latest order.
              </p>
            )}
            <div className={styles.actions}>
              <Dialog.Close
                className={styles.secondary}
                disabled={action.isPending}
              >
                Go back
              </Dialog.Close>
              <Button
                className={styles.button}
                disabled={
                  action.isPending || !confirm || !allowed.includes(confirm)
                }
                onClick={() => {
                  if (confirm) void submit(confirm)
                }}
              >
                {action.isPending
                  ? 'Saving…'
                  : confirm === 'cancel'
                    ? 'Confirm cancellation'
                    : 'Confirm receipt'}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
