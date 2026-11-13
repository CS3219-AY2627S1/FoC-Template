// AI-assisted (Claude), reviewed and tested by Maliha
import { useEffect, useState } from "react"
import OpenBadge from "../OpenBadge"
import { ApiError } from "../../api/client"
import {
  CATEGORIES, categoryLabel, createSupplier, deleteSupplier, getSuppliers, supplierLocation, updateSupplier,
  type Supplier, type SupplierFields,
} from "../../api/suppliers"
import { TableMessage, inputCls, tdCls, thCls } from "./table"

// Form keeps everything as strings, converted on save
type Form = Omit<SupplierFields, "floor"> & { floor: string; opensAt: string; closesAt: string }

const EMPTY: Form = {
  name: "", type: "food", buildingName: "", locationDescription: "", floor: "1",
  latitude: "", longitude: "", opensAt: "09:00", closesAt: "21:00",
}

const toForm = (s: Supplier): Form => ({
  ...EMPTY,
  name: s.name,
  type: s.type,
  buildingName: s.buildingName,
  locationDescription: s.locationDescription,
  floor: String(s.floor),
  latitude: s.latitude,
  longitude: s.longitude,
})

const TEXT_FIELDS: { k: keyof Form; label: string; ph: string }[] = [
  { k: "name",                label: "Name",        ph: "e.g. Starbucks" },
  { k: "buildingName",        label: "Building",    ph: "e.g. COM3" },
  { k: "locationDescription", label: "Where in the building", ph: "e.g. Next to the lift lobby" },
  { k: "floor",               label: "Level",       ph: "1" },
  { k: "latitude",            label: "Latitude",    ph: "1.2949" },
  { k: "longitude",           label: "Longitude",   ph: "103.7737" },
]

export default function SuppliersSection() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState("")

  // null = closed, "new" = adding, otherwise the supplier being edited
  const [editing, setEditing] = useState<Supplier | "new" | null>(null)
  const [form, setForm]       = useState<Form>(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [formError, setFormError] = useState("")

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null)

  const load = () => {
    setLoading(true)
    setError("")
    getSuppliers()
      .then(setSuppliers)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load suppliers."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const openForm = (s: Supplier | "new") => {
    setEditing(s)
    setForm(s === "new" ? EMPTY : toForm(s))
    setFormError("")
  }

  const save = () => {
    if (!editing) return
    const { opensAt, closesAt, floor, ...rest } = form
    const fields: SupplierFields = { ...rest, floor: Number(floor) }

    setSaving(true)
    setFormError("")
    const request = editing === "new"
      ? createSupplier(fields, opensAt, closesAt)
      : updateSupplier(editing, fields)

    request
      .then(() => { setEditing(null); load() })
      .catch((err) => {
        // 409 on edit = changed since this list was loaded
        if (err instanceof ApiError && err.status === 409 && editing !== "new") {
          setFormError("Someone else changed this supplier. Close and reopen it to get the latest.")
          load()
        } else {
          setFormError(err instanceof Error ? err.message : "Could not save supplier.")
        }
      })
      .finally(() => setSaving(false))
  }

  const remove = (id: number) => {
    setRowError(null)
    deleteSupplier(id)
      .then(() => { setConfirmDelete(null); load() })
      .catch((err) => setRowError({ id, message: err instanceof Error ? err.message : "Could not delete." }))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-[#162A46]">Supplier Management</h2>
        <button
          onClick={() => openForm("new")}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#1A4A36] text-white text-xs font-medium rounded-lg hover:bg-[#163D2C] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Supplier
        </button>
      </div>

      <div className="bg-white border border-[#E4E8E6] rounded-xl overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {["Name", "Location", "Type", "Now", ""].map((h) => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(loading || error || suppliers.length === 0) ? (
              <TableMessage
                colSpan={5}
                loading={loading}
                loadingText="Loading suppliers…"
                error={error}
                onRetry={load}
                emptyText="No suppliers yet."
              />
            ) : suppliers.map((s, i) => (
              <tr key={s.supplierId} className={i < suppliers.length - 1 ? "border-b border-[#E4E8E6]" : ""}>
                <td className={`${tdCls} font-medium`}>{s.name}</td>
                <td className={`${tdCls} text-[#3F6B5A]`}>{supplierLocation(s)}</td>
                <td className={tdCls}>
                  <span className="bg-[#F7F9F8] border border-[#E4E8E6] px-2 py-0.5 rounded text-[10px] text-[#3F6B5A] font-medium">
                    {categoryLabel(s.type)}
                  </span>
                </td>
                <td className={tdCls}><OpenBadge isOpen={s.isOpen} /></td>
                <td className={`${tdCls} text-right`}>
                  {confirmDelete === s.supplierId ? (
                    <div className="flex gap-3 justify-end whitespace-nowrap">
                      <span className="text-[#3F6B5A]">Delete?</span>
                      <button onClick={() => remove(s.supplierId)} className="text-red-600 font-semibold">Yes</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-[#3F6B5A] font-medium">No</button>
                    </div>
                  ) : (
                    <div className="flex gap-4 justify-end">
                      <button onClick={() => openForm(s)} className="text-[#3F6B5A] hover:text-[#1A4A36] text-xs font-medium">
                        Edit
                      </button>
                      <button onClick={() => setConfirmDelete(s.supplierId)} className="text-red-400 hover:text-red-600 text-xs font-medium">
                        Delete
                      </button>
                    </div>
                  )}
                  {rowError?.id === s.supplierId && <p className="text-[11px] text-red-600 mt-1">{rowError.message}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-[#162A46] mb-5">
              {editing === "new" ? "Add Supplier" : `Edit ${editing.name}`}
            </h3>

            <div className="grid grid-cols-2 gap-4 mb-5">
              {TEXT_FIELDS.map(({ k, label, ph }) => (
                <div key={k} className={k === "name" || k === "locationDescription" ? "col-span-2" : ""}>
                  <label className="block text-xs font-medium text-[#1B2522] mb-1.5">{label}</label>
                  <input
                    placeholder={ph}
                    inputMode={k === "floor" || k === "latitude" || k === "longitude" ? "decimal" : undefined}
                    value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              ))}

              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#1B2522] mb-1.5">Category</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Form["type"] }))}
                  className={inputCls}
                >
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              {/* hours only on create; supplier-service changes them per day after that */}
              {editing === "new" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#1B2522] mb-1.5">Opens (daily)</label>
                    <input type="time" value={form.opensAt} onChange={(e) => setForm((f) => ({ ...f, opensAt: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1B2522] mb-1.5">Closes (daily)</label>
                    <input type="time" value={form.closesAt} onChange={(e) => setForm((f) => ({ ...f, closesAt: e.target.value }))} className={inputCls} />
                  </div>
                </>
              )}
            </div>

            {formError && <p className="text-xs text-red-600 mb-4">{formError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-2.5 border border-[#E4E8E6] text-[#1B2522] text-sm font-medium rounded-lg hover:bg-[#F7F9F8] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] disabled:opacity-60 transition-colors"
              >
                {saving ? "Saving…" : editing === "new" ? "Add Supplier" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}