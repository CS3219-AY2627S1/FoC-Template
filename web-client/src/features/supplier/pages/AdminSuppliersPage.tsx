import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSuppliers } from '@/api/supplier/suppliers'
import type { Supplier, SupplierStatus } from '@/api/supplier/types'
import { EmptyState } from '@/components/EmptyState'
import { Notice } from '@/components/Notice'
import { Page } from '@/components/Page'
import { Pagination } from '@/components/Pagination'
import { QueryView } from '@/components/QueryView'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { AvailabilityText } from '../components/AvailabilityText'
import { SupplierStatusButton } from '../components/SupplierStatusButton'

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
]

const statusBadges: Record<SupplierStatus, { label: string; className: string }> = {
  Active: { label: 'Active', className: 'ds-badge ds-badge--success' },
  Inactive: { label: 'Inactive', className: 'ds-badge ds-badge--neutral' },
}

export function AdminSuppliersPage() {
  // Search, status and page live in the URL, so reload, back and a shared link keep them.
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const statusParam = searchParams.get('status')
  // Administrators see deactivated suppliers too, unless they filter them out.
  const status = statusParam === 'Active' || statusParam === 'Inactive' ? statusParam : 'all'
  // The address bar can hold anything. What is not a page number from 1 shows page 1.
  const page = Math.max(1, Math.trunc(Number(searchParams.get('page'))) || 1)
  const suppliers = useSuppliers({ q: q || undefined, status, page })
  const total = suppliers.data?.total

  // The box holds what is typed until the search runs. When back, forward or "Clear filters"
  // change q in the URL, the box follows.
  const [search, setSearch] = useState(q)
  const [shownQ, setShownQ] = useState(q)
  if (shownQ !== q) {
    setShownQ(q)
    setSearch(q)
  }

  // A row can leave the list when its status changes under a status filter. The notice takes the
  // keyboard focus, so it is not lost with the button that had it.
  const [changed, setChanged] = useState<Supplier | null>(null)
  const changedRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (changed) changedRef.current?.focus()
  }, [changed])

  // A new filter always starts again at page 1.
  function setFilter(name: 'q' | 'status', value: string) {
    setChanged(null)
    setSearchParams((params) => {
      if (value && value !== 'all') params.set(name, value)
      else params.delete(name)
      params.delete('page')
      return params
    })
  }

  function handleSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilter('q', search.trim())
  }

  function setPage(next: number) {
    setSearchParams((params) => {
      params.set('page', String(next))
      return params
    })
  }

  const filtered = q !== '' || status !== 'all'

  return (
    <Page
      title="Suppliers"
      subtitle={total === undefined ? undefined : `${total} ${total === 1 ? 'supplier' : 'suppliers'}`}
      actions={
        <Link to="/admin/suppliers/new" className="ds-btn ds-btn--primary">
          <Plus aria-hidden="true" className="size-5 shrink-0" />
          Add supplier
        </Link>
      }
    >
      <form role="search" noValidate onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-4 md:items-end">
        <div className="md:col-span-2">
          {/* No hint below the box: it would push the status and the button out of line with it. */}
          <TextField label="Search name, type, place or address" name="q" type="search" value={search} onChange={setSearch} />
        </div>
        <SelectField
          label="Status"
          name="status"
          value={status}
          onChange={(value) => setFilter('status', value)}
          options={statusOptions}
        />
        <button type="submit" className="ds-btn ds-btn--glass">
          Search
        </button>
      </form>

      {changed && (
        <div ref={changedRef} tabIndex={-1}>
          <Notice
            tone="success"
            role="status"
            title={`${changed.name} is ${changed.status === 'Active' ? 'active again' : 'deactivated'}`}
          >
            {changed.status === 'Active'
              ? 'Students can pick it for new errands again.'
              : 'It stays on record, but new errands cannot use it. Reactivate it at any time.'}
          </Notice>
        </div>
      )}

      <QueryView
        query={suppliers}
        loadingLabel="Loading suppliers"
        isEmpty={(result) => result.items.length === 0}
        empty={
          <EmptyState
            title={filtered ? 'No suppliers match these filters' : total ? `There is no page ${page}` : 'No suppliers yet'}
            action={
              filtered || total ? (
                <button type="button" className="ds-btn ds-btn--glass" onClick={() => setSearchParams({})}>
                  {filtered ? 'Clear filters' : 'Go to page 1'}
                </button>
              ) : (
                <Link to="/admin/suppliers/new" className="ds-btn ds-btn--glass">
                  Add the first supplier
                </Link>
              )
            }
          />
        }
      >
        {(result) => (
          <>
            {/* From md a table; it scrolls inside its own box if the columns need more room. */}
            <div className="ds-surface hidden overflow-x-auto md:block">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Supplier</th>
                    <th scope="col">Type</th>
                    <th scope="col">Zone</th>
                    <th scope="col">Now</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>
                        <Link to={`/admin/suppliers/${supplier.id}`} className="font-medium">
                          {supplier.name}
                        </Link>
                        <p className="text-muted">{supplier.address}</p>
                      </td>
                      <td>{supplier.type}</td>
                      <td>{supplier.zone}</td>
                      <td>
                        <AvailabilityText availability={supplier.availability} />
                      </td>
                      <td>
                        <span className={statusBadges[supplier.status].className}>
                          {statusBadges[supplier.status].label}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          <Link
                            to={`/admin/suppliers/${supplier.id}`}
                            className="ds-btn ds-btn--text"
                            aria-label={`Edit ${supplier.name}`}
                          >
                            Edit
                          </Link>
                          <SupplierStatusButton supplier={supplier} look="text" onChanged={setChanged} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Below md the same suppliers as cards. */}
            <ul className="ds-surface ds-rows md:hidden">
              {result.items.map((supplier) => (
                <li key={supplier.id} className="grid grid-cols-1 gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/admin/suppliers/${supplier.id}`} className="min-w-0 font-medium wrap-anywhere">
                      {supplier.name}
                    </Link>
                    <span className={statusBadges[supplier.status].className}>
                      {statusBadges[supplier.status].label}
                    </span>
                  </div>
                  <p className="text-sm text-muted wrap-anywhere">
                    {supplier.type} · {supplier.zone} · {supplier.address}
                  </p>
                  <p className="text-sm">
                    <AvailabilityText availability={supplier.availability} />
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/admin/suppliers/${supplier.id}`}
                      className="ds-btn ds-btn--glass"
                      aria-label={`Edit ${supplier.name}`}
                    >
                      Edit
                    </Link>
                    <SupplierStatusButton supplier={supplier} look="button" onChanged={setChanged} />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPageChange={setPage} />
          </>
        )}
      </QueryView>
    </Page>
  )
}
