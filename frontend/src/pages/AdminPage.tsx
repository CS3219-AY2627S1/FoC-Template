/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import routeIcon from '../assets/route.svg'
import { AccountMenu } from '../components/layout/AccountMenu'
import { AdminUsers } from '../features/admin/AdminUsers'
import { Badge, Modal, Pagination } from '../features/admin/AdminUi'
import { errorMessage, PAGE_SIZE } from '../features/admin/admin.utils'
import { listErrands } from '../features/errands/errand.api'
import type { ErrandListItem, ErrandListResponse } from '../features/errands/errand.types'
import { getProfile } from '../features/auth/profile.api'
import {
  createBuilding, createCategory, createSupplier, deactivateBuilding, deactivateCategory,
  deactivateSupplier, listAdminBuildings, listAdminCategories, listDeactivatedBuildings,
  listDeactivatedCategories, listDeactivatedSuppliers, listSuppliers, reactivateBuilding,
  reactivateCategory, reactivateSupplier, SupplierApiError, updateBuilding, updateCategory,
  updateSupplier,
} from '../features/suppliers/supplier.api'
import type { Supplier, SupplierDirectoryEntry, SupplierListResponse, SupplierWriteRequest } from '../features/suppliers/supplier.types'
import './AdminPage.css'

const sections = [['', 'Overview', '◈'], ['suppliers', 'Suppliers', '▤'], ['categories', 'Categories', '◇'], ['buildings', 'Buildings', '▥'], ['errands', 'All errands', '↗'], ['users', 'Users', '◉']]
type ResourceKind = 'categories' | 'buildings'
type ListingStatus = 'active' | 'inactive'
type SupplierDraft = { id: string; name: string; categoryId: string; buildingId: string; floor: string; description: string; openingTime: string; closingTime: string; imageUrl: string }
const emptySupplier: SupplierDraft = { id: '', name: '', categoryId: '', buildingId: '', floor: '', description: '', openingTime: '', closingTime: '', imageUrl: '' }

async function loadAllSuppliers(loader: (params: { page: number; size: number }, signal?: AbortSignal) => Promise<SupplierListResponse>, signal: AbortSignal) {
  const items: Supplier[] = []
  let page = 0
  do {
    const response = await loader({ page, size: 100 }, signal)
    items.push(...response.items)
    if (!response.page.hasNext) return items
    page += 1
  } while (!signal.aborted)
  return items
}

async function loadAllErrands(signal: AbortSignal) {
  const items: ErrandListItem[] = []
  let page = 0
  do {
    const response: ErrandListResponse = await listErrands({ page, size: 100, sort: 'created_at,desc' }, signal)
    items.push(...response.items)
    if (items.length >= response.total) return items
    page += 1
  } while (!signal.aborted)
  return items
}

function toDraft(supplier: Supplier, categories: SupplierDirectoryEntry[], buildings: SupplierDirectoryEntry[]): SupplierDraft {
  return {
    id: supplier.id, name: supplier.name,
    categoryId: categories.some(item => item.id === supplier.category.id) ? supplier.category.id : '',
    buildingId: buildings.some(item => item.id === supplier.building.id) ? supplier.building.id : '',
    floor: supplier.floor ?? '', description: supplier.description ?? '', openingTime: supplier.openingTime ?? '',
    closingTime: supplier.closingTime ?? '', imageUrl: supplier.imageUrl ?? '',
  }
}

function SupplierForm({ supplier, categories, buildings, save, close }: { supplier: SupplierDraft; categories: SupplierDirectoryEntry[]; buildings: SupplierDirectoryEntry[]; save: (draft: SupplierDraft) => Promise<void>; close: () => void }) {
  const [draft, setDraft] = useState(supplier)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); const name = draft.name.trim()
    if (!name || !draft.categoryId || !draft.buildingId) { setError('Name, category and building are required.'); return }
    if (name.length > 60 || draft.floor.length > 20 || draft.description.length > 500 || draft.imageUrl.length > 500) { setError('One or more fields exceed the maximum length.'); return }
    if (Boolean(draft.openingTime) !== Boolean(draft.closingTime)) { setError('Provide both opening and closing times, or leave both empty.'); return }
    if (draft.imageUrl) {
      try { const url = new URL(draft.imageUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error() } catch { setError('Enter a valid HTTP or HTTPS image URL.'); return }
    }
    setSaving(true); setError('')
    try { await save({ ...draft, name }) } catch (requestError) { setError(errorMessage(requestError)); setSaving(false) }
  }
  return <Modal title={supplier.id ? 'Edit supplier' : 'Add supplier'} close={close}><form onSubmit={submit} className="admin-form">
    <label>Supplier name *<input required maxLength={60} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <div className="admin-form-grid">
      <label>Category *<select required value={draft.categoryId} onChange={event => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Select active category</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Building *<select required value={draft.buildingId} onChange={event => setDraft({ ...draft, buildingId: event.target.value })}><option value="">Select active building</option>{buildings.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <label>Floor<input maxLength={20} value={draft.floor} onChange={event => setDraft({ ...draft, floor: event.target.value })} /></label>
    <label>Description<textarea maxLength={500} rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
    <div className="admin-form-grid"><label>Opening time<input type="time" value={draft.openingTime} onChange={event => setDraft({ ...draft, openingTime: event.target.value })} /></label><label>Closing time<input type="time" value={draft.closingTime} onChange={event => setDraft({ ...draft, closingTime: event.target.value })} /></label></div>
    <label>Image URL<input type="url" maxLength={500} value={draft.imageUrl} onChange={event => setDraft({ ...draft, imageUrl: event.target.value })} /></label>
    {error && <p role="alert" className="admin-error">{error}</p>}<div className="admin-dialog-actions"><button type="button" onClick={close}>Cancel</button><button disabled={saving} className="admin-primary">{saving ? 'Saving…' : 'Save supplier'}</button></div>
  </form></Modal>
}

function ReferenceForm({ kind, item, save, close }: { kind: ResourceKind; item: SupplierDirectoryEntry | null; save: (name: string) => Promise<void>; close: () => void }) {
  const [name, setName] = useState(item?.name ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); const value = name.trim()
    if (!value) { setError('Name is required.'); return }
    if (value.length > 60) { setError('Name must not exceed 60 characters.'); return }
    setSaving(true); setError('')
    try { await save(value) } catch (requestError) { setError(errorMessage(requestError)); setSaving(false) }
  }
  return <Modal title={`${item ? 'Rename' : 'Add'} ${kind === 'categories' ? 'category' : 'building'}`} close={close}><form className="admin-form" onSubmit={submit}>
    <label>Name *<input required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label>{error && <p role="alert" className="admin-error">{error}</p>}
    <div className="admin-dialog-actions"><button type="button" onClick={close}>Cancel</button><button disabled={saving} className="admin-primary">{saving ? 'Saving…' : 'Save'}</button></div>
  </form></Modal>
}

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' }).format(new Date(value)) : '—'
}

function formatSupplierTime(value: string) {
  return value.slice(0, 5)
}

export function AdminPage() {
  const section = useLocation().pathname.replace(/^\/admin\/?/, '')
  const [activeSuppliers, setActiveSuppliers] = useState<Supplier[]>([])
  const [inactiveSuppliers, setInactiveSuppliers] = useState<Supplier[]>([])
  const [activeCategories, setActiveCategories] = useState<SupplierDirectoryEntry[]>([])
  const [inactiveCategories, setInactiveCategories] = useState<SupplierDirectoryEntry[]>([])
  const [activeBuildings, setActiveBuildings] = useState<SupplierDirectoryEntry[]>([])
  const [inactiveBuildings, setInactiveBuildings] = useState<SupplierDirectoryEntry[]>([])
  const [listingStatus, setListingStatus] = useState<ListingStatus>('active')
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [errandSupplierId, setErrandSupplierId] = useState('')
  const [errandStatus, setErrandStatus] = useState('')
  const [sort, setSort] = useState('recent')
  const [editingSupplier, setEditingSupplier] = useState<SupplierDraft | null>(null)
  const [editingReference, setEditingReference] = useState<{ kind: ResourceKind; item: SupplierDirectoryEntry | null } | null>(null)
  const [confirming, setConfirming] = useState<{ label: string; action: () => Promise<void> } | null>(null)
  const [selectedErrand, setSelectedErrand] = useState<ErrandListItem | null>(null)
  const [errands, setErrands] = useState<ErrandListItem[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [orderLoading, setOrderLoading] = useState(true)
  const [orderError, setOrderError] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const title = sections.find(([path]) => path === section)?.[1]

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      loadAllSuppliers(listSuppliers, controller.signal), loadAllSuppliers(listDeactivatedSuppliers, controller.signal),
      listAdminCategories(controller.signal), listDeactivatedCategories(controller.signal), listAdminBuildings(controller.signal), listDeactivatedBuildings(controller.signal),
    ]).then(([activeSupplierItems, inactiveSupplierItems, categories, retiredCategories, buildings, retiredBuildings]) => {
      if (controller.signal.aborted) return
      setActiveSuppliers(activeSupplierItems); setInactiveSuppliers(inactiveSupplierItems); setActiveCategories(categories.items)
      setInactiveCategories(retiredCategories.items); setActiveBuildings(buildings.items); setInactiveBuildings(retiredBuildings.items); setLoading(false)
    }).catch(requestError => { if (!controller.signal.aborted) { setError(errorMessage(requestError)); setLoading(false) } })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    const controller = new AbortController()
    void loadAllErrands(controller.signal).then(async items => {
      if (controller.signal.aborted) return
      setErrands(items)
      const userIds = [...new Set(items.flatMap(item => [item.requester_id, item.courier_id].filter((id): id is string => Boolean(id))))]
      const results = await Promise.allSettled(userIds.map(async id => ({ id, profile: await getProfile(id, controller.signal) })))
      if (controller.signal.aborted) return
      setProfiles(Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [[result.value.id, result.value.profile.name]] : [])))
      setOrderLoading(false)
    }).catch(requestError => {
      if (!controller.signal.aborted) { setOrderError(errorMessage(requestError)); setOrderLoading(false) }
    })
    return () => controller.abort()
  }, [])

  function refresh(message: string) { setNotice(message); setError(''); setLoading(true); setReload(value => value + 1) }
  function clearFilters() { setQuery(''); setCategoryId(''); setBuildingId(''); setErrandSupplierId(''); setErrandStatus(''); setSort('recent'); setListingStatus('active'); setPage(0) }
  const suppliers = listingStatus === 'active' ? activeSuppliers : inactiveSuppliers
  const visibleSuppliers = suppliers.filter(item => item.name.toLowerCase().includes(query.toLowerCase()) && (!categoryId || item.category.id === categoryId) && (!buildingId || item.building.id === buildingId))
  const supplierPage = Math.min(page, Math.max(0, Math.ceil(visibleSuppliers.length / PAGE_SIZE) - 1))
  const paginatedSuppliers = visibleSuppliers.slice(supplierPage * PAGE_SIZE, (supplierPage + 1) * PAGE_SIZE)
  const supplierFiltersApplied = Boolean(query || categoryId || buildingId)
  const supplierCountLabel = `${supplierFiltersApplied ? `${visibleSuppliers.length} matching · ` : ''}${suppliers.length} ${listingStatus} suppliers`
  const supplierPayload = (draft: SupplierDraft): SupplierWriteRequest => ({ name: draft.name, categoryId: draft.categoryId, buildingId: draft.buildingId, floor: draft.floor.trim() || null, description: draft.description.trim() || null, openingTime: draft.openingTime || null, closingTime: draft.closingTime || null, imageUrl: draft.imageUrl.trim() || null })
  async function saveSupplier(draft: SupplierDraft) {
    if (draft.id) await updateSupplier(draft.id, supplierPayload(draft)); else await createSupplier(supplierPayload(draft))
    setEditingSupplier(null); refresh(`${draft.name} saved.`)
  }
  async function saveReference(kind: ResourceKind, item: SupplierDirectoryEntry | null, name: string) {
    if (kind === 'categories') { if (item) await updateCategory(item.id, name); else await createCategory(name) }
    else if (item) await updateBuilding(item.id, name); else await createBuilding(name)
    setEditingReference(null); refresh(`${name} saved.`)
  }
  async function runLifecycle(action: () => Promise<unknown>, message: string) {
    setActionError('')
    try { await action(); setConfirming(null); refresh(message) } catch (requestError) {
      if (requestError instanceof SupplierApiError && requestError.inactiveReferences.length) {
        const references = requestError.inactiveReferences
        const names = references.length === 1 ? references[0] : `${references.slice(0, -1).join(', ')} and ${references.at(-1)}`
        setActionError(`This supplier cannot be reactivated because its ${names} ${references.length === 1 ? 'is' : 'are'} inactive. Reactivate ${references.length === 1 ? 'it' : 'them'} first, then try again.`)
      } else {
        setActionError(errorMessage(requestError))
      }
      setConfirming(null)
    }
  }
  const referenceItems = section === 'categories' ? (listingStatus === 'active' ? activeCategories : inactiveCategories) : (listingStatus === 'active' ? activeBuildings : inactiveBuildings)
  const visibleReferenceItems = referenceItems.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
  const referencePage = Math.min(page, Math.max(0, Math.ceil(visibleReferenceItems.length / PAGE_SIZE) - 1))
  const paginatedReferenceItems = visibleReferenceItems.slice(referencePage * PAGE_SIZE, (referencePage + 1) * PAGE_SIZE)
  const referenceKindLabel = section === 'categories' ? 'categories' : 'buildings'
  const referenceCountLabel = `${query ? `${visibleReferenceItems.length} matching · ` : ''}${referenceItems.length} ${listingStatus} ${referenceKindLabel}`
  const supplierNames = new Map([...activeSuppliers, ...inactiveSuppliers].map(item => [item.id, item.name]))
  const buildingNames = new Map([...activeBuildings, ...inactiveBuildings].map(item => [item.id, item.name]))
  const visibleErrands = errands.filter(item => {
    const text = `${item.id} ${item.required_item}`.toLowerCase()
    return (!errandStatus || item.status === errandStatus)
      && (!buildingId || item.delivery_building_id === buildingId)
      && (!errandSupplierId || item.supplier_id === errandSupplierId)
      && text.includes(query.toLowerCase())
  }).sort((a, b) => {
    if (sort === 'credits-high') return b.credit_value - a.credit_value
    if (sort === 'credits-low') return a.credit_value - b.credit_value
    if (sort === 'oldest') return a.created_at.localeCompare(b.created_at)
    return b.created_at.localeCompare(a.created_at)
  })
  const errandPage = Math.min(page, Math.max(0, Math.ceil(visibleErrands.length / PAGE_SIZE) - 1))
  const paginatedErrands = visibleErrands.slice(errandPage * PAGE_SIZE, (errandPage + 1) * PAGE_SIZE)

  function errandsTable(rows: ErrandListItem[]) {
    return <div className="admin-table-scroll"><table><thead><tr><th>Errand</th><th>Supplier</th><th>Requester</th><th>Status</th><th>Credits</th><th>Actions</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td><strong>{item.required_item}</strong><small>{item.id}</small></td><td>{supplierNames.get(item.supplier_id) ?? 'Supplier unavailable'}</td><td>{profiles[item.requester_id] ?? item.requester_id}</td><td><Badge status={item.status} /></td><td>{item.credit_value}</td><td><button aria-label={`View ${item.id}`} onClick={() => setSelectedErrand(item)}>View ↗</button></td></tr>)}</tbody></table>{!rows.length && <div className="admin-empty">No errands match the selected filters.</div>}</div>
  }

  return <div className="admin-preview">
    <header className="admin-header"><Link to="/" className="admin-brand"><span><img src={routeIcon} alt="" width={20} height={20} /></span><span className="admin-brand-label">Campus Couriers</span></Link><div className="admin-identity"><Link to="/" className="admin-header-switch">User home</Link><span className="admin-account"><AccountMenu /></span></div></header>
    <div className="admin-shell"><aside className="admin-sidebar"><p className="admin-eyebrow">Administration</p><nav aria-label="Admin navigation">{sections.map(([path, label, icon]) => <NavLink key={path} to={`/admin${path ? `/${path}` : ''}`} end onClick={clearFilters}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}</nav></aside>
      <main className="admin-main"><div className="admin-page-heading"><div><h1>{title ?? 'Page not found'}</h1>{section !== '' && <p className="admin-muted">{section === 'users' ? 'Find accounts and manage administrator access.' : section === 'errands' ? 'Monitor errands across campus.' : section === 'categories' ? 'Manage campus supplier categories.' : section === 'buildings' ? 'Manage campus building directory.' : 'Manage the campus supplier directory.'}</p>}</div>{section === 'suppliers' && <button className="admin-primary" onClick={() => setEditingSupplier({ ...emptySupplier })}>＋ Add supplier</button>}{(section === 'categories' || section === 'buildings') && <button className="admin-primary" onClick={() => setEditingReference({ kind: section, item: null })}>＋ Add {section === 'categories' ? 'category' : 'building'}</button>}</div>
        {notice && <p className="admin-notice" role="status">{notice}</p>}{error && <p className="admin-error" role="alert">{error}</p>}{loading && section !== 'errands' && section !== 'users' && <p role="status" className="admin-muted">Loading supplier data…</p>}
        {section === '' && !loading && <><h2 className="admin-overview-title">Directory overview</h2><div className="admin-directory-stats">{[
          ['Suppliers', activeSuppliers.length, inactiveSuppliers.length],
          ['Categories', activeCategories.length, inactiveCategories.length],
          ['Buildings', activeBuildings.length, inactiveBuildings.length],
        ].map(([label, active, inactive]) => <div className="admin-directory-stat" key={label}><h3>{label}</h3><div><span><small>Active</small><strong>{active}</strong></span><span><small>Inactive</small><strong>{inactive}</strong></span></div></div>)}</div></>}
        {section === '' && !orderLoading && !orderError && <><h2 className="admin-overview-title">Errand activity</h2><div className="admin-stats">{[
          ['Open errands', 'OPEN'], ['Accepted errands', 'ACCEPTED'], ['Delivered errands', 'DELIVERED'],
          ['Completed errands', 'COMPLETED'], ['Expired errands', 'EXPIRED'], ['Cancelled errands', 'CANCELLED'],
          ['Failed errands', 'FAILED'],
        ].map(([label, status]) => <div className="admin-stat" key={label}><p>{label}</p><strong>{errands.filter(item => item.status === status).length}</strong></div>)}</div></>}
        {section === '' && <div className="admin-overview-grid"><section className="admin-panel"><div className="admin-panel-head"><h2>Supplier directory</h2><Link to="/admin/suppliers">Manage suppliers →</Link></div></section><section className="admin-panel"><div className="admin-panel-head"><h2>Supplier categories</h2><Link to="/admin/categories">Manage categories →</Link></div></section><section className="admin-panel"><div className="admin-panel-head"><h2>Campus buildings</h2><Link to="/admin/buildings">Manage buildings →</Link></div></section><section className="admin-panel"><div className="admin-panel-head"><h2>All errands</h2><Link to="/admin/errands">View all errands →</Link></div></section><section className="admin-panel"><div className="admin-panel-head"><h2>Users and administrators</h2><Link to="/admin/users">Manage users →</Link></div></section></div>}
        {section === 'users' && <AdminUsers />}
        {section === 'suppliers' && !loading && <section className="admin-panel"><div className="admin-panel-head"><h2>Supplier directory</h2><span className="admin-muted">{supplierCountLabel}</span></div><div className="admin-toolbar"><label>Status<select value={listingStatus} onChange={event => { setListingStatus(event.target.value as ListingStatus); setPage(0) }}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="admin-search">Search suppliers<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></label><label>Category<select value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(0) }}><option value="">All categories</option>{[...activeCategories, ...inactiveCategories].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Building<select value={buildingId} onChange={event => { setBuildingId(event.target.value); setPage(0) }}><option value="">All buildings</option>{[...activeBuildings, ...inactiveBuildings].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="admin-table-scroll"><table><thead><tr><th>Supplier</th><th>Category</th><th>Location</th><th>Hours</th><th>Status</th><th>Actions</th></tr></thead><tbody>{paginatedSuppliers.map(item => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.description || 'No description'}</small></td><td>{item.category.name}</td><td>{item.building.name}<small>{item.floor ? `Floor ${item.floor}` : 'Floor unspecified'}</small></td><td>{item.openingTime && item.closingTime ? `${formatSupplierTime(item.openingTime)}–${formatSupplierTime(item.closingTime)}` : 'Not provided'}</td><td><Badge status={item.status} /></td><td><button onClick={() => setEditingSupplier(toDraft(item, activeCategories, activeBuildings))}>Edit</button> <button onClick={() => listingStatus === 'active' ? setConfirming({ label: `Deactivate ${item.name}?`, action: () => runLifecycle(() => deactivateSupplier(item.id), `${item.name} deactivated.`) }) : void runLifecycle(() => reactivateSupplier(item.id), `${item.name} reactivated.`)}>{listingStatus === 'active' ? 'Deactivate' : 'Reactivate'}</button></td></tr>)}</tbody></table>{!visibleSuppliers.length && <div className="admin-empty">No suppliers match the selected filters.</div>}</div><Pagination page={supplierPage} totalItems={visibleSuppliers.length} onChange={setPage} /></section>}
        {(section === 'categories' || section === 'buildings') && !loading && <section className="admin-panel"><div className="admin-toolbar"><label>Status<select value={listingStatus} onChange={event => { setListingStatus(event.target.value as ListingStatus); setPage(0) }}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="admin-search">Search by name<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder={`Search ${section}…`} /></label></div><div className="admin-panel-head"><h2>{section === 'categories' ? 'Supplier categories' : 'Campus buildings'}</h2><span className="admin-muted">{referenceCountLabel}</span></div><div className="admin-directory">{paginatedReferenceItems.map(item => <div key={item.id}><span className="admin-directory-icon">{section === 'categories' ? '◇' : '▥'}</span><div><strong>{item.name}</strong><small>{activeSuppliers.filter(supplier => (section === 'categories' ? supplier.category.id : supplier.building.id) === item.id).length} active suppliers</small><button onClick={() => setEditingReference({ kind: section, item })}>Rename</button> <button onClick={() => listingStatus === 'active' ? setConfirming({ label: `Deactivate ${item.name}?`, action: () => runLifecycle(() => section === 'categories' ? deactivateCategory(item.id) : deactivateBuilding(item.id), `${item.name} deactivated.`) }) : void runLifecycle(() => section === 'categories' ? reactivateCategory(item.id) : reactivateBuilding(item.id), `${item.name} reactivated.`)}>{listingStatus === 'active' ? 'Deactivate' : 'Reactivate'}</button></div><Badge status={item.status} /></div>)}</div>{!visibleReferenceItems.length && <div className="admin-empty">No {section} match that name.</div>}<Pagination page={referencePage} totalItems={visibleReferenceItems.length} onChange={setPage} /></section>}
        {section === 'errands' && <>{orderLoading && <p role="status" className="admin-muted">Loading errands…</p>}{orderError && <p role="alert" className="admin-error">{orderError}</p>}{!orderLoading && !orderError && <section className="admin-panel"><div className="admin-panel-head"><h2>All errands</h2><span className="admin-muted">{visibleErrands.length} of {errands.length} errands</span></div><div className="admin-toolbar"><label className="admin-search">Search by item or ID<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="Order item or errand ID…" /></label><label>Status<select value={errandStatus} onChange={event => { setErrandStatus(event.target.value); setPage(0) }}><option value="">All statuses</option>{['OPEN', 'ACCEPTED', 'DELIVERED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED'].map(item => <option key={item} value={item}>{item}</option>)}</select></label><label>Supplier<select value={errandSupplierId} onChange={event => { setErrandSupplierId(event.target.value); setPage(0) }}><option value="">All suppliers</option>{[...activeSuppliers, ...inactiveSuppliers].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Delivery building<select value={buildingId} onChange={event => { setBuildingId(event.target.value); setPage(0) }}><option value="">All buildings</option>{[...activeBuildings, ...inactiveBuildings].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Sort by<select value={sort} onChange={event => { setSort(event.target.value); setPage(0) }}><option value="recent">Newest first</option><option value="oldest">Oldest first</option><option value="credits-high">Highest credits</option><option value="credits-low">Lowest credits</option></select></label></div>{errandsTable(paginatedErrands)}<Pagination page={errandPage} totalItems={visibleErrands.length} onChange={setPage} /></section>}</>}
        {!title && <Link to="/admin">Return to overview →</Link>}<p className="admin-footnote">CampusCouriers Administration · All times in Singapore time</p>
      </main></div>
    {editingSupplier && <SupplierForm supplier={editingSupplier} categories={activeCategories} buildings={activeBuildings} save={saveSupplier} close={() => setEditingSupplier(null)} />}
    {editingReference && <ReferenceForm kind={editingReference.kind} item={editingReference.item} save={name => saveReference(editingReference.kind, editingReference.item, name)} close={() => setEditingReference(null)} />}
    {confirming && <Modal title={confirming.label} close={() => setConfirming(null)}><p>This resource will no longer be available for new supplier or errand selections.</p><div className="admin-dialog-actions"><button onClick={() => setConfirming(null)}>Cancel</button><button className="admin-primary" onClick={() => void confirming.action()}>Confirm</button></div></Modal>}
    {actionError && <Modal title="Unable to complete action" close={() => setActionError('')}><p role="alert" className="admin-error">{actionError}</p><div className="admin-dialog-actions"><button className="admin-primary" onClick={() => setActionError('')}>Close</button></div></Modal>}
    {selectedErrand && <Modal title={selectedErrand.id} close={() => setSelectedErrand(null)}><Badge status={selectedErrand.status} /><h3 className="admin-detail-title">{selectedErrand.required_item}</h3><dl className="admin-details">{[['Supplier', supplierNames.get(selectedErrand.supplier_id) ?? selectedErrand.supplier_id], ['Requester', profiles[selectedErrand.requester_id] ?? selectedErrand.requester_id], ['Courier', selectedErrand.courier_id ? profiles[selectedErrand.courier_id] ?? selectedErrand.courier_id : 'Unassigned'], ['Delivery building', buildingNames.get(selectedErrand.delivery_building_id) ?? selectedErrand.delivery_building_id], ['Delivery floor', selectedErrand.delivery_floor ?? 'Not specified'], ['Credits', selectedErrand.credit_value], ['Created', formatTime(selectedErrand.created_at)], ['Expires', formatTime(selectedErrand.expires_at)], ['Accepted', formatTime(selectedErrand.accepted_at)], ['Delivered', formatTime(selectedErrand.delivered_at)], ['Completed', formatTime(selectedErrand.completed_at)], ['Failed', formatTime(selectedErrand.failed_at)], ['Cancelled', formatTime(selectedErrand.cancelled_at)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{selectedErrand.failure_reason && <p className="admin-error"><strong>Failure reason:</strong> {selectedErrand.failure_reason}</p>}</Modal>}
  </div>
}
