/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Adapted the supplier page to the shared account header
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Updated the supplier page to use shared authentication session state
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CampusErrandsAPIError } from '../../api/models'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import { useToast } from '../../components/toast/useToast'
import { useUser } from '../../components/user/UserContext'
import type { Supplier, SupplierCategory, SupplierCreateRequest } from './models'
import { Modal } from '../../components/modal/Modal'
import styles from './Suppliers.module.css'

const POLL_INTERVAL_MS = 10_000
const CATEGORIES: SupplierCategory[] = ['Food', 'Food/Coffee', 'Shopping', 'Printing']

type SupplierDraft = {
  name: string
  category: SupplierCategory
  building: string
  floor: string
  description: string
  lattitude: string
  longitude: string
  startingTime: string
  closingTime: string
  imageUrl: string
}

const emptyDraft = (): SupplierDraft => ({
  name: '',
  category: 'Food',
  building: '',
  floor: '1',
  description: '',
  lattitude: '',
  longitude: '',
  startingTime: '09:00',
  closingTime: '18:00',
  imageUrl: '',
})

const supplierDraft = (supplier: Supplier): SupplierDraft => ({
  name: supplier.name,
  category: supplier.category,
  building: supplier.building,
  floor: String(supplier.floor),
  description: supplier.description,
  lattitude: String(supplier.lattitude),
  longitude: String(supplier.longitude),
  startingTime: supplier.startingTime.slice(0, 5),
  closingTime: supplier.closingTime.slice(0, 5),
  imageUrl: supplier.imageUrl ?? '',
})

const formatTime = (value: string) => value.slice(0, 5)

const Suppliers = () => {
  const api = useCampusErrandsAPI()
  const { showErrorToast, showSuccessToast } = useToast()
  const { session } = useUser()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const loading = useRef(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'all' | SupplierCategory>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editorTarget, setEditorTarget] = useState<Supplier | 'new' | null>(null)
  const [draft, setDraft] = useState<SupplierDraft>(emptyDraft)
  const [isSaving, setIsSaving] = useState(false)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)

  const loadSuppliers = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try {
      const currentSuppliers = await api.supplier.list()
      setSuppliers(currentSuppliers)
      setHasLoaded(true)
      setError(null)
    } catch {
      setError('Suppliers are temporarily unavailable. Please try again shortly.')
    } finally {
      loading.current = false
      setIsLoading(false)
    }
  }, [api])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadSuppliers(), 0)
    const poll = window.setInterval(() => void loadSuppliers(), POLL_INTERVAL_MS)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(poll)
    }
  }, [loadSuppliers])

  const visibleSuppliers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return suppliers.filter((supplier) => {
      const matchesCategory = category === 'all' || supplier.category === category
      const haystack = `${supplier.name} ${supplier.building} ${supplier.description}`.toLowerCase()
      return matchesCategory && (!normalizedQuery || haystack.includes(normalizedQuery))
    })
  }, [category, query, suppliers])

  const isAdmin = session?.role === 'admin' || session?.role === 'admin_manager'

  const openEditor = (target: Supplier | 'new') => {
    setEditorTarget(target)
    setDraft(target === 'new' ? emptyDraft() : supplierDraft(target))
  }

  const updateDraft = <K extends keyof SupplierDraft>(field: K, value: SupplierDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editorTarget) return

    const payload: SupplierCreateRequest = {
      name: draft.name.trim(),
      category: draft.category,
      building: draft.building.trim(),
      floor: Number(draft.floor),
      description: draft.description.trim(),
      lattitude: Number(draft.lattitude),
      longitude: Number(draft.longitude),
      startingTime: draft.startingTime,
      closingTime: draft.closingTime,
      imageUrl: draft.imageUrl.trim() || null,
    }

    setIsSaving(true)
    try {
      if (editorTarget === 'new') {
        await api.supplier.create(payload)
        showSuccessToast('Supplier created.')
      } else {
        await api.supplier.update({ id: editorTarget.id, ...payload })
        showSuccessToast('Supplier updated.')
      }
      setEditorTarget(null)
      await loadSuppliers()
    } catch (requestError) {
      showErrorToast(requestError instanceof CampusErrandsAPIError
        ? requestError.message
        : 'Unable to save the supplier. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeactivate = async (supplier: Supplier) => {
    if (!window.confirm(`Deactivate ${supplier.name}? It will disappear from the active supplier list.`)) return
    setDeactivatingId(supplier.id)
    try {
      await api.supplier.remove(supplier.id)
      showSuccessToast('Supplier deactivated.')
      await loadSuppliers()
    } catch (requestError) {
      showErrorToast(requestError instanceof CampusErrandsAPIError
        ? requestError.message
        : 'Unable to deactivate the supplier. Please try again.')
    } finally {
      setDeactivatingId(null)
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Campus pickup points</p>
            <h1>Around campus</h1>
            <p>Browse active suppliers and find the place that fits your next errand.</p>
          </div>
          {isAdmin && <div className={styles.adminTools}><span className="adminBadge">Admin only</span><button className={styles.primaryButton} data-admin-action type="button" disabled={!!error || isLoading} aria-haspopup="dialog" onClick={() => openEditor('new')}>Add supplier</button></div>}
        </div>

        <section className={styles.filters} aria-label="Filter suppliers">
          <label>
            Search
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, building, or description" />
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
              <option value="all">All categories</option>
              {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <span>{!hasLoaded ? '— places' : `${visibleSuppliers.length} ${visibleSuppliers.length === 1 ? 'place' : 'places'}${error ? ' · last loaded' : ''}`}</span>
        </section>

        {error && (
          <div className={styles.error} role="alert">
            <span>{error}{hasLoaded && ' Previously loaded suppliers are shown below and may be out of date.'}</span>
            <button type="button" onClick={() => {
              setIsLoading(true)
              void loadSuppliers()
            }}>Try again</button>
          </div>
        )}
        {isLoading ? (
          <p className={styles.state} role="status">Loading suppliers…</p>
        ) : error && (!hasLoaded || visibleSuppliers.length === 0) ? null : visibleSuppliers.length === 0 ? (
          <p className={styles.state}>No active suppliers match these filters.</p>
        ) : (
          <div className={styles.list} aria-live="polite">
            {visibleSuppliers.map((supplier, index) => (
              <article className={styles.supplier} key={supplier.id}>
                <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
                <div className={styles.supplierCopy}>
                  <p className={styles.eyebrow}>{supplier.category}</p>
                  <h2>{supplier.name}</h2>
                  <p>{supplier.description}</p>
                </div>
                <dl className={styles.meta}>
                  <div><dt>Location</dt><dd>{supplier.building}, level {supplier.floor}</dd></div>
                  <div><dt>Hours</dt><dd>{formatTime(supplier.startingTime)}–{formatTime(supplier.closingTime)}</dd></div>
                </dl>
                {isAdmin && (
                  <div className={styles.actions}>
                    <span className="adminBadge">Admin</span>
                    <button data-admin-action type="button" disabled={!!error} aria-haspopup="dialog" onClick={() => openEditor(supplier)}>Edit</button>
                    <button data-admin-action type="button" onClick={() => void handleDeactivate(supplier)} disabled={!!error || deactivatingId === supplier.id}>
                      {deactivatingId === supplier.id ? 'Deactivating…' : 'Deactivate'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {editorTarget && (
          <Modal id="supplier-editor" labelledBy="supplier-editor-title" onClose={() => setEditorTarget(null)} busy={isSaving}>
          <section className={styles.editor}>
            <span className="adminBadge">Admin only · Supplier management</span>
            <div className={styles.editorHeading}>
              <h2 id="supplier-editor-title">{editorTarget === 'new' ? 'Add supplier' : 'Edit supplier'}</h2>
              <button type="button" onClick={() => setEditorTarget(null)} disabled={isSaving}>Close</button>
            </div>
            <form onSubmit={(event) => void handleSave(event)}>
              <label>Name<input required value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} /></label>
              <label>Category<select value={draft.category} onChange={(event) => updateDraft('category', event.target.value as SupplierCategory)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Building<input required value={draft.building} onChange={(event) => updateDraft('building', event.target.value)} /></label>
              <label>Floor<input required type="number" step="1" value={draft.floor} onChange={(event) => updateDraft('floor', event.target.value)} /></label>
              <label className={styles.fullWidth}>Description<textarea required rows={3} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} /></label>
              <label>Latitude<input required type="number" step="any" value={draft.lattitude} onChange={(event) => updateDraft('lattitude', event.target.value)} /></label>
              <label>Longitude<input required type="number" step="any" value={draft.longitude} onChange={(event) => updateDraft('longitude', event.target.value)} /></label>
              <label>Opening time<input required type="time" value={draft.startingTime} onChange={(event) => updateDraft('startingTime', event.target.value)} /></label>
              <label>Closing time<input required type="time" value={draft.closingTime} onChange={(event) => updateDraft('closingTime', event.target.value)} /></label>
              <label className={styles.fullWidth}>Image URL <span>(optional)</span><input type="url" value={draft.imageUrl} onChange={(event) => updateDraft('imageUrl', event.target.value)} /></label>
              <div className={styles.formActions}>
                <button type="button" onClick={() => setEditorTarget(null)} disabled={isSaving}>Cancel</button>
                <button className={styles.primaryButton} data-admin-action type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save supplier'}</button>
              </div>
            </form>
          </section>
          </Modal>
        )}
      </main>
      <footer className={styles.footer}>Supplier data refreshes every 10 seconds.</footer>
    </div>
  )
}

export default Suppliers
