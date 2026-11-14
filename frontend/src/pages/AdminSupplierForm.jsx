/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Created the admin supplier create/edit form mockup. Fields, photo limits and the
 *        Facility/Store and 24-hour behaviour follow SupplierServiceArchitecture.md §6.2, §7.3,
 *        §7.5 and §8.2 (POST/PUT multipart: name, type, location_id, category_id[], desc,
 *        openingHours[], is24h, isActive, version, photos). Visual/layout implementation only. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Connected the form to the Supplier Service: the edit form loads GET
 *        /api/v1/admin/suppliers/:id (location_id and category ids come straight from the response),
 *        and saving calls POST or PUT with multipart photos, the Idempotency-Key and the version. Field
 *        errors, 404 and 409 from the service are shown. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Reads isAdmin from the new AuthContext instead of DemoContext, per
 *        instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced native dropdowns with the requested searchable control.
 * Author review: Congchen
 */

import SearchableSelect from '../components/SearchableSelect'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2, Upload } from 'lucide-react'
import Button from '../components/Button'
import SupplierImage from '../components/SupplierImage'
import { useApiNotice } from '../components/ApiNotice'
import { AdminOnly } from './AdminSuppliers'
import { useApi, useReferenceData } from '../api/useApi'
import { createSupplier, getAdminSupplier, updateSupplier } from '../api/suppliers'
import { useAuth } from '../context/AuthContext'
import { DAY_NAMES } from '../data/suppliers'

const MAX_PHOTOS = 10
const MAX_BYTES = 5 * 1024 * 1024
const inputClass = 'h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink'

const emptyHours = [{ day: 1, open: '09:00', close: '18:00' }]

// The admin detail response carries location_id and each category's id, so nothing is looked up.
const initialState = (s) =>
  s
    ? {
        name: s.name,
        type: s.type,
        locationId: String(s.location_id),
        categoryIds: s.categories.map((c) => c.category_id),
        desc: s.desc ?? '',
        is24h: s.openingHours.some((h) => h.day === 8),
        openingHours: s.openingHours.some((h) => h.day === 8) ? emptyHours : s.openingHours.map((h) => ({ ...h })),
        photos: [...s.photos].sort((a, b) => a.displayOrder - b.displayOrder),
        isActive: s.isActive,
      }
    : {
        name: '',
        type: 'Store',
        locationId: '',
        categoryIds: [],
        desc: '',
        is24h: false,
        openingHours: emptyHours,
        photos: [],
        isActive: true,
      }

function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-sm text-ink-40">{hint}</p>}
      <div className="mt-1.5">{children}</div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-alert">
          {error}
        </p>
      )}
    </div>
  )
}

// Loads the supplier for an edit, then hands it to the form. A create skips the load.
export default function AdminSupplierForm() {
  const { id } = useParams()
  const { isAdmin } = useAuth()
  const { data, loading, error } = useApi(
    () => (id && isAdmin ? getAdminSupplier(id) : Promise.resolve(null)),
    [id, isAdmin],
  )
  const notice = useApiNotice({ loading: Boolean(id) && loading, error }, 'this supplier')

  if (id && (error?.status === 404 || error?.status === 422)) return <Navigate to="/admin/suppliers" replace />
  if (id && data?.isDeleted) return <Navigate to="/admin/suppliers" replace />

  return (
    <AdminOnly>
      {id && !data ? (
        <div className="page-width page-gutter py-6">{notice}</div>
      ) : (
        <SupplierForm key={data?.version ?? 'new'} existing={data} />
      )}
    </AdminOnly>
  )
}

function SupplierForm({ existing }) {
  const navigate = useNavigate()
  const { locations, categories } = useReferenceData()
  const editing = Boolean(existing)

  const [form, setForm] = useState(() => initialState(existing))
  const [errors, setErrors] = useState({})
  const [photoError, setPhotoError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const isFacility = form.type === 'Facility'
  const hoursLocked = isFacility || form.is24h

  const toggleCategory = (cid) =>
    set({
      categoryIds: form.categoryIds.includes(cid)
        ? form.categoryIds.filter((c) => c !== cid)
        : [...form.categoryIds, cid],
    })

  const setHour = (i, patch) =>
    set({ openingHours: form.openingHours.map((h, n) => (n === i ? { ...h, ...patch } : h)) })

  const usedDays = form.openingHours.map((h) => h.day)
  const nextDay = [1, 2, 3, 4, 5, 6, 7].find((d) => !usedDays.includes(d))

  const addPhotos = (fileList) => {
    let message = ''
    const accepted = []
    ;[...fileList].forEach((file) => {
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        message = file.name + ' is not a JPEG or PNG image.'
      } else if (file.size > MAX_BYTES) {
        message = file.name + ' is larger than 5 MB.'
      } else if (form.photos.length + accepted.length >= MAX_PHOTOS) {
        message = 'A supplier can have at most ' + MAX_PHOTOS + ' photos.'
      } else {
        // New files carry a placeholder id; the server swaps it for the persisted id (§8.2).
        accepted.push({
          photoId: 'placeholder-' + crypto.randomUUID(),
          photoLocation: URL.createObjectURL(file),
          displayOrder: 0,
          file,
        })
      }
    })
    setPhotoError(message)
    if (accepted.length) set({ photos: [...form.photos, ...accepted] })
  }

  const movePhoto = (i, dir) => {
    const next = [...form.photos]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    set({ photos: next })
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required.'
    if (!form.locationId) e.locationId = 'Choose a location.'
    if (!hoursLocked) {
      if (!form.openingHours.length) e.hours = 'Add at least one day of opening hours.'
      else if (form.openingHours.some((h) => h.open === h.close))
        e.hours = 'Opening and closing time cannot be equal. A 24-hour schedule must be entered as 00:00–23:59.'
    }
    return e
  }

  // The photo collection needs processing when a file was added or the kept photos changed order or number.
  const photosChanged = () => {
    if (!existing) return false
    const before = [...existing.photos].sort((a, b) => a.displayOrder - b.displayOrder).map((p) => p.photoId)
    const after = form.photos.map((p) => p.photoId)
    return before.length !== after.length || before.some((pid, i) => pid !== after[i])
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    setSubmitError('')
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const values = { ...form, locationId: Number(form.locationId) }
      const saved = editing
        ? await updateSupplier(existing.id, existing.version, values, photosChanged())
        : await createSupplier(values)
      navigate('/admin/suppliers', {
        state: {
          notice: editing
            ? saved.name + ' was updated.'
            : saved.version > 1
              ? saved.name + ' already existed as a deleted supplier, so it was restored and updated.'
              : saved.name + ' was created.',
        },
      })
    } catch (err) {
      if (err.status === 409 && editing) {
        setSubmitError('Someone else changed this supplier. Reload the page to see their changes, then edit again.')
      } else if (err.details.length) {
        setSubmitError(err.details.map((d) => d.message).join(' '))
      } else {
        setSubmitError(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-width page-gutter py-6 md:py-8">
      <Link
        to="/admin/suppliers"
        className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-ink-70 hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        All suppliers
      </Link>

      <h1 className="font-display mt-2 text-2xl font-bold text-ink md:text-3xl">
        {editing ? 'Edit ' + existing.name : 'Add supplier'}
      </h1>
      {editing && (
        <p className="mt-1 text-sm text-ink-40">
          Version {existing.version}. Saving sends this version; if someone else saved first the update is
          rejected (409).
        </p>
      )}

      <form onSubmit={submit} noValidate className="mt-6 max-w-2xl space-y-7">
        {submitError && (
          <p role="alert" className="rounded-btn border border-alert px-3 py-2 text-sm text-alert">
            {submitError}
          </p>
        )}

        <Field label="Name" htmlFor="name" error={errors.name}>
          <input id="name" className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>

        <Field
          label="Type"
          htmlFor="type"
          hint={isFacility ? 'Facilities are open 24 hours. Their hours are set automatically.' : undefined}
        >
          <SearchableSelect id="type" className={inputClass} value={form.type} onChange={(e) => set({ type: e.target.value })}>
            <option>Store</option>
            <option>Facility</option>
          </SearchableSelect>
        </Field>

        <Field label="Location" htmlFor="location" error={errors.locationId}>
          <SearchableSelect
            id="location"
            className={inputClass}
            value={form.locationId}
            onChange={(e) => set({ locationId: e.target.value })}
          >
            <option value="">Choose a location</option>
            {locations.map((l) => (
              <option key={l.location_id} value={l.location_id}>
                {l.location} · {l.faculty}
              </option>
            ))}
          </SearchableSelect>
        </Field>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">Categories</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = form.categoryIds.includes(c.category_id)
              return (
                <button
                  key={c.category_id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCategory(c.category_id)}
                  className={
                    'h-11 rounded-pill border px-4 text-sm font-medium transition-colors duration-150 md:h-10 ' +
                    (on
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-surface text-ink-70 hover:border-ink hover:text-ink')
                  }
                >
                  {c.category}
                </button>
              )
            })}
          </div>
        </fieldset>

        <Field label="Description" htmlFor="desc">
          <textarea
            id="desc"
            rows={4}
            className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-base text-ink"
            value={form.desc}
            onChange={(e) => set({ desc: e.target.value })}
          />
        </Field>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">Opening hours</legend>
          {isFacility ? (
            <p className="mt-1.5 text-sm text-ink-70">Open 24 hours, every day (set by the server).</p>
          ) : (
            <>
              <label className="mt-1.5 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-ink-70">
                <input
                  type="checkbox"
                  checked={form.is24h}
                  onChange={(e) => set({ is24h: e.target.checked })}
                  className="h-4 w-4 rounded-[4px] border-line text-ink focus:ring-blue"
                />
                Open 24 hours, 7 days a week
              </label>
              {!form.is24h && (
                <div className="mt-1 space-y-2">
                  {form.openingHours.map((h, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <SearchableSelect
                        aria-label="Day"
                        value={h.day}
                        onChange={(e) => setHour(i, { day: Number(e.target.value) })}
                        className="h-11 rounded-btn border border-line bg-surface px-2 text-sm text-ink"
                      >
                        {DAY_NAMES.slice(0, 7).map((name, n) => (
                          <option key={name} value={n + 1} disabled={usedDays.includes(n + 1) && h.day !== n + 1}>
                            {name}
                          </option>
                        ))}
                      </SearchableSelect>
                      <input
                        type="time"
                        aria-label="Opens"
                        value={h.open}
                        onChange={(e) => setHour(i, { open: e.target.value })}
                        className="h-11 rounded-btn border border-line bg-surface px-2 text-sm text-ink"
                      />
                      <span className="text-ink-40" aria-hidden="true">
                        –
                      </span>
                      <input
                        type="time"
                        aria-label="Closes"
                        value={h.close}
                        onChange={(e) => setHour(i, { close: e.target.value })}
                        className="h-11 rounded-btn border border-line bg-surface px-2 text-sm text-ink"
                      />
                      <button
                        type="button"
                        aria-label="Remove day"
                        onClick={() => set({ openingHours: form.openingHours.filter((_, n) => n !== i) })}
                        className="flex h-11 w-11 items-center justify-center rounded-btn text-ink-70 hover:bg-surface-alt"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  {nextDay && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        set({ openingHours: [...form.openingHours, { day: nextDay, open: '09:00', close: '18:00' }] })
                      }
                    >
                      <Plus size={14} aria-hidden="true" />
                      Add day
                    </Button>
                  )}
                </div>
              )}
              {errors.hours && (
                <p role="alert" className="mt-1.5 text-sm text-alert">
                  {errors.hours}
                </p>
              )}
            </>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">Photos</legend>
          <p className="mt-0.5 text-sm text-ink-40">
            Up to {MAX_PHOTOS} JPEG or PNG images, 5 MB each. The first photo is the cover; reorder with the arrows.
          </p>
          {form.photos.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {form.photos.map((p, i) => (
                <li key={p.photoId} className="card overflow-hidden">
                  <SupplierImage supplier={{ name: form.name || 'Photo', photos: [{ ...p, displayOrder: 0 }] }} />
                  <div className="flex items-center justify-between gap-1 p-1.5">
                    <span className="pl-1 text-xs text-ink-40">{i === 0 ? 'Cover' : '#' + (i + 1)}</span>
                    <span className="flex">
                      <button
                        type="button"
                        aria-label="Move earlier"
                        disabled={i === 0}
                        onClick={() => movePhoto(i, -1)}
                        className="flex h-9 w-9 items-center justify-center rounded-btn text-ink-70 hover:bg-surface-alt disabled:opacity-30"
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move later"
                        disabled={i === form.photos.length - 1}
                        onClick={() => movePhoto(i, 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-btn text-ink-70 hover:bg-surface-alt disabled:opacity-30"
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => set({ photos: form.photos.filter((_, n) => n !== i) })}
                        className="flex h-9 w-9 items-center justify-center rounded-btn text-alert hover:bg-surface-alt"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <label
            className={
              'mt-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-btn border border-line bg-surface px-4 text-sm font-medium text-ink hover:border-ink ' +
              (form.photos.length >= MAX_PHOTOS ? 'pointer-events-none opacity-50' : '')
            }
          >
            <Upload size={16} aria-hidden="true" />
            Add photos
            <input
              type="file"
              accept="image/jpeg,image/png"
              multiple
              className="sr-only"
              onChange={(e) => {
                addPhotos(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          {photoError && (
            <p role="alert" className="mt-1.5 text-sm text-alert">
              {photoError}
            </p>
          )}
        </fieldset>

        {editing && (
          <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 text-sm text-ink-70">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set({ isActive: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border-line text-ink focus:ring-blue"
            />
            <span>
              <span className="font-semibold text-ink">Active</span>
              <br />
              Inactive suppliers are hidden from users but stay in this list.
            </span>
          </label>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button as={Link} to="/admin/suppliers" variant="secondary" size="lg">
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create supplier'}
          </Button>
        </div>
      </form>
    </div>
  )
}
