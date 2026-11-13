import { useState } from 'react'
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  SupplierMutationError,
  type SupplierStatus,
  useAdminSupplierListQuery,
  useAdminSupplierMetadataQuery,
  useChangeSupplierStatusMutation,
  useDeleteSupplierMutation,
} from '../api/adminSupplierApi'
import type { Supplier } from '../api/supplierQueries'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { Button, SelectField } from '../components/DirectoryControls'
import { DebouncedSearchField } from '../components/DebouncedSearchField'
import {
  StatePanel,
  SupplierCardSkeletons,
} from '../components/DirectoryStates'
import { Pagination } from '../components/Pagination'
import styles from './AdminSupplierListPage.module.css'

const PAGE_SIZE = 20
const DEFAULT_SORT = 'name,asc'

const sortOptions = [
  ['name,asc', 'Name (A–Z)'],
  ['name,desc', 'Name (Z–A)'],
  ['type,asc', 'Category (A–Z)'],
  ['building,asc', 'Building (A–Z)'],
  ['status,asc', 'Status (active first)'],
  ['status,desc', 'Status (inactive first)'],
  ['updatedAt,desc', 'Recently updated'],
  ['updatedAt,asc', 'Oldest updated'],
] as const

const allowedSorts = new Set<string>(sortOptions.map(([value]) => value))

function safePage(value: string | null) {
  return value && /^\d+$/.test(value) ? Number(value) : 0
}

function safeStatus(value: string | null): SupplierStatus | undefined {
  const normalized = value?.toUpperCase()
  return normalized === 'ACTIVE' || normalized === 'INACTIVE'
    ? normalized
    : undefined
}

function displayDate(value: string | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

type PendingAction =
  | { kind: 'status'; supplier: Supplier; nextStatus: SupplierStatus }
  | { kind: 'delete'; supplier: Supplier }

interface AdminRouteState {
  notice?: string
}

export function AdminSupplierListPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [pendingAction, setPendingAction] = useState<PendingAction>()
  const [notice, setNotice] = useState(
    (location.state as AdminRouteState | null)?.notice ?? '',
  )
  const [actionError, setActionError] = useState('')

  const search = searchParams.get('search') ?? ''
  const type = searchParams.get('type') ?? ''
  const building = searchParams.get('building') ?? ''
  const status = safeStatus(searchParams.get('status'))
  const page = safePage(searchParams.get('page'))
  const requestedSort = searchParams.get('sort') ?? DEFAULT_SORT
  const sort = allowedSorts.has(requestedSort) ? requestedSort : DEFAULT_SORT

  const suppliers = useAdminSupplierListQuery({
    search: search || undefined,
    type: type || undefined,
    building: building || undefined,
    status,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const metadata = useAdminSupplierMetadataQuery()
  const statusMutation = useChangeSupplierStatusMutation()
  const deleteMutation = useDeleteSupplierMutation()
  const items = suppliers.data?.items ?? []
  const totalItems = suppliers.data?.totalItems ?? 0

  const updateParameter = (name: string, value: string, resetPage = true) => {
    const next = new URLSearchParams(searchParams)
    if (value && !(name === 'sort' && value === DEFAULT_SORT)) {
      next.set(name, value)
    } else {
      next.delete(name)
    }
    if (resetPage) next.delete('page')
    setSearchParams(next)
  }

  const closeDialog = () => {
    if (!statusMutation.isPending && !deleteMutation.isPending) {
      setPendingAction(undefined)
    }
  }

  const beginAction = (action: PendingAction) => {
    setNotice('')
    setActionError('')
    statusMutation.reset()
    deleteMutation.reset()
    setPendingAction(action)
  }

  const confirmAction = async () => {
    if (!pendingAction) return
    try {
      if (pendingAction.kind === 'status') {
        await statusMutation.mutateAsync({
          supplier: pendingAction.supplier,
          status: pendingAction.nextStatus,
        })
        setNotice(
          `${pendingAction.supplier.name} is now ${pendingAction.nextStatus.toLowerCase()}.`,
        )
      } else {
        await deleteMutation.mutateAsync(pendingAction.supplier)
        setNotice(`${pendingAction.supplier.name} was permanently deleted.`)
        if (page > 0 && items.length === 1) {
          updateParameter('page', String(page - 1), false)
        }
      }
      setPendingAction(undefined)
    } catch (error) {
      setPendingAction(undefined)
      setActionError(
        error instanceof SupplierMutationError && error.status === 409
          ? 'Someone else just changed this location. Reload to see the latest.'
          : error instanceof Error
            ? error.message
            : 'That didn’t work. Please try again.',
      )
    }
  }

  const clearFilters = () => setSearchParams(new URLSearchParams())
  const hasFilters = Boolean(
    search || type || building || status || sort !== DEFAULT_SORT,
  )

  return (
    <section aria-labelledby="admin-heading" className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Supplier administration</p>
          <h1 id="admin-heading">Campus locations</h1>
          <p>Add, update or hide campus locations.</p>
        </div>
        <Link className={styles.addLink} to="/admin/suppliers/new">
          <Plus aria-hidden="true" />
          Add supplier
        </Link>
      </header>

      {notice && (
        <div aria-live="polite" className={styles.successNotice} role="status">
          {notice}
        </div>
      )}
      {actionError && (
        <StatePanel
          actionLabel="Reload"
          message={actionError}
          onAction={() => {
            setActionError('')
            void suppliers.refetch()
          }}
          title="That didn’t work"
          tone="error"
        />
      )}

      <div aria-label="Filter supplier records" className={styles.filters}>
        <div className={styles.searchField}>
          <DebouncedSearchField
            id="admin-supplier-search"
            key={search}
            label="Search suppliers"
            onChange={(value) => updateParameter('search', value)}
            placeholder="Search name, building, or directions"
            value={search}
          />
        </div>
        <SelectField
          id="admin-supplier-type"
          label="Category"
          onChange={(event) => updateParameter('type', event.target.value)}
          value={type}
        >
          <option value="">All categories</option>
          {(metadata.data?.types ?? []).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </SelectField>
        <SelectField
          id="admin-supplier-building"
          label="Building"
          onChange={(event) => updateParameter('building', event.target.value)}
          value={building}
        >
          <option value="">All buildings</option>
          {(metadata.data?.buildings ?? []).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </SelectField>
        <SelectField
          id="admin-supplier-status"
          label="Status"
          onChange={(event) => updateParameter('status', event.target.value)}
          value={status ?? ''}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </SelectField>
        <SelectField
          id="admin-supplier-sort"
          label="Sort by"
          onChange={(event) => updateParameter('sort', event.target.value)}
          value={sort}
        >
          {sortOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>

      {hasFilters && (
        <div className={styles.clearRow}>
          <Button onClick={clearFilters} variant="secondary">
            Clear filters
          </Button>
        </div>
      )}

      <div className={styles.resultsHeading}>
        <p aria-live="polite">
          {suppliers.isPending
            ? 'Loading locations…'
            : `${totalItems} ${totalItems === 1 ? 'supplier' : 'suppliers'}`}
        </p>
        {suppliers.isFetching && !suppliers.isPending && (
          <span>Updating results…</span>
        )}
      </div>

      {suppliers.isPending && <SupplierCardSkeletons />}
      {suppliers.isError && (
        <StatePanel
          actionLabel="Try again"
          message="Your filters are kept. Please try again."
          onAction={() => void suppliers.refetch()}
          title="We couldn’t load locations"
          tone="error"
        />
      )}
      {suppliers.isSuccess && items.length === 0 && (
        <StatePanel
          actionLabel={hasFilters ? 'Clear filters' : undefined}
          message="No locations match these filters."
          onAction={hasFilters ? clearFilters : undefined}
          title="No locations found"
        />
      )}

      {items.length > 0 && (
        <>
          <div className={styles.tableFrame}>
            <table>
              <caption className={styles.visuallyHidden}>
                Administrative supplier records
              </caption>
              <thead>
                <tr>
                  <th scope="col">Location</th>
                  <th scope="col">Category</th>
                  <th scope="col">Building</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((supplier) => (
                  <tr key={supplier.id}>
                    <th scope="row">{supplier.name}</th>
                    <td>{supplier.type}</td>
                    <td>
                      {supplier.building}
                      {supplier.floor ? ` · ${supplier.floor}` : ''}
                    </td>
                    <td>
                      <StatusBadge status={supplier.status} />
                    </td>
                    <td>{displayDate(supplier.updatedAt)}</td>
                    <td>
                      <SupplierActions
                        onAction={beginAction}
                        supplier={supplier}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.mobileList}>
            {items.map((supplier) => (
              <article className={styles.mobileCard} key={supplier.id}>
                <div className={styles.cardHeading}>
                  <div>
                    <h2>{supplier.name}</h2>
                    <p>{supplier.type}</p>
                  </div>
                  <StatusBadge status={supplier.status} />
                </div>
                <dl>
                  <div>
                    <dt>Building</dt>
                    <dd>
                      {supplier.building}
                      {supplier.floor ? ` · ${supplier.floor}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{displayDate(supplier.updatedAt)}</dd>
                  </div>
                </dl>
                <SupplierActions onAction={beginAction} supplier={supplier} />
              </article>
            ))}
          </div>
        </>
      )}

      <Pagination
        onPageChange={(nextPage) =>
          updateParameter('page', String(nextPage), false)
        }
        page={page}
        totalPages={suppliers.data?.totalPages ?? 0}
      />

      {pendingAction?.kind === 'status' && (
        <ConfirmationDialog
          confirmLabel={
            pendingAction.nextStatus === 'ACTIVE' ? 'Activate' : 'Deactivate'
          }
          onCancel={closeDialog}
          onConfirm={() => void confirmAction()}
          pending={statusMutation.isPending}
          title={`${pendingAction.nextStatus === 'ACTIVE' ? 'Activate' : 'Deactivate'} ${pendingAction.supplier.name}?`}
        >
          <p>
            {pendingAction.nextStatus === 'ACTIVE'
              ? 'Students will see this location again.'
              : 'Students won’t see this location any more.'}
          </p>
        </ConfirmationDialog>
      )}

      {pendingAction?.kind === 'delete' && (
        <ConfirmationDialog
          confirmLabel="Permanently delete"
          danger
          onCancel={closeDialog}
          onConfirm={() => void confirmAction()}
          pending={deleteMutation.isPending}
          title={`Permanently delete ${pendingAction.supplier.name}?`}
        >
          <p>
            This cannot be undone. For ordinary removal, deactivate the supplier
            instead so its history is preserved.
          </p>
        </ConfirmationDialog>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: Supplier['status'] }) {
  const active = status === 'ACTIVE'
  return (
    <span className={active ? styles.activeBadge : styles.inactiveBadge}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function SupplierActions({
  supplier,
  onAction,
}: {
  supplier: Supplier
  onAction: (action: PendingAction) => void
}) {
  const nextStatus: SupplierStatus =
    supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
  return (
    <div className={styles.actions}>
      <Link to={`/admin/suppliers/${supplier.id}/edit`}>
        <Pencil aria-hidden="true" />
        Edit
      </Link>
      <button
        onClick={() => onAction({ kind: 'status', supplier, nextStatus })}
        type="button"
      >
        {nextStatus === 'ACTIVE' ? (
          <Eye aria-hidden="true" />
        ) : (
          <EyeOff aria-hidden="true" />
        )}
        {nextStatus === 'ACTIVE' ? 'Activate' : 'Deactivate'}
      </button>
      <button
        className={styles.deleteAction}
        onClick={() => onAction({ kind: 'delete', supplier })}
        type="button"
      >
        <Trash2 aria-hidden="true" />
        Delete
      </button>
    </div>
  )
}
