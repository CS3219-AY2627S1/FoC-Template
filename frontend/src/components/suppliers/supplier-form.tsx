"use client"

import { useCallback, useState } from "react"
import { LocateIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { AddressSearch } from "@/components/maps/address-search"
import { LocationMap } from "@/components/maps/location-map"
import { coordinates, type AddressResult, type MapPoint } from "@/lib/map-provider"
import type { SupplierInput } from "@/lib/suppliers"

type Values = Record<keyof SupplierInput, string>
type Errors = Partial<Record<keyof SupplierInput, string>>

const EMPTY: Values = {
  name: "",
  type: "",
  building: "",
  floor: "",
  locationDescription: "",
  latitude: "",
  longitude: "",
  openingTime: "09:00",
  closingTime: "18:00",
  imageUrl: "",
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Mirrors the Supplier Service rules so most mistakes are caught before a round trip. */
function validate(values: Values): Errors {
  const errors: Errors = {}
  if (!values.name.trim()) errors.name = "Enter a name."
  if (!values.type.trim()) errors.type = "Enter a type, e.g. Food or Printing."
  if (!values.building.trim()) errors.building = "Enter the building."
  const lat = Number(values.latitude)
  if (values.latitude.trim() === "" || !Number.isFinite(lat) || lat < -90 || lat > 90)
    errors.latitude = "Latitude must be between -90 and 90."
  const lng = Number(values.longitude)
  if (values.longitude.trim() === "" || !Number.isFinite(lng) || lng < -180 || lng > 180)
    errors.longitude = "Longitude must be between -180 and 180."
  if (!TIME.test(values.openingTime)) errors.openingTime = "Use a 24-hour time like 09:00."
  if (!TIME.test(values.closingTime)) errors.closingTime = "Use a 24-hour time like 18:00."
  if (values.imageUrl.trim() && !/^https?:\/\/\S+$/.test(values.imageUrl.trim()))
    errors.imageUrl = "Enter an http(s) link or leave it empty."
  return errors
}

function toInput(values: Values): SupplierInput {
  return {
    name: values.name.trim(),
    type: values.type.trim(),
    building: values.building.trim(),
    floor: values.floor.trim(),
    locationDescription: values.locationDescription.trim(),
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
    openingTime: values.openingTime,
    closingTime: values.closingTime,
    imageUrl: values.imageUrl.trim(),
  }
}

export function SupplierForm({
  initial,
  types,
  submitLabel,
  onSubmit,
  onCancel,
  locationPicker = false,
}: {
  initial?: SupplierInput
  types: string[]
  submitLabel: string
  onSubmit: (input: SupplierInput) => Promise<void>
  onCancel: () => void
  locationPicker?: boolean
}) {
  const [values, setValues] = useState<Values>(
    initial
      ? { ...initial, latitude: String(initial.latitude), longitude: String(initial.longitude) }
      : EMPTY,
  )
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<AddressResult | null>(null)
  const point = coordinates(values.latitude, values.longitude)
  const movePin = useCallback((location: MapPoint) => {
    setValues((current) => ({ ...current, latitude: location.latitude.toFixed(6), longitude: location.longitude.toFixed(6) }))
    setErrors((current) => ({ ...current, latitude: undefined, longitude: undefined }))
  }, [])
  const pinAdjusted = selectedAddress && point && (Math.abs(selectedAddress.latitude - point.latitude) > 0.000001 || Math.abs(selectedAddress.longitude - point.longitude) > 0.000001)

  const set = (field: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (p) =>
        setValues((v) => ({ ...v, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })),
      () => toast.error("Allow location access to fill in the coordinates."),
    )
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    try {
      await onSubmit(toInput(values))
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors: Errors = {}
        error.details?.forEach((d) => {
          if (d.field && d.field in EMPTY) fieldErrors[d.field as keyof SupplierInput] = d.message
        })
        setErrors(fieldErrors)
        setFormError(error.status === 409 ? "A supplier with this name already exists in that building." : error.message)
      } else {
        setFormError("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const field = (name: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <Field data-invalid={Boolean(errors[name])}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} value={values[name]} onChange={set(name)} aria-invalid={Boolean(errors[name])} {...props} />
      {hint && !errors[name] && <FieldDescription>{hint}</FieldDescription>}
      {errors[name] && <FieldError>{errors[name]}</FieldError>}
    </Field>
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        {field("name", "Name", { maxLength: 100, required: true, autoFocus: !initial })}
        <div className="grid gap-5 sm:grid-cols-2">
          {field("type", "Type", { maxLength: 40, required: true, list: "supplier-types" }, "e.g. Food, Food/Coffee, Printing, Shopping")}
          {field("building", "Building", { maxLength: 100, required: true })}
        </div>
        <datalist id="supplier-types">
          {types.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <div className="grid gap-5 sm:grid-cols-2">
          {field("floor", "Floor", { maxLength: 10 }, "Optional, e.g. 1 or B1")}
          <Field data-invalid={Boolean(errors.locationDescription)}>
            <FieldLabel htmlFor="locationDescription">Where to find it</FieldLabel>
            <Textarea
              id="locationDescription"
              value={values.locationDescription}
              onChange={set("locationDescription")}
              maxLength={200}
              rows={2}
              placeholder="e.g. Opposite LT16"
            />
            {errors.locationDescription && <FieldError>{errors.locationDescription}</FieldError>}
          </Field>
        </div>
        {locationPicker && <div className="space-y-4 rounded-xl border p-4">
          <AddressSearch disabled={submitting} onSelect={(address) => {
            setSelectedAddress(address)
            movePin(address)
            setValues((current) => ({ ...current, locationDescription: current.locationDescription || address.label.slice(0, 200) }))
          }} />
          {selectedAddress && <div className="space-y-1 text-sm">
            <p className="font-medium">Selected address</p><p>{selectedAddress.label}</p>
            {pinAdjusted && <p className="text-xs text-muted-foreground">Pin adjusted from this address. The coordinates below specify the exact position.</p>}
          </div>}
          <LocationMap label="Select supplier location" pins={point ? [{ ...point, id: "selected", name: "selected location" }] : []}
            editable disabled={submitting} onMove={movePin} />
        </div>}
        <div className="grid gap-5 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          {field("latitude", "Latitude", { inputMode: "decimal", required: true })}
          {field("longitude", "Longitude", { inputMode: "decimal", required: true })}
          <Button type="button" variant="outline" className="sm:mt-6" onClick={useMyLocation}>
            <LocateIcon />
            Use my location
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-5">
          {field("openingTime", "Opens", { type: "time", required: true })}
          {field("closingTime", "Closes", { type: "time", required: true }, "Earlier than opening = closes after midnight")}
        </div>
        {field("imageUrl", "Image link", { type: "url", maxLength: 500, placeholder: "https://…" }, "Optional")}
      </FieldGroup>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
