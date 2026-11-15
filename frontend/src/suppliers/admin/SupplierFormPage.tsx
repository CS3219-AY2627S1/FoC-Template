/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added create/edit orchestration, ETag concurrency recovery, and error
 * feedback for the administrator Supplier form in issue #30.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27.
 * Scope: adopted the shared administrator page shell for issue #34.
 * Author review: Reviewed and approved by @ron.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../../api/client'
import {
  createSupplier,
  getSupplier,
  getSupplierMetadata,
  updateSupplier,
} from '../../api/supplierApi'
import { useAuth } from '../../auth/authContext'
import { useToast } from '../../components/toast/toastContext'
import type { SupplierBuildingOption, SupplierWithEtag } from '../types'
import { SupplierFeedback } from './SupplierFeedback'
import { SupplierForm } from './SupplierForm'
import { SupplierAdminPageShell } from './SupplierAdminPageShell'
import {
  EMPTY_SUPPLIER_DRAFT,
  draftFromSupplier,
  mutationFromDraft,
  validateSupplierDraft,
  type SupplierFormDraft,
} from './supplierFormModel'

export function SupplierFormPage({ mode }: { readonly mode: 'create' | 'edit' }) {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const isAdmin = user?.role === 'ADMINISTRATOR'
  const [draft, setDraft] = useState<SupplierFormDraft>(EMPTY_SUPPLIER_DRAFT)
  const [buildings, setBuildings] = useState<readonly SupplierBuildingOption[]>([])
  const [etag, setEtag] = useState<string | null>(null)
  const [latest, setLatest] = useState<SupplierWithEtag | null>(null)
  const [showComparison, setShowComparison] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const loadPage = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [metadata, detail] = await Promise.all([
        getSupplierMetadata(),
        mode === 'edit' && id ? getSupplier(id) : Promise.resolve(null),
      ])
      setBuildings(metadata.buildingCodes)
      if (detail) {
        setDraft(draftFromSupplier(detail.supplier))
        setEtag(detail.etag)
      }
    } catch (caught) {
      setError(caught)
    } finally {
      setLoading(false)
    }
  }, [id, isAdmin, mode])

  useEffect(() => {
    // Loading remote form dependencies is the synchronization this effect owns.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadPage()
  }, [loadPage])

  const fetchLatest = useCallback(async (): Promise<SupplierWithEtag | null> => {
    if (!id) return null
    try {
      const current = await getSupplier(id)
      setLatest(current)
      return current
    } catch (caught) {
      setError(caught)
      return null
    }
  }, [id])

  async function submitDraft() {
    const localErrors = validateSupplierDraft(draft)
    setFieldErrors(localErrors)
    setError(null)
    setShowComparison(false)
    if (Object.keys(localErrors).length > 0) return

    setSubmitting(true)
    try {
      const values = mutationFromDraft(draft)
      const result = mode === 'create'
        ? await createSupplier(values)
        : id && etag
          ? await updateSupplier(id, values, etag)
          : (() => { throw new ApiError(428, 'SUPPLIER_PRECONDITION_REQUIRED', 'Current version required.') })()
      showToast(
        mode === 'create' ? `${result.supplier.name} was created.` : `${result.supplier.name} was updated.`,
        'success',
      )
      navigate('/suppliers/admin')
    } catch (caught) {
      setError(caught)
      if (caught instanceof ApiError && caught.status === 400) {
        setFieldErrors(caught.fieldErrors)
      }
      if (caught instanceof ApiError && caught.status === 412) {
        await fetchLatest()
        setError(caught)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitDraft()
  }

  async function reloadLatest() {
    const current = latest ?? await fetchLatest()
    if (!current) return
    setDraft(draftFromSupplier(current.supplier))
    setEtag(current.etag)
    setLatest(null)
    setError(null)
    setFieldErrors({})
    setShowComparison(false)
    showToast('Latest Supplier values loaded.', 'info')
  }

  if (!isAdmin) {
    return (
      <SupplierAdminPageShell>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6" role="alert">
          <h1 className="text-xl font-bold text-navy-900">Administrator access required</h1>
          <p className="mt-2 text-sm text-slate-700">Supplier management is available only to administrators.</p>
          <Link className="mt-4 inline-flex font-semibold text-navy-800 underline" to="/suppliers">Return to Suppliers</Link>
        </div>
      </SupplierAdminPageShell>
    )
  }

  return (
    <SupplierAdminPageShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/suppliers/admin" className="text-sm font-semibold text-navy-700 hover:underline">← Supplier management</Link>
          <h1 className="mt-2 text-2xl font-bold text-navy-900">
            {mode === 'create' ? 'Add Supplier' : 'Edit Supplier'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {mode === 'create'
              ? 'Create a live Supplier catalogue record.'
              : 'Saving replaces every editable field using the version you loaded.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600" role="status">
          Loading Supplier form…
        </div>
      ) : buildings.length === 0 ? (
        <div className="space-y-4">
          {error !== null && <SupplierFeedback error={error} onRetry={() => void loadPage()} />}
          {!error && <p role="alert">Building metadata is unavailable.</p>}
        </div>
      ) : mode === 'edit' && !etag ? (
        <div className="space-y-4">
          {error !== null && <SupplierFeedback error={error} onRetry={() => void loadPage()} />}
          {error === null && <p role="alert">Supplier details are unavailable.</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {error !== null && (
            <SupplierFeedback
              error={error}
              onRetry={() => void submitDraft()}
              onCompare={latest ? () => setShowComparison((visible) => !visible) : undefined}
              onReload={mode === 'edit' ? () => void reloadLatest() : undefined}
            />
          )}
          {showComparison && latest && <DraftComparison draft={draft} latest={draftFromSupplier(latest.supplier)} />}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <SupplierForm
              draft={draft}
              buildings={buildings}
              fieldErrors={fieldErrors}
              submitting={submitting}
              submitLabel={mode === 'create' ? 'Create Supplier' : 'Save changes'}
              onChange={(nextDraft) => {
                setDraft(nextDraft)
                setFieldErrors({})
              }}
              onSubmit={handleSubmit}
              onCancel={() => navigate('/suppliers/admin')}
            />
          </section>
        </div>
      )}
    </SupplierAdminPageShell>
  )
}

function DraftComparison({ draft, latest }: { readonly draft: SupplierFormDraft; readonly latest: SupplierFormDraft }) {
  const rows: readonly [string, string, string][] = [
    ['Name', draft.name, latest.name],
    ['Categories', draft.categories.join(', '), latest.categories.join(', ')],
    ['Building Code', draft.buildingCode, latest.buildingCode],
    ['Floor', draft.floor || '—', latest.floor || '—'],
    ['Location description', draft.locationDescription, latest.locationDescription],
    ['Latitude', draft.latitude || '—', latest.latitude || '—'],
    ['Longitude', draft.longitude || '—', latest.longitude || '—'],
    ['Typical hours', hoursSummary(draft), hoursSummary(latest)],
  ]
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-300 bg-amber-50" aria-labelledby="compare-title">
      <h2 id="compare-title" className="px-4 pt-4 text-lg font-bold text-navy-900">Your draft compared with latest</h2>
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead><tr><th className="p-2">Field</th><th className="p-2">Your draft</th><th className="p-2">Latest server value</th></tr></thead>
          <tbody>
            {rows.map(([label, draftValue, latestValue]) => (
              <tr key={label} className={draftValue === latestValue ? 'text-slate-500' : 'bg-amber-100 font-medium'}>
                <th className="p-2">{label}</th><td className="p-2">{draftValue}</td><td className="p-2">{latestValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function hoursSummary(draft: SupplierFormDraft): string {
  return draft.hoursKind === 'INTERVAL'
    ? `${draft.opensAt || '—'}–${draft.closesAt || '—'}`
    : draft.hoursKind
}
