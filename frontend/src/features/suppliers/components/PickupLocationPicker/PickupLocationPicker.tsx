import { usePickupLocations } from '../../hooks/usePickupLocations'
import styles from './PickupLocationPicker.module.scss'

export type PickupSelection = { id: string; name: string; address: string }
export const PickupLocationPicker = ({
  value,
  onChange,
  error,
  disabled,
}: {
  value: PickupSelection | null
  onChange: (value: PickupSelection | null) => void
  error?: string
  disabled?: boolean
}) => {
  const query = usePickupLocations(true)
  const locations = query.data ?? []
  return (
    <div className={styles.field}>
      <label htmlFor="pickup">Pickup location *</label>
      <select
        id="pickup"
        value={value?.id ?? ''}
        onChange={(event) =>
          onChange(
            locations.find((location) => location.id === event.target.value) ??
              null,
          )
        }
        disabled={disabled || query.isPending}
        aria-invalid={!!error}
        aria-describedby="pickup-help"
      >
        <option value="">Choose a pickup location</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name} — {location.address}
          </option>
        ))}
      </select>
      <small id="pickup-help">
        {error ??
          (query.isPending
            ? 'Loading locations…'
            : (value?.address ?? 'Choose an active campus pickup location.'))}
      </small>
      {query.error && (
        <div role="alert">
          Unable to load pickup locations.{' '}
          <button
            type="button"
            onClick={() => {
              void query.refetch()
            }}
          >
            Retry
          </button>
        </div>
      )}
      {query.isSuccess && !locations.length && (
        <p>No pickup locations are available.</p>
      )}
    </div>
  )
}
