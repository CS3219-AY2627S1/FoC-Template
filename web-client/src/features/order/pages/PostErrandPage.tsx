import { MapPin } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router'
import type { ComponentType, SubmitEvent } from 'react'
import { useRecommendation } from '@/api/recommendation/recommendations'
import { useCreateOrder } from '@/api/order/order'
import { useWalkingRoute } from '@/api/supplier/suppliers'
import { LoadingState } from '@/components/LoadingState'
import { QueryView } from '@/components/QueryView'
import { SubmitButton } from '@/components/SubmitButton'
import { Page } from '@/components/Page'
import type { Supplier } from '@/api/supplier/types'
import { SupplierThumbnail } from '../components/SupplierThumbnail'
import { PickUpList } from '../components/PickupList'
import { TextField } from '@/components/TextField'
import { ApiError, fieldErrorsOf } from '@/lib/http'
import { FormError } from '@/components/FormError'
import type { DropOffPickerProps, MapPoint } from '../components/DropOffPicker'
import { MapUnavailable } from '../components/MapUnavailable'
import { WalkSummary } from '../components/WalkSummary'

// The map library is only downloaded when the requester opens the map.
const DropOffPicker = lazy<ComponentType<DropOffPickerProps>>(() =>
  import('../components/DropOffPicker')
    .then((module) => ({ default: module.DropOffPicker }))
    .catch(() => ({ default: MapUnavailable })),
)

// datetime-local expects "YYYY-MM-DDTHH:mm" in the browser's time. The default is the first
// full hour at least an hour from now, so on most days it is today.
function defaultNeededBy(now = new Date()): string {
  const at = new Date(now.getTime() + 60 * 60 * 1000)
  if (at.getMinutes() || at.getSeconds() || at.getMilliseconds()) at.setHours(at.getHours() + 1, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

export function PostErrandPage() {
  const recommend = useRecommendation()
  const create = useCreateOrder()
  const navigate = useNavigate()
  const fieldErrors = fieldErrorsOf(create.error)

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const supplierId = supplier?.id ?? ''
  const [location, setLocation] = useState('')
  const [dropOff, setDropOff] = useState<MapPoint | null>(null)
  const [pickingDropOff, setPickingDropOff] = useState(false)
  const dropOffError = fieldErrors.deliveryLatitude?.[0] ?? fieldErrors.deliveryLongitude?.[0]
  const [neededBy, setNeededBy] = useState(defaultNeededBy)
  const [itemsText, setItemsText] = useState('')
  const [credits, setCredits] = useState('')
  const [picking, setPicking] = useState(false)

  // Measured as soon as both ends are chosen, so the walk shows before posting.
  const walk = useWalkingRoute(supplierId, dropOff)
  const pickup =
    supplier && supplier.latitude !== null && supplier.longitude !== null
      ? { latitude: supplier.latitude, longitude: supplier.longitude }
      : null

  function suggest() {
    const items = itemsText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    recommend.mutate(
      { supplierId, location, neededBy: neededBy ? new Date(neededBy).toISOString() : '', items },
      {
        onSuccess: (data) => {
          setCredits(String(data.recommendedCredits))
          const f = data.features
          console.group(`Credit recommendation: ${data.recommendedCredits} credits (${data.basis}, scorer ${data.version})`)
          if (data.basis === 'default') {
            console.log('Cold start: too few completed errands to trust this supplier\'s averages, so the formula is skipped and a flat default is returned.')
          }
          console.log("Market rate (supplier's recent average reward):", f.marketRate)
          console.log('Weights in use — a=items, b=urgency, c=distance:', f.weights)
          console.table({
            'items (a)': { weight: f.weights.a, value: f.items, supplierAvg: f.avgItems, contribution: f.itemFactor },
            'urgency (b)': { weight: f.weights.b, value: f.urgency, supplierAvg: '—', contribution: f.urgencyFactor },
            'distance (c)': { weight: f.weights.c, value: f.distance, supplierAvg: f.avgDist, contribution: f.distanceFactor },
          })
          console.log(`multiplier = 1 + ${f.itemFactor.toFixed(3)} (items) + ${f.urgencyFactor.toFixed(3)} (urgency) + ${f.distanceFactor.toFixed(3)} (distance) = ${f.multiplier.toFixed(3)}`)
          console.log(`credits = clamp(round(${f.marketRate} × ${f.multiplier.toFixed(3)}), 1, 50) = ${data.recommendedCredits}`)
          console.groupEnd()
        },
      },
    )
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (create.isPending) return

    const items = itemsText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    // The order-service decides whether the time is valid and in the future, and names the field if not.
    const when = new Date(neededBy)
    create.mutate({
      supplierId,
      deliveryLocation: location.trim(),
      deliveryLatitude: dropOff?.latitude,
      deliveryLongitude: dropOff?.longitude,
      neededByTime: Number.isNaN(when.getTime())
        ? neededBy
        : when.toISOString(),
      itemLines: items,
      creditReward: Number(credits),
    },
    {
      // Straight to the list the new errand is in; the notice shows once at the top.
      onSuccess: () =>
        navigate('/errands?tab=requests', {
          state: { notice: 'Errand posted. Couriers can accept it now.' },
        }),
    },
    )
  }

  const suggestion = recommend.data

  return (
    <Page title="Post an errand" subtitle="Describe the errand and set the credits you'll offer">
      <form noValidate className="ds-surface grid max-w-xl grid-cols-1 gap-4 p-5" onSubmit={handleSubmit}>
          <FormError
            error={create.error}
            fields={['supplierId', 'deliveryLocation', 'deliveryLatitude', 'deliveryLongitude', 'neededByTime', 'itemLines', 'creditReward']}
          />
          {/* Choose pick up */}
          <div className="grid grid-cols-1 gap-2">
            <span>
              Picking up from
            </span>
            {supplier ? (
              <div className="flex items-center gap-3">
                <SupplierThumbnail supplier={supplier} />
                <div className="grid grid-cols-1 min-w-0 flex-1 gap-1">
                  <p className="wrap-anywhere">{supplier.name}</p>
                  <p className="text-sm text-muted wrap-anywhere">
                    {supplier.type} · {supplier.zone}
                  </p>
                </div>
                <button type="button" className="ds-btn ds-btn--glass shrink-0" onClick={() => setPicking(true)}>
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-labelledby="pickup-label"
                className="ds-btn ds-btn--glass justify-self-start"
                onClick={() => setPicking(true)}
              >
                Choose a pickup location
              </button>
            )}
            {fieldErrors.supplierId?.[0] && <p className='text-danger'>{fieldErrors.supplierId?.[0]}</p>}
          </div>
          <TextField
            label="Drop-off location"
            name="location"
            value={location}
            onChange={setLocation}
            hint="Where the errand ends, e.g. COM3 or Kent Ridge MRT"
            errors={fieldErrors.deliveryLocation}
          />
          {/* The point next to the typed address, so the walk can be measured and routed. */}
          <div className="grid grid-cols-1 gap-2">
            <span id="dropoff-point-label">Drop-off point on the map</span>
            <p role="status" className="nums-tabular wrap-anywhere text-muted">
              {dropOff ? `Marked: ${dropOff.latitude}, ${dropOff.longitude}` : 'Not picked yet'}
            </p>
            <button
              type="button"
              aria-describedby="dropoff-point-label"
              aria-expanded={pickingDropOff}
              className="ds-btn ds-btn--glass justify-self-start"
              onClick={() => setPickingDropOff(!pickingDropOff)}
            >
              <MapPin aria-hidden="true" className="size-5 shrink-0" />
              {pickingDropOff ? 'Close the map' : dropOff ? 'Change on map' : 'Pick on map'}
            </button>
            {dropOffError && <p className="text-danger">Drop-off point {dropOffError}</p>}
            {pickingDropOff && (
              <Suspense fallback={<LoadingState label="Loading map" rows={2} />}>
                <DropOffPicker
                  start={dropOff}
                  pickup={pickup}
                  onUse={(point) => {
                    setDropOff(point)
                    setPickingDropOff(false)
                  }}
                  onCancel={() => setPickingDropOff(false)}
                />
              </Suspense>
            )}
          </div>
          {supplier && dropOff && (
            <div className="grid grid-cols-1 gap-2">
              <span>Walk from the pickup</span>
              <QueryView query={walk} loadingLabel="Measuring the walk">
                {(route) => <WalkSummary walk={route} />}
              </QueryView>
            </div>
          )}
          <TextField label="Needed by" name="neededBy" type="datetime-local" value={neededBy} onChange={setNeededBy} errors={fieldErrors.neededByTime}/>
          <TextField label="Items" name="items" value={itemsText} onChange={setItemsText} hint="Comma-separated, e.g. coffee, sandwich" errors={fieldErrors.itemLines}/>

          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <TextField label="Credits" name="credits" value={credits} onChange={setCredits} inputMode="numeric" errors={fieldErrors.creditReward}/>
              </div>
              <button
                type="button"
                onClick={suggest}
                aria-disabled={recommend.isPending || undefined}
                className="ds-btn ds-btn--glass mb-1 shrink-0"
              >
                {recommend.isPending ? 'Suggesting…' : 'Suggest'}
              </button>
            </div>

            {suggestion && (
              <div className="grid grid-cols-1 gap-1 text-sm">
                <p className="text-muted">
                  Suggested <span className="font-medium text-default">{suggestion.recommendedCredits}</span>{' '}
                  {suggestion.basis === 'formula' ? 'from the market rate' : '(default for a new supplier)'}
                </p>
              </div>
            )}
            {recommend.isError && (
              <p className="text-sm text-danger">
                {recommend.error instanceof ApiError ? recommend.error.message : 'Could not get a suggestion.'}
              </p>
            )}
          </div>

          <SubmitButton
            pending={create.isPending}
            pendingLabel="Posting…"
          >
            Post errand
          </SubmitButton>
        </form>
      {/* show the pick up list */}
      {picking && (
        <PickUpList
          selectedId={supplierId}
          onSelect={(chosen) => {
            setSupplier(chosen)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Page>
  )
}
