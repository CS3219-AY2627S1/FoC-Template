/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Created an in-memory mock store for the admin supplier CRUD screens. It mimics the
 *        Supplier Service admin behaviour recorded in SupplierServiceArchitecture.md (§6.2, §7.3,
 *        §7.5, §8.1): soft delete, reactivation of a matching soft-deleted supplier, uniqueness of
 *        name/type/location, `version` bumped on edit, computed `isOpen`. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
  *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Supplier objects now carry location_id, faculty_id and categories as {category, category_id} objects. Per the team's decision in chat;
 *        no other requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review:
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { suppliers as seedSuppliers, locationRefs, categoryRefs } from '../data/suppliers'

const AdminSuppliersContext = createContext(null)

const SGT = 'Asia/Singapore'

// Mirrors the §6.2 is_open rule, in Singapore time: a day-8 entry means always open; otherwise
// compare today's entry with the current time, treating close <= open as running past midnight.
// Simplification: an overnight entry is only checked against its own day, not the following one.
export function computeIsOpen(openingHours, now = new Date()) {
  if (openingHours.some((h) => h.day === 8)) return true
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SGT,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t) => parts.find((p) => p.type === t).value
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1
  const time = get('hour') + ':' + get('minute')
  const entry = openingHours.find((h) => h.day === day)
  if (!entry) return false
  if (entry.open === '00:00' && entry.close === '23:59') return true
  return entry.open < entry.close
    ? time >= entry.open && time < entry.close
    : time >= entry.open || time < entry.close
}

const stamp = () => new Date().toISOString()

// Admin responses carry the user shape plus isActive/isDeleted/createdOn/createdBy/updatedOn/
// version (§7.3). Two rows are pre-marked so the inactive and deleted states are visible.
const seed = seedSuppliers.map((s) => ({
  ...s,
  isActive: s.id !== 9,
  isDeleted: s.id === 14,
  createdOn: '2026-09-08T09:00:00.000Z',
  createdBy: 'admin',
  updatedOn: '2026-09-08T09:00:00.000Z',
  version: 1,
}))

const sameIdentity = (a, b) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
  a.type === b.type &&
  a.location_id === b.location_id

export function AdminSuppliersProvider({ children }) {
  const [items, setItems] = useState(seed)

  const getAdminSupplier = useCallback((id) => items.find((s) => s.id === Number(id)), [items])

  // `form` is the form state: { name, type, locationId, categoryIds, desc, is24h, openingHours,
  // photos, isActive }. Returns { ok, status, message, supplier } so screens can show the same
  // outcomes the API would: 201 created, 200 reactivated/updated, 404, 422.
  const save = useCallback(
    (form, { id }) => {
      const loc = locationRefs.find((l) => l.location_id === Number(form.locationId))
      const openingHours =
        form.type === 'Facility' || form.is24h
          ? [{ day: 8, open: '00:00', close: '23:59' }]
          : form.openingHours
      const photos = form.photos.map((p, i) => ({
        photoId: p.photoId,
        photoLocation: p.photoLocation,
        displayOrder: i,
      }))
      const fields = {
        name: form.name.trim(),
        type: form.type,
        location_id: loc.location_id,
        location: loc.location,
        faculty_id: loc.faculty_id,
        faculty: loc.faculty,
        level: 1,
        categories: categoryRefs
          .filter((c) => form.categoryIds.includes(c.category_id))
          .map(({ category, category_id }) => ({ category, category_id })),
        photos,
        desc: form.desc.trim(),
        openingHours,
        isOpen: computeIsOpen(openingHours),
      }

      const clash = items.find((s) => s.id !== Number(id) && sameIdentity(s, fields))

      if (id) {
        const current = items.find((s) => s.id === Number(id))
        if (!current || current.isDeleted) {
          return { ok: false, status: 404, message: 'Supplier not found.' }
        }
        if (clash) {
          return {
            ok: false,
            status: 422,
            message: 'A supplier with this name, type and location already exists.',
          }
        }
        const updated = {
          ...current,
          ...fields,
          isActive: form.isActive,
          updatedOn: stamp(),
          version: current.version + 1,
        }
        setItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
        return { ok: true, status: 200, supplier: updated }
      }

      if (clash && !clash.isDeleted) {
        return {
          ok: false,
          status: 422,
          message: 'A supplier with this name, type and location already exists.',
        }
      }
      if (clash && clash.isDeleted) {
        // Recreating an identical soft-deleted supplier reverses the delete (200, §6.2).
        const restored = {
          ...clash,
          ...fields,
          photos: photos.length ? photos : clash.photos,
          isActive: true,
          isDeleted: false,
          updatedOn: stamp(),
          version: clash.version + 1,
        }
        setItems((prev) => prev.map((s) => (s.id === restored.id ? restored : s)))
        return { ok: true, status: 200, supplier: restored, reactivated: true }
      }

      const created = {
        ...fields,
        id: Math.max(0, ...items.map((s) => s.id)) + 1,
        isActive: true,
        isDeleted: false,
        createdOn: stamp(),
        createdBy: 'admin',
        updatedOn: stamp(),
        version: 1,
      }
      setItems((prev) => [...prev, created])
      return { ok: true, status: 201, supplier: created }
    },
    [items],
  )

  // Soft delete: is_deleted = true, is_active unchanged, version bumped (§8.1).
  const remove = useCallback(
    (id) => {
      const current = items.find((s) => s.id === Number(id))
      if (!current || current.isDeleted) return { ok: false, status: 404 }
      setItems((prev) =>
        prev.map((s) =>
          s.id === current.id
            ? { ...s, isDeleted: true, updatedOn: stamp(), version: s.version + 1 }
            : s,
        ),
      )
      return { ok: true, status: 200 }
    },
    [items],
  )

  const value = useMemo(
    () => ({ items, getAdminSupplier, save, remove }),
    [items, getAdminSupplier, save, remove],
  )
  return <AdminSuppliersContext.Provider value={value}>{children}</AdminSuppliersContext.Provider>
}

export function useAdminSuppliers() {
  const ctx = useContext(AdminSuppliersContext)
  if (!ctx) throw new Error('useAdminSuppliers must be used inside AdminSuppliersProvider')
  return ctx
}
