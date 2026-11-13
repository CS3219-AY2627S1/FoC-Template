import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { Switch } from '@base-ui/react/switch'
import { Toast } from '@base-ui/react/toast'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useSetSupplierActive, useSuppliers } from '../../hooks/useSuppliers'
import { useSupplierRealtimeUpdates } from '../../hooks/useSupplierRealtimeUpdates'
import {
  categoryLabels,
  formatLocation,
  getErrorMessage,
} from '../../utils/supplierFormat'
import { formatWeeklyHours } from '../../utils/openingHours'
import {
  hasActiveFilters,
  toCategoryParam,
  toSupplierFilters,
} from '../../utils/supplierFilters'
import { SUPPLIER_CATEGORIES } from '../../types/supplier.types'
import type { Supplier, SupplierListSearch } from '../../types/supplier.types'
import ui from '../../styles/supplier.module.scss'
import styles from './SupplierListPage.module.scss'

const SEARCH_DEBOUNCE_MS = 300

export const SupplierListPage = () => {
  useSupplierRealtimeUpdates()

  // filters live in the URL, back or forward or shared links will keepp the filters
  const filters = useSearch({ from: '/admin/suppliers' })
  const selectedCategories = toSupplierFilters(filters).category ?? []
  const navigate = useNavigate({ from: '/admin/suppliers' })
  const updateFilters = (patch: SupplierListSearch) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  const [searchText, setSearchText] = useState(filters.q ?? '')
  const [pendingDeactivation, setPendingDeactivation] =
    useState<Supplier | null>(null)
  const suppliers = useSuppliers(toSupplierFilters(filters))
  const setActive = useSetSupplierActive()
  const toast = Toast.useToastManager()

  // add typed text to the URL once the user pauses
  useEffect(() => {
    const q = searchText.trim()
    if (q === (filters.q ?? '')) return
    const timer = setTimeout(
      () => updateFilters({ q: q || undefined }),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [searchText])

  // keep check the current filters
  useEffect(() => {
    if ((filters.q ?? '') !== searchText.trim()) setSearchText(filters.q ?? '')
  }, [filters.q])

  const visibleSuppliers = suppliers.data ?? []
  const filtered = hasActiveFilters(filters)

  const changeActive = (supplier: Supplier, active: boolean) =>
    setActive.mutate(
      { id: supplier.id, active },
      {
        onSuccess: () => {
          setPendingDeactivation(null)
          toast.add({
            type: 'success',
            title: `${supplier.name} was ${active ? 'reactivated' : 'deactivated'}.`,
          })
        },
        onError: (error) =>
          toast.add({ type: 'error', title: getErrorMessage(error) }),
      },
    )

  return (
    <section className={ui.page}>
      <header className={ui.header}>
        <h1 className={ui.title}>Supplier Management</h1>
        <Link
          to="/admin/suppliers/new"
          className={`${ui.button} ${ui.primary}`}
        >
          + Add Supplier
        </Link>
      </header>

      <div className={`${ui.card} ${styles.filters}`}>
        <div className={styles.filterRow}>
          <Input
            type="search"
            placeholder="Search by name, building or location"
            aria-label="Search suppliers"
            className={`${ui.input} ${styles.search}`}
            value={searchText}
            onValueChange={setSearchText}
          />
          <label className={styles.switchLabel}>
            <Switch.Root
              className={styles.switch}
              checked={Boolean(filters.inactive)}
              onCheckedChange={(checked) =>
                updateFilters({ inactive: checked || undefined })
              }
            >
              <Switch.Thumb className={styles.thumb} />
            </Switch.Root>
            Show deactivated
          </label>
        </div>

        <div className={styles.filterRow}>
          <ToggleGroup
            multiple
            aria-label="Filter by category"
            className={styles.chips}
            value={selectedCategories}
            onValueChange={(value) =>
              updateFilters({ category: toCategoryParam(value) })
            }
          >
            {SUPPLIER_CATEGORIES.map((category) => (
              <Toggle key={category} value={category} className={styles.chip}>
                {categoryLabels[category]}
              </Toggle>
            ))}
          </ToggleGroup>
          <Toggle
            className={`${styles.chip} ${styles.openNowChip}`}
            pressed={Boolean(filters.openNow)}
            onPressedChange={(pressed) =>
              updateFilters({ openNow: pressed || undefined })
            }
          >
            <span className={styles.dot} aria-hidden="true" />
            Open now
          </Toggle>
        </div>
      </div>

      <div className={styles.resultBar} aria-live="polite">
        <span className={ui.muted}>
          {suppliers.isSuccess &&
            `${visibleSuppliers.length} ${visibleSuppliers.length === 1 ? 'supplier' : 'suppliers'}`}
          {suppliers.isFetching && suppliers.isSuccess && ' · updating…'}
        </span>
        {filtered && (
          <Button
            className={styles.clear}
            onClick={() =>
              navigate({
                search: (prev) => ({ inactive: prev.inactive }),
                replace: true,
              })
            }
          >
            Clear filters
          </Button>
        )}
      </div>

      {suppliers.isPending && <p className={ui.muted}>Loading suppliers…</p>}
      {suppliers.isError && (
        <p className={ui.alert} role="alert">
          {getErrorMessage(suppliers.error)}
        </p>
      )}
      {suppliers.isSuccess && (
        <div
          className={`${ui.card} ${styles.tableWrapper}`}
          data-stale={suppliers.isPlaceholderData || undefined}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Location</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {visibleSuppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>
                    <span className={styles.name}>{supplier.name}</span>
                    {!supplier.active && (
                      <span className={styles.badge}>Deactivated</span>
                    )}
                  </td>
                  <td>{categoryLabels[supplier.category]}</td>
                  <td>{formatLocation(supplier)}</td>
                  <td className={styles.nowrap}>
                    {formatWeeklyHours(supplier.openingHours).map((line) => (
                      <span key={line} className={styles.hoursLine}>
                        {line}
                      </span>
                    ))}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Link
                        to="/admin/suppliers/$supplierId/edit"
                        params={{ supplierId: supplier.id }}
                        className={`${ui.button} ${ui.small}`}
                      >
                        Edit
                      </Link>
                      {supplier.active ? (
                        <Button
                          className={`${ui.button} ${ui.small} ${ui.danger}`}
                          onClick={() => setPendingDeactivation(supplier)}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          className={`${ui.button} ${ui.small}`}
                          disabled={setActive.isPending}
                          onClick={() => changeActive(supplier, true)}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visibleSuppliers.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    {filtered
                      ? 'No suppliers match these filters.'
                      : 'No suppliers found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog.Root
        open={pendingDeactivation !== null}
        onOpenChange={(open) => !open && setPendingDeactivation(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={styles.backdrop} />
          <AlertDialog.Popup className={styles.dialog}>
            <AlertDialog.Title className={styles.dialogTitle}>
              Deactivate this supplier?
            </AlertDialog.Title>
            <AlertDialog.Description className={ui.muted}>
              {pendingDeactivation?.name} will be hidden from users and can no
              longer get new errands. You can reactivate it later.
            </AlertDialog.Description>
            <div className={styles.dialogActions}>
              <AlertDialog.Close className={ui.button}>
                Cancel
              </AlertDialog.Close>
              <Button
                className={`${ui.button} ${ui.danger}`}
                disabled={setActive.isPending}
                onClick={() =>
                  pendingDeactivation &&
                  changeActive(pendingDeactivation, false)
                }
              >
                Deactivate
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  )
}
