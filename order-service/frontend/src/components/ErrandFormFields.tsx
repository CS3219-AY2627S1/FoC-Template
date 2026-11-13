import type { CampusLocation } from '../api/sharedApi'
import { LocationCombobox } from './LocationCombobox'
import {
  DESCRIPTION_MAX,
  type Errors,
  type FieldName,
  type Fields,
  TITLE_MAX,
} from '../utils/errandForm'

/** The errand fields shared by Request a hand and Edit errand. */
export function ErrandFormFields({
  fields,
  errors,
  onChange,
  locations,
  locationsFailed,
  maxReward,
  rewardHint,
  deadlineHint = 'If nobody accepts by this time, your request expires.',
}: {
  fields: Fields
  errors: Errors
  onChange: (name: FieldName) => (value: string) => void
  locations: CampusLocation[] | undefined
  locationsFailed: boolean
  maxReward?: number
  rewardHint: string
  deadlineHint?: string
}) {
  return (
    <>
      <Field error={errors.title} id="field-title" label="Errand title">
        <input
          aria-describedby={errors.title ? 'field-title-error' : undefined}
          aria-invalid={Boolean(errors.title)}
          id="field-title"
          maxLength={TITLE_MAX}
          onChange={(event) => onChange('title')(event.target.value)}
          placeholder="Collect my printed notes"
          value={fields.title}
        />
      </Field>
      <LocationField
        error={errors.pickupLocationId}
        id="field-pickupLocationId"
        label="Pickup location"
        locations={locations}
        loadError={locationsFailed}
        onChange={onChange('pickupLocationId')}
        value={fields.pickupLocationId}
      />
      <LocationField
        error={errors.dropoffLocationId}
        id="field-dropoffLocationId"
        label="Drop-off location"
        locations={locations}
        loadError={locationsFailed}
        onChange={onChange('dropoffLocationId')}
        value={fields.dropoffLocationId}
      />
      <Field
        error={errors.pickupDeadline}
        hint={deadlineHint}
        id="field-pickupDeadline"
        label="Pick up by"
      >
        <input
          aria-describedby="field-pickupDeadline-hint"
          aria-invalid={Boolean(errors.pickupDeadline)}
          id="field-pickupDeadline"
          onChange={(event) => onChange('pickupDeadline')(event.target.value)}
          type="datetime-local"
          value={fields.pickupDeadline}
        />
      </Field>
      <Field error={errors.creditReward} hint={rewardHint} id="field-creditReward" label="Reward (credits)">
        <input
          aria-describedby="field-creditReward-hint"
          aria-invalid={Boolean(errors.creditReward)}
          id="field-creditReward"
          inputMode="numeric"
          max={maxReward}
          min={1}
          onChange={(event) => onChange('creditReward')(event.target.value)}
          placeholder="3"
          type="number"
          value={fields.creditReward}
        />
      </Field>
      <Field error={errors.description} id="field-description" label="Description">
        <textarea
          aria-invalid={Boolean(errors.description)}
          id="field-description"
          maxLength={DESCRIPTION_MAX}
          onChange={(event) => onChange('description')(event.target.value)}
          placeholder="What to collect, who to ask, where to meet."
          rows={4}
          value={fields.description}
        />
      </Field>
    </>
  )
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

function LocationField({
  id,
  label,
  value,
  onChange,
  locations,
  loadError,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  locations: CampusLocation[] | undefined
  loadError: boolean
  error?: string
}) {
  const message =
    error ?? (loadError ? "We can't load campus locations right now." : undefined)
  return (
    <Field error={message} id={id} label={label}>
      <LocationCombobox
        describedBy={message ? `${id}-error` : undefined}
        id={id}
        invalid={Boolean(error)}
        locations={locations}
        onChange={onChange}
        value={value}
      />
    </Field>
  )
}
