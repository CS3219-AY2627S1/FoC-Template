import { Page } from '@/components/Page'
import { useState, useEffect } from 'react'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import type { SubmitEvent } from 'react'
import { QueryView } from '@/components/QueryView'
import type { SelectOption } from '@/components/SelectField'
import { Pagination } from '@/components/Pagination'
import { useAllOrders } from '@/api/order/order'
import { EmptyState } from '@/components/EmptyState'
import { useName } from '@/api/user/member'
import type { Order } from '@/api/order/order'
import { OrderDetailsDialog } from '../components/OrderDetailsDialog'

export function AdminOrdersPage() {
  const [page, setPage] = useState(1)
  // query value
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  // selected value
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    console.log('Page state changed:', page)
}, [page])

 const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'All'},
  { value: 'Pending', label: 'Pending' },
  { value: 'Open', label: 'Open' },
  { value: 'Accepted', label: 'Accepted' },
  { value: 'PickedUp', label: 'Picked Up' },
  { value: 'Delivered', label: 'Delivered' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Rejected', label: 'Rejected' },
]

  const orders = useAllOrders(page, 10, q , status)
  const total = orders.data?.total
  const selected = orders.data?.orders.find((o) => o.id === selectedId)

  function handleSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setQ(search.trim())
    setStatus(selectedStatus)
    setPage(1)
  }

  function clearFilters() {
    setSearch('')
    setQ('')
    setSelectedStatus('')
    setStatus('')
    setPage(1)
  }

  const searched = q !== '' || status !== ''
//   const filtered = searched

  return (
    <Page title="Orders" subtitle="View all orders">
        <div>
            <form role="search" onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-4 md:items-end py-3">
                <div className="md:col-span-2">
                    <TextField label="Search name of location" name="q" type="search" value={search} onChange={setSearch} />
                </div>
                <SelectField
                    label="Status"
                    name="status"
                    value={selectedStatus}
                    onChange={(value) => setSelectedStatus(value)}
                    options={STATUS_OPTIONS}
                />
                <button type="submit" className="ds-btn ds-btn--glass">
                    Search
                </button>
            </form>
        </div>
      <div>
        <QueryView
                query={orders}
                loadingLabel="Orders are loading"
                isEmpty={(result) => result.orders.length === 0}
                empty={
                    <EmptyState
                        title={
                            searched
                                ? 'No orders match these filters'
                                : total
                                    ? `There is no page ${page}`
                                    : 'No orders yet'
                        }
                        action={
                            searched || total ? (
                                <button
                                    type="button"
                                    className="ds-btn ds-btn--glass"
                                    onClick={clearFilters}
                                >
                                    {searched ? 'Clear filters' : 'Go to page 1'}
                                </button>
                            ) : (
                                <p>No existing orders</p>
                            )
                        }
                    />
                }
            >
                {(result) => (
                    <>
                        <div className="overflow-x-auto ds-surface p-3">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-border text-muted">
                                        <th className="p-3">Order ID</th>
                                        <th className="p-3">Requester</th>
                                        <th className="p-3">Delivery location</th>
                                        <th className="p-3">Items</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Created</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {result.orders.map((order) => (
                                        <OrderRow key={order.id} order={order} onView={setSelectedId}/>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <Pagination
                            page={result.page}
                            pageSize={result.pageSize}
                            total={result.total}
                            onPageChange={(nextPage) => {
                                console.log('Requested page:', nextPage)
                                setPage(nextPage)}}
                        />
                    </>
                )}
            </QueryView>
      </div>
      {selected && (
        <OrderDetailsDialog order={selected} showAccounts onClose={() => setSelectedId(null)} />
      )}
    </Page>
  )
}


function OrderRow({ order, onView }: { order: Order; onView: (id: number) => void }) {
    const requester = useName(String(order.requester_id))

    return (
        <tr className="border-b border-border last:border-0">
            <td className="p-3 font-medium">
                <button type="button" className="font-[600] underline" onClick={() => onView(order.id)}>
                    #{order.id}
                </button>
            </td>
            <td className="p-3">
                {requester.data ?? order.requester_id}
            </td>
            <td className="p-3">{order.delivery_location}</td>
            <td className="p-3">{order.item_lines.join(', ')}</td>
            <td className="p-3">{order.status}</td>
            <td className="p-3 whitespace-nowrap">
                {new Date(order.created_at).toLocaleString()}
            </td>
        </tr>
    )
}