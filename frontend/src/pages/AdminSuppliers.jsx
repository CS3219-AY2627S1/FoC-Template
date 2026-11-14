/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Created the admin supplier list mockup (GET /api/v1/admin/suppliers view: search,
 *        location and category filters, A-Z/Z-A sort, active/inactive/deleted status, edit and
 *        soft-delete entry points). Visual/layout implementation over the contract in
 *        SupplierServiceArchitecture.md §7.2-§7.3. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Connected the screen to the Supplier Service: it lists through GET /api/v1/admin/suppliers
 *        (server-side search, filters, sort and paging) and deletes through DELETE
 *        /api/v1/admin/suppliers/:id, replacing the in-memory store. Access is limited to the admin
 *        and super admin roles of the logged-in session. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: AdminOnly and the admin check below now read from the new AuthContext instead of
 *        DemoContext, and the "Log in" button calls requireAuth instead of the deleted
 *        LoginModal's requireLogin, per instructions.md Stage 16b. AdminOnly's own rendering
 *        (its inline "Admins only"/"Log in" message) is unchanged - this page is not wrapped
 *        in the new generic RequireRole/Forbidden, which is reserved for /admin/users
 *        (stage 16g).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced native dropdowns with the requested searchable control.
 * Author review: Congchen
 */

import SearchableSelect from '../components/SearchableSelect'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import Button from '../components/Button'
import CategoryPills from '../components/CategoryPills'
import EmptyState from '../components/EmptyState'
import SupplierImage from '../components/SupplierImage'
import { Pager, useApiNotice } from '../components/ApiNotice'
import { useAuth } from '../context/AuthContext'
import { useApi, useReferenceData } from '../api/useApi'
import { deleteSupplier, listAdminSuppliers } from '../api/suppliers'

export const selectClass =
  'h-11 w-full rounded-btn border border-line bg-surface px-3 text-sm text-ink md:h-10'

function Badge({ tone, children }) {
  const tones = {
    active: 'border-blue text-blue',
    inactive: 'border-orange text-orange',
    deleted: 'border-alert text-alert',
    open: 'border-line text-ink-70',
    closed: 'border-line text-ink-40',
  }
  return (
    <span
      className={
        'inline-flex h-5 items-center rounded-pill border bg-surface px-2 text-[11px] font-medium ' +
        tones[tone]
      }
    >
      {children}
    </span>
  )
}

// The service answers 403 to a non-admin; the screen mirrors that without a request.
export function AdminOnly({ children }) {
  const { isAdmin, isLoggedIn, sessionReady, requireAuth } = useAuth()
  if (!sessionReady) return <p className="page-width page-gutter py-10 text-sm text-ink-40">Loading…</p>
  if (isAdmin) return children
  return (
    <div className="page-width page-gutter py-10">
      <EmptyState
        title={isLoggedIn ? 'Admins only' : 'Log in to continue'}
        body="Supplier management needs an admin or super admin account."
        action={
          isLoggedIn ? null : (
            <Button size="sm" onClick={() => requireAuth('Log in to manage suppliers.')}>
              Log in
            </Button>
          )
        }
      />
    </div>
  )
}

function DeleteDialog({ supplier, busy, error, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cancel delete"
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-labelledby="del-title"
        className="foc-fade relative w-full max-w-md rounded-t-card bg-surface p-5 shadow-modal sm:rounded-card"
      >
        <h2 id="del-title" className="text-lg font-semibold text-ink">
          Delete {supplier.name}?
        </h2>
        <p className="mt-2 text-sm text-ink-70">
          The supplier is soft-deleted: it disappears from the user-facing list, and past requests
          keep their history. Requests that have not been collected yet are cancelled and their
          posters are notified.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            <Trash2 size={16} aria-hidden="true" />
            {busy ? 'Deleting…' : 'Delete supplier'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Admin list: includes inactive and soft-deleted suppliers (§6.3) and shows isActive/isDeleted.
export default function AdminSuppliers() {
  const { isAdmin } = useAuth()
  const { locations, categories } = useReferenceData()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sortOrder, setSortOrder] = useState('A-Z')
  const [page, setPage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // The form hands over a result message when it navigates back here.
  const [notice, setNotice] = useState(useLocation().state?.notice ?? '')

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])
  useEffect(() => {
    setPage(1)
  }, [search, locationId, categoryId, sortOrder])

  const params = useMemo(
    () => ({ page, search, location_id: locationId, category_id: categoryId, sortOrder }),
    [page, search, locationId, categoryId, sortOrder],
  )
  // Only ask the service when the session is an admin one; AdminOnly shows the refusal otherwise.
  const { data, loading, error, reload } = useApi(
    () => (isAdmin ? listAdminSuppliers(params) : Promise.resolve(null)),
    [params, isAdmin],
  )
  const listNotice = useApiNotice({ loading: loading && !data, error })
  const results = data?.data ?? []

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteSupplier(pendingDelete.id)
      setNotice(pendingDelete.name + ' was deleted.')
      setPendingDelete(null)
      reload()
    } catch (e) {
      setDeleteError(e.status === 404 ? 'This supplier no longer exists.' : e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AdminOnly>
      <div className="page-width page-gutter py-8 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Manage suppliers</h1>
          <Button as={Link} to="/admin/suppliers/new">
            <Plus size={16} aria-hidden="true" />
            Add supplier
          </Button>
        </div>

        {notice && (
          <p role="status" className="mt-4 rounded-btn border border-line bg-surface-alt px-3 py-2 text-sm text-ink-70">
            {notice}
          </p>
        )}

        <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_200px_120px]">
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-40"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, location, or category"
              aria-label="Search suppliers"
              className="h-11 w-full rounded-btn border border-line bg-surface pl-11 pr-4 text-base text-ink md:h-10"
            />
          </div>
          <SearchableSelect
            aria-label="Filter by location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className={selectClass}
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.location_id} value={l.location_id}>
                {l.location}
              </option>
            ))}
          </SearchableSelect>
          <SearchableSelect
            aria-label="Filter by category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={selectClass}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.category}
              </option>
            ))}
          </SearchableSelect>
          <SearchableSelect
            aria-label="Sort order"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={selectClass}
          >
            <option>A-Z</option>
            <option>Z-A</option>
          </SearchableSelect>
        </div>

        {listNotice}

        {!listNotice && (
          <>
            <p className="mt-4 text-sm text-ink-70">
              <span className="tnum font-medium text-ink">{data?.metadata.totalRecords ?? 0}</span>{' '}
              {data?.metadata.totalRecords === 1 ? 'supplier' : 'suppliers'}
            </p>

            {results.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No suppliers match those filters"
                  body="Try clearing a filter or searching for something else."
                />
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {results.map((s) => (
                  <li
                    key={s.id}
                    className={'card flex flex-col gap-3 p-3 sm:flex-row sm:items-center ' + (s.isDeleted ? 'opacity-60' : '')}
                  >
                    <div className="w-full shrink-0 sm:w-24">
                      <SupplierImage supplier={s} ratio="aspect-[16/9] sm:aspect-square" rounded="rounded-[10px]" compact />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-ink">{s.name}</h2>
                        <Badge tone="closed">{s.type}</Badge>
                        {s.isDeleted ? (
                          <Badge tone="deleted">Deleted</Badge>
                        ) : (
                          <Badge tone={s.isActive ? 'active' : 'inactive'}>{s.isActive ? 'Active' : 'Inactive'}</Badge>
                        )}
                        <Badge tone={s.isOpen ? 'open' : 'closed'}>{s.isOpen ? 'Open now' : 'Closed'}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-ink-40">
                        {s.location} · {s.faculty}
                      </p>
                      <CategoryPills categories={s.categories} className="mt-2" />
                    </div>
                    <div className="flex gap-2 sm:flex-col">
                      {s.isDeleted ? (
                        <p className="text-xs text-ink-40 sm:max-w-[9rem]">
                          Recreate it with the same name, type and location to restore it.
                        </p>
                      ) : (
                        <>
                          <Button as={Link} to={`/admin/suppliers/${s.id}/edit`} variant="secondary" size="sm" className="flex-1">
                            <Pencil size={14} aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setDeleteError('')
                              setPendingDelete(s)
                            }}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Pager metadata={data?.metadata} onPage={setPage} />
          </>
        )}

        {pendingDelete && (
          <DeleteDialog
            supplier={pendingDelete}
            busy={deleting}
            error={deleteError}
            onCancel={() => setPendingDelete(null)}
            onConfirm={confirmDelete}
          />
        )}
      </div>
    </AdminOnly>
  )
}
