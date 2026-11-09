"use client"

import { useCallback, useState, type ComponentProps } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PencilIcon, PlusIcon, StoreIcon } from "lucide-react"
import { toast } from "sonner"

import { SupplierForm } from "@/components/suppliers/supplier-form"
import { SupplierBadges } from "@/components/suppliers/supplier-badges"
import { LocationMap } from "@/components/maps/location-map"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAdminApi } from "@/hooks/use-admin-api"
import { useAdminPage } from "@/hooks/use-admin-page"
import type { AdminSearch } from "@/lib/admin-api"
import { changedFields, toInput, type Supplier, type SupplierInput } from "@/lib/suppliers"
import {
  AdminConfirmation, AdminDetails, AdminHeading, AdminLoadState, AdminPagination,
  AdminSearchForm, CopyId, adminDate,
} from "./admin-ui"

function AdminSupplierForm(props: Omit<ComponentProps<typeof SupplierForm>, "types">) {
  const api = useAdminApi()
  const load = useCallback((signal: AbortSignal) => api.supplierTypes(signal), [api])
  const { data } = useAdminPage(load)
  // Suggestions are optional: the service also accepts a manually entered type.
  return <SupplierForm {...props} types={data ?? []} />
}

function AdminSupplierDetails({ supplierId, onBack }: { supplierId: string; onBack: () => void }) {
  const api = useAdminApi()
  const load = useCallback((signal: AbortSignal) => api.supplier(supplierId, signal), [api, supplierId])
  const { data, loading, error, refresh } = useAdminPage(load)
  const [updated, setUpdated] = useState<Supplier | null>(null)
  const selected = updated ?? data
  const [confirm, setConfirm] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // SupplierForm shows the error when this throws, so the dialog stays open for corrections.
  async function save(input: SupplierInput) {
    if (!selected) return
    const changes = changedFields(toInput(selected), input)
    if (Object.keys(changes).length === 0) {
      setEditOpen(false)
      toast("No changes to save.")
      return
    }
    setBusy(true)
    try {
      setUpdated(await api.updateSupplier(supplierId, changes))
      setEditOpen(false)
      toast.success("Supplier updated.")
    } finally { setBusy(false) }
  }

  async function reactivate() {
    setBusy(true)
    setActionError(null)
    try {
      setUpdated(await api.reactivateSupplier(supplierId))
      toast.success("Supplier location reactivated.")
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not reactivate the supplier.")
    } finally { setBusy(false) }
  }

  async function deactivate() {
    setBusy(true)
    setActionError(null)
    try {
      setUpdated(await api.deactivateSupplier(supplierId))
      setConfirm(false)
      toast.success("Supplier location deactivated.")
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not deactivate the supplier.")
    } finally { setBusy(false) }
  }

  return <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <Button variant="outline" disabled={busy} onClick={onBack}>Back to suppliers</Button>
      <AdminHeading title={selected?.name ?? "Supplier details"} description="Review this campus pickup or delivery location." />
      <AdminLoadState loading={loading} error={error} empty={false} retry={refresh} />
      {selected && <>
        <Card>
          <CardHeader><CardTitle className="text-xl">Admin actions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled={busy} onClick={() => { setActionError(null); setEditOpen(true) }}>
                <PencilIcon />Edit details</Button>
              {selected.active
                ? <Button variant="destructive" disabled={busy} aria-label={"Deactivate " + selected.name}
                    onClick={() => { setActionError(null); setConfirm(true) }}>Deactivate</Button>
                : <Button variant="outline" disabled={busy} aria-label={"Reactivate " + selected.name}
                    onClick={() => void reactivate()}>{busy ? "Reactivating…" : "Reactivate"}</Button>}
            </div>
            {actionError && !confirm && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-xl">Location details</CardTitle><SupplierBadges supplier={selected} />
          </div></CardHeader>
          <CardContent>
            <AdminDetails fields={[
              ["Supplier ID", <CopyId key="id" id={selected.id} />], ["Name", selected.name],
              ["Type", selected.type], ["Building", selected.building], ["Floor", selected.floor],
              ["Location description", selected.locationDescription], ["Latitude", selected.latitude], ["Longitude", selected.longitude],
              ["Opening time", selected.openingTime], ["Closing time", selected.closingTime],
              ["Status", selected.active ? "Active" : "Inactive"], ["Open now", selected.openNow ? "Yes" : "No"],
              ["Image URL", selected.imageUrl], ["Created", adminDate(selected.createdAt)], ["Updated", adminDate(selected.updatedAt)],
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xl">Location map</CardTitle></CardHeader>
          <CardContent><LocationMap label="Supplier location" pins={[{ id: selected.id, name: selected.name, latitude: selected.latitude, longitude: selected.longitude }]} /></CardContent>
        </Card>
      </>}
      <AdminConfirmation open={confirm} title="Deactivate this supplier location?"
        description={"Deactivate " + (selected?.name ?? "this location") + "? The location will remain in the catalogue as inactive."}
        busy={busy} error={actionError} onClose={() => { setConfirm(false); setActionError(null) }} onConfirm={() => void deactivate()} />
      <Dialog open={editOpen} onOpenChange={(open) => { if (!busy) setEditOpen(open) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Edit supplier</DialogTitle><DialogDescription>Changes apply immediately to new errands.</DialogDescription></DialogHeader>
          {selected && <AdminSupplierForm locationPicker initial={toInput(selected)} submitLabel="Save changes"
            onCancel={() => { if (!busy) setEditOpen(false) }} onSubmit={save} />}
        </DialogContent>
      </Dialog>
  </section>
}

export function AdminSuppliers({ initialSupplierId }: { initialSupplierId?: string }) {
  const router = useRouter()
  return initialSupplierId
    ? <AdminSupplierDetails key={initialSupplierId} supplierId={initialSupplierId} onBack={() => router.push("/admin/suppliers")} />
    : <AdminSupplierList />
}

function AdminSupplierList() {
  const api = useAdminApi()
  const [query, setQuery] = useState<AdminSearch>({ page: 1, searchBy: "name", q: "" })
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const load = useCallback((signal: AbortSignal) => api.suppliers(query, signal), [api, query])
  const { data, loading, error, refresh } = useAdminPage(load)

  return <section className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
    <AdminHeading title="Suppliers" description="Manage campus pickup and delivery locations.">
      <Button onClick={() => setCreateOpen(true)}><PlusIcon />Create supplier</Button>
    </AdminHeading>
    <AdminSearchForm label="Suppliers" onSearch={(searchBy, q) => setQuery({ page: 1, searchBy, q })} />
    <AdminLoadState loading={loading} error={error} empty={data?.items.length === 0} retry={refresh} />
    {data && data.items.length > 0 && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.items.map((supplier) => <Card key={supplier.id}>
          <CardHeader><div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><StoreIcon className="mb-3 size-5 text-muted-foreground" />
              <CardTitle><CopyId id={supplier.id} name={supplier.name} /></CardTitle></div>
            <SupplierBadges supplier={supplier} />
          </div></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground"><p>{supplier.type} · {supplier.building}</p>
              <p>{supplier.openingTime} – {supplier.closingTime}</p></div>
            <div className="flex flex-wrap gap-2"><Link className={buttonVariants({ size: "sm", variant: "outline" })}
              href={"/admin/suppliers/" + encodeURIComponent(supplier.id)}>View details</Link>
            </div>
          </CardContent>
        </Card>)}
      </div>
      <AdminPagination {...data} onPage={(page) => setQuery((current) => ({ ...current, page }))} />
    </>}
    <Dialog open={createOpen} onOpenChange={(open) => { if (!createBusy) setCreateOpen(open) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Create supplier</DialogTitle><DialogDescription>Add a campus pickup or delivery location.</DialogDescription></DialogHeader>
        <AdminSupplierForm locationPicker submitLabel="Create supplier"
          onCancel={() => { if (!createBusy) setCreateOpen(false) }} onSubmit={async (input) => {
            setCreateBusy(true)
            try {
              await api.createSupplier(input)
              setCreateOpen(false); setQuery({ page: 1, searchBy: "name", q: "" }); refresh()
              toast.success("Supplier created.")
            } finally { setCreateBusy(false) }
          }} />
      </DialogContent>
    </Dialog>
  </section>
}
