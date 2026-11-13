import type { Order } from '@/api/order/order'
import { useSupplier } from '@/api/supplier/suppliers'
import { formatDateTime } from '../format'
import { SupplierThumbnail } from '../components/SupplierThumbnail'
import { useName } from '@/api/user/member'

// Its own component because the hook needs the supplier id, which is known only once the errand has loaded.
function Pickup({ supplierId }: { supplierId: string }) {
  const supplier = useSupplier(supplierId)
  if (!supplier.data) return <p className="text-muted">Supplier {supplierId}</p>
  const s = supplier.data
  return (
    <div className="flex items-start gap-3">
      <SupplierThumbnail supplier={s} />
      <div className="grid min-w-0 gap-1">
        <p className="wrap-anywhere">{s.name}</p>
        <p className="text-sm text-muted wrap-anywhere">
          {s.type} · {s.zone} · {s.address}
        </p>
      </div>
    </div>
  )
}

type OrderDetailsProps = {
  order: Order
  /** The viewer's role on this errand (user pages). */
  role?: string | null
  /** Show the requester and courier account ids (admin views). */
  showAccounts?: boolean
}



export function OrderDetails({ order, role = null, showAccounts = false }: OrderDetailsProps) {
  const requester = useName(String(order.requester_id))

  return (
    <section className="ds-surface grid grid-cols-1 gap-4 p-5" aria-labelledby="details-title">
      <h2 id="details-title">Details</h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <dt className="ds-label">Pick up from</dt>
          <dd className="mt-1">
            <Pickup supplierId={order.supplier_id} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Deliver to</dt>
          <dd className="mt-1 wrap-anywhere">{order.delivery_location}</dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Needed by</dt>
          <dd className="mt-1">{formatDateTime(order.needed_by_time)}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="ds-label">Items</dt>
          <dd className="mt-1">
            <ul className="m-0 grid list-disc gap-1 pl-5">
              {order.item_lines.map((line, i) => (
                <li key={i} className="wrap-anywhere">
                  {line}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Reward</dt>
          <dd className="mt-1 font-[600]">{order.credit_reward} credits</dd>
        </div>
        {role && (
          <div className="min-w-0">
            <dt className="ds-label">Your role</dt>
            <dd className="mt-1">{role}</dd>
          </div>
        )}
        {showAccounts && (
          <>
            <div className="min-w-0">
              <dt className="ds-label">Requester</dt>
              <dd className="mt-1 wrap-anywhere">{requester.data ?? order.requester_id}</dd>
            </div>
            <div className="min-w-0">
              <dt className="ds-label">Courier</dt>
              <dd className="mt-1 wrap-anywhere">{order.courier_id ?? 'None yet'}</dd>
            </div>
          </>
        )}
        <div className="min-w-0">
          <dt className="ds-label">Posted</dt>
          <dd className="mt-1">{formatDateTime(order.created_at)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Last updated</dt>
          <dd className="mt-1">{formatDateTime(order.updated_at)}</dd>
        </div>
      </dl>
    </section>
  )
}
