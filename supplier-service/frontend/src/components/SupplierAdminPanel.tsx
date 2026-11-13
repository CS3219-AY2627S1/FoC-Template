// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-22
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { useEffect, useState, type SubmitEvent } from 'react'
import type {
  CreateSupplierRequest,
  Day,
  ServiceType,
  Supplier,
  SupplierApi,
  UpdateSupplierRequest,
} from '@relay/contracts'
import { Day as Days, ServiceType as ServiceTypes } from '@relay/contracts'
import { RelayButton, RelayFormSurface } from '@relay/ui'

const dayOptions: Array<{ value: Day; label: string }> = [
  { value: Days.Monday, label: 'Mon' },
  { value: Days.Tuesday, label: 'Tue' },
  { value: Days.Wednesday, label: 'Wed' },
  { value: Days.Thursday, label: 'Thu' },
  { value: Days.Friday, label: 'Fri' },
  { value: Days.Saturday, label: 'Sat' },
  { value: Days.Sunday, label: 'Sun' },
]

const serviceOptions: Array<{ value: ServiceType; label: string }> = [
  { value: ServiceTypes.Food, label: 'Food' },
  { value: ServiceTypes.Drink, label: 'Drink' },
  { value: ServiceTypes.Shopping, label: 'Shopping' },
  { value: ServiceTypes.Printing, label: 'Printing' },
  { value: ServiceTypes.Parcel, label: 'Parcel' },
]

type Props = {
  api: Pick<SupplierApi, 'addSupplier' | 'updateSupplier' | 'removeSupplier'>
  supplier?: Supplier
  onSaved: (supplier: Supplier) => void
  onDeleted: (id: string) => void
  onClose: () => void
}

export function SupplierAdminPanel({ api, supplier, onSaved, onDeleted, onClose }: Props) {
  const editing = Boolean(supplier)
  const [name, setName] = useState('')
  const [lat, setLat] = useState('1.2966')
  const [lng, setLng] = useState('103.7764')
  const [buildingName, setBuildingName] = useState('')
  const [floorNumber, setFloorNumber] = useState('1')
  const [isOperational, setIsOperational] = useState(true)
  const [openingTime, setOpeningTime] = useState('09:00')
  const [closingTime, setClosingTime] = useState('18:00')
  const [daysOfWeek, setDaysOfWeek] = useState<Day[]>(dayOptions.map((day) => day.value))
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([ServiceTypes.Food])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!supplier) return
    setName(supplier.name)
    setLat(String(supplier.location.lat))
    setLng(String(supplier.location.lng))
    setBuildingName(supplier.location.buildingName)
    setFloorNumber(String(supplier.location.floorNumber))
    setIsOperational(supplier.isOperational)
    setOpeningTime(supplier.operatingHours.openingTime)
    setClosingTime(supplier.operatingHours.closingTime)
    setDaysOfWeek(supplier.operatingHours.daysOfWeek)
    setServiceTypes(supplier.serviceTypes)
  }, [supplier])

  function toggleDay(day: Day) {
    setDaysOfWeek((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((left, right) => left - right),
    )
  }

  function toggleServiceType(serviceType: ServiceType) {
    setServiceTypes((current) =>
      current.includes(serviceType)
        ? current.filter((value) => value !== serviceType)
        : [...current, serviceType],
    )
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    setError('')
    if (
      !name.trim() ||
      !buildingName.trim() ||
      daysOfWeek.length === 0 ||
      serviceTypes.length === 0
    ) {
      setError('Complete the required fields and select at least one day and service type.')
      return
    }

    const location = {
      lat: Number(lat),
      lng: Number(lng),
      buildingName: buildingName.trim(),
      floorNumber: Number(floorNumber),
    }
    if (![location.lat, location.lng, location.floorNumber].every(Number.isFinite)) {
      setError('Latitude, longitude, and floor number must be valid numbers.')
      return
    }

    const payload: CreateSupplierRequest = {
      name: name.trim(),
      location,
      isOperational,
      operatingHours: { openingTime, closingTime, daysOfWeek },
      serviceTypes,
    }

    setSaving(true)
    try {
      const response =
        editing && supplier
          ? await api.updateSupplier(supplier.id, payload satisfies UpdateSupplierRequest)
          : await api.addSupplier(payload)
      onSaved(response.supplier)
      if (!editing) onClose()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save supplier.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!supplier || !window.confirm(`Delete ${supplier.name}?`)) return
    setSaving(true)
    setError('')
    try {
      await api.removeSupplier(supplier.id)
      onDeleted(supplier.id)
      onClose()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete supplier.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <RelayFormSurface
      headerVariant="card"
      as="aside"
      className="supplier-admin-panel relay-mobile-sheet-surface"
      title={editing ? 'Update supplier' : 'Add supplier'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Name
          <input
            className="ios-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <div className="supplier-admin-grid">
          <label>
            Latitude
            <input
              className="ios-input"
              value={lat}
              onChange={(event) => setLat(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            Longitude
            <input
              className="ios-input"
              value={lng}
              onChange={(event) => setLng(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            Building
            <input
              className="ios-input"
              value={buildingName}
              onChange={(event) => setBuildingName(event.target.value)}
              required
            />
          </label>
          <label>
            Floor
            <input
              className="ios-input"
              value={floorNumber}
              onChange={(event) => setFloorNumber(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label>
            Opens
            <input
              className="ios-input"
              type="time"
              value={openingTime}
              onChange={(event) => setOpeningTime(event.target.value)}
            />
          </label>
          <label>
            Closes
            <input
              className="ios-input"
              type="time"
              value={closingTime}
              onChange={(event) => setClosingTime(event.target.value)}
            />
          </label>
        </div>
        <label className="supplier-admin-check">
          <input
            type="checkbox"
            checked={isOperational}
            onChange={(event) => setIsOperational(event.target.checked)}
          />{' '}
          Operational
        </label>
        <fieldset>
          <legend>Open days</legend>
          <div className="supplier-admin-options">
            {dayOptions.map((day) => (
              <label key={day.value}>
                <input
                  type="checkbox"
                  checked={daysOfWeek.includes(day.value)}
                  onChange={() => toggleDay(day.value)}
                />
                {day.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Services</legend>
          <div className="supplier-admin-options">
            {serviceOptions.map((service) => (
              <label key={service.value}>
                <input
                  type="checkbox"
                  checked={serviceTypes.includes(service.value)}
                  onChange={() => toggleServiceType(service.value)}
                />
                {service.label}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="supplier-error" role="alert">
            {error}
          </p>
        )}
        <div className="supplier-admin-actions">
          <RelayButton variant="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add supplier'}
          </RelayButton>
          {editing && (
            <RelayButton
              variant="danger"
              type="button"
              onClick={() => void remove()}
              disabled={saving}
            >
              Delete
            </RelayButton>
          )}
        </div>
      </form>
    </RelayFormSurface>
  )
}
