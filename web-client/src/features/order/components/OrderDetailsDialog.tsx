import { useEffect, useRef } from 'react'
import type { Order } from '@/api/order/order'
import { OrderDetails } from '../components/OrderDetails'
import { OrderProgress } from '../components/OrderProgress'

type OrderDetailsDialogProps = {
  order: Order
  showAccounts?: boolean
  onClose: () => void
}

// Mount it only while an order is selected; it opens itself on mount and calls onClose when it
// closes (Close button, Escape, or a click on the backdrop).
export function OrderDetailsDialog({ order, showAccounts = false, onClose }: OrderDetailsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby="order-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close()
      }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none bg-backdrop p-0 text-ink backdrop:bg-[rgb(0_0_0/0.4)] sm:m-auto sm:h-auto sm:max-h-[85dvh] sm:w-full sm:max-w-2xl sm:rounded-panel"
    >
      <div className="flex h-dvh flex-col sm:h-auto sm:max-h-[85dvh]">
        <header className="flex items-center justify-between gap-3 p-4">
          <h2 id="order-dialog-title">Errand #{order.id}</h2>
          <button type="button" className="ds-btn" onClick={() => ref.current?.close()}>
            Close
          </button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto px-4 pb-4">
          <OrderDetails order={order} showAccounts={showAccounts} />
          <OrderProgress order={order} />
        </div>
      </div>
    </dialog>
  )
}
