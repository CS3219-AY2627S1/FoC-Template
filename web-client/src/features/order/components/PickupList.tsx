import { useEffect, useRef, useState } from "react"
import type { SubmitEvent } from "react"
import { useSuppliers, useSupplierFilterValues } from '@/api/supplier/suppliers'
import type { Supplier, } from '@/api/supplier/types'
// SupplierStatus 
import { EmptyState } from '@/components/EmptyState'
import { Pagination } from '@/components/Pagination'
import { QueryView } from '@/components/QueryView'
import type { SelectOption } from '@/components/SelectField'
import { SelectField } from "@/components/SelectField"
import { TextField } from '@/components/TextField'
import { AvailabilityText } from './AvailabilityText'
import { OpenBadge } from './OpenBadge'
import { SupplierThumbnail } from './SupplierThumbnail'

type PickUpListProps = {
    selectedId?: string
    onSelect: (supplier: Supplier) => void
    onClose: () => void

}

export function PickUpList({ selectedId, onSelect, onClose}: PickUpListProps) {
    const ref = useRef<HTMLDialogElement>(null)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [q, setQ] = useState('')
    const [type, setType] = useState('')

    const suppliers = useSuppliers({ q: q || undefined, type: type || undefined, page })
    
    const filterValues = useSupplierFilterValues()
    const typeOptions: SelectOption[] = [
        { value: '', label: 'All types' },
        ...(filterValues.data?.types ?? []).map((value) => ({ value, label: value })),
    ]

    const filtered = q !== '' || type !== '' 
    const total = suppliers.data?.total

    useEffect(() => {
        const dialog = ref.current
        if (dialog && !dialog.open) dialog.showModal()
    }, [])

    function handleSearch(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault()
        setQ(search.trim())
        setPage(1)
    }

    function clearFilters() {
        setSearch('')
        setQ('')
        setType('')
        setPage(1)
    }

    return (
        <dialog ref={ref} onClose={onClose} onClick={(event) => { if (event.target === ref.current) ref.current?.close() }}
            className="m-0 h-dvh max-h-none w-dvw max-w-none bg-backdrop p-0 text-ink backdrop:bg-[rgb(0_0_0/0.4)] sm:m-auto sm:h-auto sm:max-h-[85dvh] sm:w-full sm:max-w-2xl sm:rounded-panel">
            <div className="flex h-dvh flex-col sm:h-auto sm:max-h-[85dvh] p-5">
                <header className="flex items-center justify-between gap-3">
                    <h2 className="text-ink">Pick up from</h2>
                    <button type="button" className="ds-btn ds-btn--primary" onClick={() => ref.current?.close()}>
                        Close
                    </button>
                </header>
                <form role="search" noValidate onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-4 md:items-end p-3">
                    <div className="md:col-span-2">
                        <TextField label="Search name of location" name="q" type="search" value={search} onChange={setSearch} />
                    </div>
                    <SelectField
                        label="Type"
                        name="type"
                        value={type}
                        onChange={(value) => setType(value)}
                        options={typeOptions}
                    />
                    <button type="submit" className="ds-btn ds-btn--glass">
                        Search
                    </button>
                </form>
                
                {/* List */}
                <div>
                    <QueryView
                        query={suppliers}
                        loadingLabel="Loading suppliers"
                        isEmpty={(result) => result.items.length === 0}
                        empty={
                        <EmptyState
                            title={filtered ? 'No suppliers match these filters' : total ? `There is no page ${page}` : 'No suppliers yet'}
                            action={
                            filtered || total ? (
                                <button type="button" className="ds-btn ds-btn--glass" onClick={clearFilters}>
                                {filtered ? 'Clear filters' : 'Go to page 1'}
                                </button>
                            ) : (
                                <p>No existing suppliers</p>
                            )
                            }
                        />
                        }
                    >
                        {(result) => (
                            <>
                                <ul className="ds-surface ds-rows">
                                {result.items.map((supplier) => (
                                    <li key={supplier.id}>
                                    {/* The whole row is one button, so it is easy to hit on a phone. */}
                                    <button
                                        type="button"
                                        aria-pressed={supplier.id === selectedId}
                                        onClick={() => onSelect(supplier)}
                                        className={`flex w-full min-w-0 items-start gap-3 p-4 text-left ${
                                        supplier.id === selectedId ? 'bg-surface-selected' : ''
                                        }`}
                                    >
                                        <SupplierThumbnail supplier={supplier} />
                                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <p className="min-w-0 wrap-anywhere">{supplier.name}</p>
                                            <OpenBadge supplier={supplier} />
                                        </div>
                                        <p className="font-normal text-muted wrap-anywhere">
                                            {supplier.type} · {supplier.zone} · {supplier.address}
                                        </p>
                                        <p className="text-sm font-normal text-ink">
                                            <AvailabilityText availability={supplier.availability} />
                                        </p>
                                        </div>
                                    </button>
                                    </li>
                                ))}
                                </ul>
                                <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPageChange={setPage} />
                            </>
                            )}
                    </QueryView>
                </div>
            </div>
        </dialog>
    )
}