/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added responsive administrator Supplier management, archive, restore,
 * pagination, refresh, and lifecycle feedback for issue #30.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: adopted the shared administrator page shell for issue #34.
 * Author review: Reviewed and approved by @ron.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  archiveSupplier,
  getSupplier,
  listSuppliers,
  restoreSupplier,
} from '../../api/supplierApi'
import { useAuth } from '../../auth/authContext'
import { useToast } from '../../components/toast/toastContext'
import { formatSupplierCategories, formatTypicalHours } from '../presentation'
import type { Supplier, SupplierPage, SupplierStatus, SupplierWithEtag } from '../types'
import { ConfirmSupplierAction } from './ConfirmSupplierAction'
import { SupplierAdminPageShell } from './SupplierAdminPageShell'
import { SupplierFeedback } from './SupplierFeedback'

interface PendingAction {
  readonly action: 'archive' | 'restore'
  readonly detail: SupplierWithEtag
}

export function SupplierAdminPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const isAdmin = user?.role === 'ADMINISTRATOR'
  const [searchParams, setSearchParams] = useSearchParams()
  const status: SupplierStatus = searchParams.get('status') === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE'
  const requestedPage = Number(searchParams.get('page') ?? '0')
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0
  const [result, setResult] = useState<SupplierPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [preparingId, setPreparingId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const loadSuppliers = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await listSuppliers({ status, page, size: 12, sort: 'updatedAt,desc' })
      setResult(next)
      if (next.totalPages > 0 && page >= next.totalPages) {
        setSearchParams((current) => {
          const updated = new URLSearchParams(current)
          updated.set('page', String(next.totalPages - 1))
          return updated
        }, { replace: true })
      }
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [isAdmin, page, setSearchParams, status])

  useEffect(() => {
    // Query state selects the remote catalogue page synchronized by this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadSuppliers()
  }, [loadSuppliers])

  function selectStatus(nextStatus: SupplierStatus) {
    const next = new URLSearchParams(searchParams)
    next.set('status', nextStatus)
    next.delete('page')
    setSearchParams(next)
  }

  function selectPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    if (nextPage === 0) next.delete('page')
    else next.set('page', String(nextPage))
    setSearchParams(next)
  }

  async function prepareAction(supplier: Supplier) {
    const action = supplier.status === 'ACTIVE' ? 'archive' : 'restore'
    setPreparingId(supplier.id)
    setError(null)
    try {
      const detail = await getSupplier(supplier.id)
      setPending({ action, detail })
    } catch (caught) {
      setError(caught)
    } finally {
      setPreparingId(null)
    }
  }

  async function confirmAction() {
    if (!pending) return
    setSaving(true)
    setError(null)
    try {
      if (pending.action === 'archive') {
        await archiveSupplier(pending.detail.supplier.id, pending.detail.etag)
        showToast(`${pending.detail.supplier.name} was archived.`, 'success')
      } else {
        const restored = await restoreSupplier(pending.detail.supplier.id, pending.detail.etag)
        showToast(`${restored.supplier.name} was restored with the same ID.`, 'success')
      }
      setPending(null)
      await loadSuppliers()
    } catch (caught) {
      setPending(null)
      setError(caught)
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <SupplierAdminPageShell>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6" role="alert">
          <h1 className="text-xl font-bold text-navy-900">Administrator access required</h1>
          <p className="mt-2 text-sm text-slate-700">The backend also checks your role for every management action.</p>
          <Link to="/suppliers" className="mt-4 inline-flex font-semibold text-navy-800 underline">Return to Suppliers</Link>
        </div>
      </SupplierAdminPageShell>
    )
  }

  return (
    <SupplierAdminPageShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/suppliers" className="text-sm font-semibold text-navy-700 hover:underline">← Member catalogue</Link>
          <h1 className="mt-2 text-2xl font-bold text-navy-900">Supplier management</h1>
          <p className="mt-1 text-sm text-slate-600">Create, edit, archive, and restore live Supplier records.</p>
        </div>
        <Link
          to="/suppliers/new"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-500 px-4 py-2 font-semibold text-white hover:bg-accent-600"
        >
          Add Supplier
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-2" aria-label="Supplier status view">
          {(['ACTIVE', 'ARCHIVED'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={status === option}
              onClick={() => selectStatus(option)}
              className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${
                status === option ? 'bg-navy-800 text-white' : 'bg-slate-100 text-navy-800 hover:bg-slate-200'
              }`}
            >
              {option === 'ACTIVE' ? 'Active' : 'Archived'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void loadSuppliers()}
          disabled={loading}
          className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh live data'}
        </button>
      </div>

      {error !== null && (
        <div className="mt-5">
          <SupplierFeedback error={error} onRetry={() => void loadSuppliers()} onReload={() => void loadSuppliers()} />
        </div>
      )}

      <section className="mt-5" aria-live="polite" aria-busy={loading}>
        {loading && !result ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600" role="status">Loading Suppliers…</div>
        ) : result?.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="font-bold text-navy-900">No {status.toLowerCase()} Suppliers</h2>
            <p className="mt-1 text-sm text-slate-600">
              {status === 'ACTIVE' ? 'Add a Supplier to begin.' : 'Archived Suppliers will appear here.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {result?.items.map((supplier) => (
              <AdminSupplierCard
                key={supplier.id}
                supplier={supplier}
                preparing={preparingId === supplier.id}
                onPrepare={() => void prepareAction(supplier)}
              />
            ))}
          </div>
        )}
      </section>

      {result && result.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Supplier management pages">
          <button type="button" disabled={result.page === 0} onClick={() => selectPage(result.page - 1)} className={pageButtonClass}>Previous</button>
          <span className="text-sm text-slate-600">Page {result.page + 1} of {result.totalPages}</span>
          <button type="button" disabled={result.page + 1 >= result.totalPages} onClick={() => selectPage(result.page + 1)} className={pageButtonClass}>Next</button>
        </nav>
      )}

      {pending && (
        <ConfirmSupplierAction
          supplier={pending.detail.supplier}
          action={pending.action}
          busy={saving}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirmAction()}
        />
      )}
    </SupplierAdminPageShell>
  )
}

function AdminSupplierCard({
  supplier,
  preparing,
  onPrepare,
}: {
  readonly supplier: Supplier
  readonly preparing: boolean
  readonly onPrepare: () => void
}) {
  const isActive = supplier.status === 'ACTIVE'
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold text-navy-900">{supplier.name}</h2>
          <p className="mt-1 text-sm text-slate-600">{supplier.buildingLabel}{supplier.floor ? ` · Floor ${supplier.floor}` : ''}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
          {supplier.status}
        </span>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div><dt className="font-semibold text-slate-700">Categories</dt><dd className="break-words text-slate-600">{formatSupplierCategories(supplier.categories)}</dd></div>
        <div><dt className="font-semibold text-slate-700">Location</dt><dd className="break-words text-slate-600">{supplier.locationDescription}</dd></div>
        <div><dt className="font-semibold text-slate-700">Typical hours</dt><dd className="text-slate-600">{formatTypicalHours(supplier)}</dd></div>
      </dl>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Link to={`/suppliers/${supplier.id}`} className={secondaryActionClass}>View</Link>
        <Link to={`/suppliers/${supplier.id}/edit`} className={secondaryActionClass}>Edit</Link>
        <button
          type="button"
          onClick={onPrepare}
          disabled={preparing}
          className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
            isActive ? 'border border-red-300 text-red-800 hover:bg-red-50' : 'bg-emerald-700 text-white hover:bg-emerald-800'
          }`}
        >
          {preparing ? 'Loading current version…' : isActive ? 'Archive' : 'Restore'}
        </button>
      </div>
    </article>
  )
}

const secondaryActionClass =
  'inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50'
const pageButtonClass =
  'min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
