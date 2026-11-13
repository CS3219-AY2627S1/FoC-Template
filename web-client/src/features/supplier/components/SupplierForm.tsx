import { MapPin } from 'lucide-react'
import { lazy, Suspense, useRef, useState } from 'react'
import type { ComponentType, ReactNode, SubmitEvent } from 'react'
import { weekdays } from '@/api/supplier/types'
import type { Supplier, SupplierInput, Weekday } from '@/api/supplier/types'
import { Field } from '@/components/Field'
import { FormError } from '@/components/FormError'
import { LoadingState } from '@/components/LoadingState'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/TextField'
import { fieldErrorsOf } from '@/lib/http'
import type { LocationPickerProps, MapPoint } from './LocationPicker'
import { MapUnavailable } from './MapUnavailable'

// The map library is only downloaded when an administrator opens the map.
const LocationPicker = lazy<ComponentType<LocationPickerProps>>(() =>
  import('./LocationPicker')
    .then((module) => ({ default: module.LocationPicker }))
    .catch(() => ({ default: MapUnavailable })),
)

type DayValues = { opens: string; closes: string }

type SupplierFormValues = {
  name: string
  type: string
  zone: string
  building: string
  address: string
  description: string
  latitude: string
  longitude: string
  phone: string
  email: string
  hours: Record<Weekday, DayValues>
}

const dayLabels: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

const textFields = ['name', 'type', 'zone', 'building', 'address', 'description'] as const

function valuesOf(supplier: Supplier | undefined): SupplierFormValues {
  const hours = Object.fromEntries(weekdays.map((day) => [day, { opens: '', closes: '' }])) as Record<Weekday, DayValues>
  for (const { day, opens, closes } of supplier?.hours ?? []) hours[day] = { opens, closes }
  return {
    name: supplier?.name ?? '',
    type: supplier?.type ?? '',
    zone: supplier?.zone ?? '',
    building: supplier?.building ?? '',
    address: supplier?.address ?? '',
    description: supplier?.description ?? '',
    latitude: supplier?.latitude?.toString() ?? '',
    longitude: supplier?.longitude?.toString() ?? '',
    phone: supplier?.contact.phone ?? '',
    email: supplier?.contact.email ?? '',
    hours,
  }
}

// Blank is no coordinate. Text that does not read as a number goes as typed, so the
// supplier-service refuses it with its own message instead of the client guessing (N5.4).
function coordinate(text: string): number | string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : trimmed
}

// Where the map opens: the coordinates in the fields, when they name a place on Earth. This only
// places the map; the supplier-service still checks what is sent.
function pointOf(latitude: string, longitude: string): MapPoint | null {
  if (latitude.trim() === '' || longitude.trim() === '') return null
  const point = { latitude: Number(latitude), longitude: Number(longitude) }
  return Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180 ? point : null
}

// A day with both times blank is left out, which the supplier-service reads as closed all day.
function inputOf(values: SupplierFormValues): { input: SupplierInput; sentDays: Weekday[] } {
  const sentDays = weekdays.filter((day) => values.hours[day].opens.trim() !== '' || values.hours[day].closes.trim() !== '')
  return {
    sentDays,
    input: {
      name: values.name,
      type: values.type,
      zone: values.zone,
      building: values.building,
      address: values.address,
      description: values.description,
      latitude: coordinate(values.latitude),
      longitude: coordinate(values.longitude),
      contact: { phone: values.phone, email: values.email },
      hours: sentDays.map((day) => ({ day, opens: values.hours[day].opens.trim(), closes: values.hours[day].closes.trim() })),
    },
  }
}

type SupplierFormProps = {
  // Absent when adding a new supplier.
  supplier?: Supplier
  onSubmit: (input: SupplierInput) => void
  pending: boolean
  error: unknown
  submitLabel: string
  pendingLabel: string
  // Shown next to the button, where the eye is after sending, e.g. a "Changes saved" notice.
  notice?: ReactNode
}

export function SupplierForm({ supplier, onSubmit, pending, error, submitLabel, pendingLabel, notice }: SupplierFormProps) {
  // Controlled fields: a refused request leaves every value the user typed in place (N5.4).
  const [values, setValues] = useState(() => valuesOf(supplier))
  // The supplier-service names an hours error by its position in the list that was sent, such as
  // hours[0].opens. The days that were sent turn that position back into a weekday.
  const [sentDays, setSentDays] = useState<Weekday[]>([])
  const fieldErrors = fieldErrorsOf(error)
  const [picking, setPicking] = useState(false)
  const [filledFromMap, setFilledFromMap] = useState(false)
  const pickButtonRef = useRef<HTMLButtonElement>(null)

  function openPicker() {
    setFilledFromMap(false)
    setPicking(true)
  }

  // The map and its buttons go away, so the focus returns to the button that opened it.
  function closePicker() {
    setPicking(false)
    pickButtonRef.current?.focus()
  }

  function applyMapPoint(point: MapPoint) {
    setValues({ ...values, latitude: String(point.latitude), longitude: String(point.longitude) })
    setFilledFromMap(true)
    closePicker()
  }

  function dayErrors(day: Weekday, part: keyof DayValues): string[] | undefined {
    const index = sentDays.indexOf(day)
    return index === -1 ? undefined : fieldErrors[`hours[${index}].${part}`]
  }

  function setText(field: (typeof textFields)[number] | 'latitude' | 'longitude' | 'phone' | 'email', value: string) {
    setValues({ ...values, [field]: value })
  }

  function setDay(day: Weekday, part: keyof DayValues, value: string) {
    setValues({ ...values, hours: { ...values.hours, [day]: { ...values.hours[day], [part]: value } } })
  }

  function copyMondayToEveryDay() {
    const monday = values.hours.monday
    setValues({ ...values, hours: Object.fromEntries(weekdays.map((day) => [day, { ...monday }])) as Record<Weekday, DayValues> })
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const { input, sentDays } = inputOf(values)
    setSentDays(sentDays)
    // "Save to keep them" has been done; the form's own notice says how it went.
    setFilledFromMap(false)
    onSubmit(input)
  }

  const shownFields = [
    ...textFields,
    'latitude',
    'longitude',
    'contact.phone',
    'contact.email',
    'hours',
    ...sentDays.flatMap((_, index) => [`hours[${index}].opens`, `hours[${index}].closes`]),
  ]

  return (
    <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-6">
      <section className="ds-surface grid grid-cols-1 gap-4 p-5">
        <h2>Details</h2>
        <TextField label="Name" name="name" value={values.name} onChange={(value) => setText('name', value)} errors={fieldErrors.name} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Type"
            name="type"
            hint="For example Food, Food/Coffee, Shopping or Printing"
            value={values.type}
            onChange={(value) => setText('type', value)}
            errors={fieldErrors.type}
          />
          <TextField
            label="Zone"
            name="zone"
            hint="The campus zone, for example Central or Computing"
            value={values.zone}
            onChange={(value) => setText('zone', value)}
            errors={fieldErrors.zone}
          />
          <TextField
            label="Building"
            name="building"
            value={values.building}
            onChange={(value) => setText('building', value)}
            errors={fieldErrors.building}
          />
          <TextField
            label="Address"
            name="address"
            hint="The line students see, for example COM3, Level 1"
            value={values.address}
            onChange={(value) => setText('address', value)}
            errors={fieldErrors.address}
          />
        </div>
        <Field label="How to find it" hint="Optional" errors={fieldErrors.description}>
          {(control) => (
            <textarea
              {...control}
              name="description"
              rows={3}
              value={values.description}
              onChange={(event) => setText('description', event.target.value)}
              className="ds-field"
            />
          )}
        </Field>
      </section>

      <section className="ds-surface grid grid-cols-1 gap-4 p-5">
        <h2>Opening hours</h2>
        <p className="text-muted">
          Times as HH:MM on the campus clock. Leave both times empty on a day it is closed. 24:00 is midnight at the
          end of the day, and a closing time before the opening time runs past midnight.
        </p>
        <button type="button" className="ds-btn ds-btn--text justify-self-start" onClick={copyMondayToEveryDay}>
          Use Monday's hours for every day
        </button>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {weekdays.map((day) => (
            <fieldset key={day} className="m-0 min-w-0 border-0 p-0">
              <legend className="ds-field-label">{dayLabels[day]}</legend>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Opens"
                  name={`${day}-opens`}
                  autoComplete="off"
                  value={values.hours[day].opens}
                  onChange={(value) => setDay(day, 'opens', value)}
                  errors={dayErrors(day, 'opens')}
                />
                <TextField
                  label="Closes"
                  name={`${day}-closes`}
                  autoComplete="off"
                  value={values.hours[day].closes}
                  onChange={(value) => setDay(day, 'closes', value)}
                  errors={dayErrors(day, 'closes')}
                />
              </div>
            </fieldset>
          ))}
        </div>
        {/* About the hours as a whole, such as no day at all. Phrased like a field message, so capitalised the same way. */}
        {fieldErrors.hours && (
          <p role="alert" className="ds-field-error">
            {fieldErrors.hours.map((message) => message.charAt(0).toUpperCase() + message.slice(1)).join('. ')}
          </p>
        )}
      </section>

      <section className="ds-surface grid grid-cols-1 gap-4 p-5">
        <h2>Contact and map</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Phone"
            name="phone"
            type="tel"
            inputMode="tel"
            hint="Optional"
            value={values.phone}
            onChange={(value) => setText('phone', value)}
            errors={fieldErrors['contact.phone']}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            hint="Optional"
            value={values.email}
            onChange={(value) => setText('email', value)}
            errors={fieldErrors['contact.email']}
          />
          <TextField
            label="Latitude"
            name="latitude"
            hint="Optional, together with longitude, for example 1.2966"
            value={values.latitude}
            onChange={(value) => setText('latitude', value)}
            errors={fieldErrors.latitude}
          />
          <TextField
            label="Longitude"
            name="longitude"
            hint="For example 103.7764"
            value={values.longitude}
            onChange={(value) => setText('longitude', value)}
            errors={fieldErrors.longitude}
          />
        </div>
        <div className="grid grid-cols-1 gap-3">
          <button
            ref={pickButtonRef}
            type="button"
            aria-expanded={picking}
            className="ds-btn ds-btn--glass justify-self-start"
            onClick={() => (picking ? closePicker() : openPicker())}
          >
            <MapPin aria-hidden="true" className="size-5 shrink-0" />
            {picking ? 'Close the map' : 'Pick on map'}
          </button>
          {/* Always rendered, so screen readers announce the text when it appears. */}
          <p role="status" className="text-muted empty:hidden">
            {filledFromMap ? 'Latitude and longitude are filled in from the map. Save to keep them.' : ''}
          </p>
          {picking && (
            <Suspense fallback={<LoadingState label="Loading map" rows={2} />}>
              <LocationPicker start={pointOf(values.latitude, values.longitude)} onUse={applyMapPoint} onCancel={closePicker} />
            </Suspense>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4">
        <FormError error={error} fields={shownFields} />
        {notice}
        <div className="grid grid-cols-1 md:grid-cols-3">
          <SubmitButton pending={pending} pendingLabel={pendingLabel}>
            {submitLabel}
          </SubmitButton>
        </div>
      </div>
    </form>
  )
}
