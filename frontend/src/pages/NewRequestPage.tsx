/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the post-a-new-request form from the desktop and mobile
 *        mockups.
 * Reviewed by Ngooi Jun Sen.
 *
 * Covers UI FR6. The rules enforced here come from Order F1: at least one
 * credit (F1.2.1), both times in the future, and the acceptance expiry before
 * the delivery deadline (F1.4.1). The balance check mirrors Credit F3.2, which
 * rejects a reservation the requester cannot cover - checking it here only
 * saves the user a round trip; the service still decides.
 *
 * New drop-off places added with Claude Code (Claude Opus 5.5) on 2026-11-02:
 * a place described inline, located with the browser, and snapped to a known
 * point when the user is standing within 25 m of one. The campus map, added
 * the same day, picks a known point or drops a pin under the same rules.
 */

import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { CreditStepper, DateTimeField, SelectField, TextAreaField } from '../components/ui/Inputs';
import type { MapPoint } from '../components/map/DeliveryMap';
import { PickerField, type PickerOption } from '../components/ui/PickerField';
import { TextField } from '../components/ui/TextField';
import { errorMessage } from '../lib/api';
import { refreshCreditBalance, useCreditBalance } from '../lib/credit';
import { formatUntil, formatWhen, parseLocalInput, toLocalInput } from '../lib/format';
import {
  deliveryPointDetail,
  deliveryPointLabel,
  fetchCampusDeliveryPoints,
  fetchMyDeliveryPoints,
  isAllowedDropoff,
  nearbyDeliveryPoint,
  type DeliveryPoint,
} from '../lib/deliveryPoints';
import { createOrder, type NewDropoff } from '../lib/orders';
import type { Coordinates } from '../lib/useGeolocation';
import { fetchSuppliers, type Supplier } from '../lib/suppliers';
import styles from './NewRequestPage.module.css';

/** The delivery picker's value for "somewhere not on the list yet". */
const NEW_PLACE = 'new';

/** A spot for a new place: from the browser (with its accuracy), or a pin on the map. */
type Located = Coordinates & { accuracy: number | null };

// Leaflet and its tiles load only when someone opens the map.
const DeliveryMap = lazy(() => import('../components/map/DeliveryMap'));

function minutesFromNow(minutes: number): string {
  return toLocalInput(new Date(Date.now() + minutes * 60_000));
}

export function NewRequestPage() {
  const navigate = useNavigate();

  // Null while loading or if the Credit Service is unreachable; the balance
  // check is then skipped and the service's reservation decides (Credit F3.2).
  const balance = useCreditBalance();

  // UI FR10.1.3: the supplier catalogue is the pickup picker's source; the
  // order takes the pickup as a supplier id (fromLocation).
  const [locations, setLocations] = useState<Supplier[]>([]);
  const [locationsLive, setLocationsLive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSuppliers({ pageSize: 100 })
      .then((result) => {
        if (cancelled) return;
        setLocations(result.items);
        setLocationsLive(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLocations([]);
        setLocationsLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const locationOptions = useMemo(
    () =>
      [...locations]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((supplier) => ({ value: String(supplier.id), label: supplier.name })),
    [locations],
  );

  // Drop-offs are Order's own: the places this user has used before, then the
  // seeded campus points. The order takes one as deliveryPointId.
  const [campusPoints, setCampusPoints] = useState<DeliveryPoint[]>([]);
  const [myPoints, setMyPoints] = useState<DeliveryPoint[]>([]);
  const [pointsLive, setPointsLive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCampusDeliveryPoints(), fetchMyDeliveryPoints().catch(() => [])])
      .then(([campus, mine]) => {
        if (cancelled) return;
        setCampusPoints(campus);
        setMyPoints(mine);
        setPointsLive(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCampusPoints([]);
        setMyPoints([]);
        setPointsLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Colour coded by kind: places the user made in the accent colour, shared
  // spots around campus in blue, including the ones listed under their places.
  const deliveryOptions = useMemo((): PickerOption[] => {
    const mineIds = new Set(myPoints.map((point) => point.id));
    return [
      // Ungrouped, so it sits at the top above both lists.
      { value: NEW_PLACE, label: 'A new place', detail: 'From your location or a pin on the map', tone: 'add' },
      // Already in the user's own order (most used first).
      ...myPoints.map(
        (point): PickerOption => ({
          value: String(point.id),
          label: deliveryPointLabel(point),
          detail: deliveryPointDetail(point),
          tone: point.code === null ? 'accent' : 'info',
          group: 'Your places',
        }),
      ),
      // A campus point the user has used is listed once, above.
      ...campusPoints
        .filter((point) => !mineIds.has(point.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (point): PickerOption => ({
            value: String(point.id),
            label: deliveryPointLabel(point),
            detail: deliveryPointDetail(point),
            tone: 'info',
            group: 'Around campus',
          }),
        ),
    ];
  }, [campusPoints, myPoints]);

  const [pickup, setPickup] = useState('');
  const [delivery, setDelivery] = useState('');
  // A new place: what the courier is told, and where the browser put the user.
  const [placeName, setPlaceName] = useState('');
  const [placeBuilding, setPlaceBuilding] = useState('');
  const [placeDescription, setPlaceDescription] = useState('');
  const [placeAt, setPlaceAt] = useState<Located | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  // Set when the location snapped to a known point, so the user can undo it.
  const [snappedFrom, setSnappedFrom] = useState<Located | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [item, setItem] = useState('');
  const [credits, setCredits] = useState(3);
  // Defaults match the mockups: collection window first, delivery an hour on.
  const [expiresAt, setExpiresAt] = useState(() => minutesFromNow(30));
  const [deliverBy, setDeliverBy] = useState(() => minutesFromNow(90));
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errors = useMemo(() => {
    const expiry = parseLocalInput(expiresAt);
    const deadline = parseLocalInput(deliverBy);
    const now = new Date();

    const newPlace = delivery === NEW_PLACE;

    return {
      pickup: pickup === '' ? 'Choose a pickup location' : null,
      delivery:
        delivery === ''
          ? 'Choose a delivery location'
          : newPlace && placeAt === null
            ? 'Use your location, or drop a pin on the map'
            : newPlace && placeAt !== null && !isAllowedDropoff(placeAt)
              ? 'Not on the NUS Kent Ridge campus. Pick a point from the list instead.'
              : null,
      // Order requires all three for a new place.
      placeName: newPlace && placeName.trim() === '' ? 'Name it, e.g. "Block E side gate"' : null,
      placeBuilding: newPlace && placeBuilding.trim() === '' ? 'Say which building or block' : null,
      placeDescription:
        newPlace && placeDescription.trim() === '' ? 'Say how the courier finds it' : null,
      item: item.trim() === '' ? 'Say what the courier should get' : null,
      credits: Number.isNaN(credits)
        ? 'Enter a reward'
        : credits < 1
          ? 'At least 1 credit'
          : balance !== null && credits > balance
            ? `Exceeds your balance — you have ${balance} credits available`
            : null,
      deliverBy:
        deadline === null
          ? 'Choose a delivery deadline'
          : deadline <= now
            ? 'Must be in the future'
            : null,
      expiresAt:
        expiry === null
          ? 'Choose an acceptance expiry'
          : expiry <= now
            ? 'Must be in the future'
            : deadline !== null && expiry >= deadline
              ? 'Must be before the delivery deadline'
              : null,
    };
  }, [
    pickup,
    delivery,
    placeAt,
    placeName,
    placeBuilding,
    placeDescription,
    item,
    credits,
    balance,
    expiresAt,
    deliverBy,
  ]);

  const isValid = Object.values(errors).every((error) => error === null);

  const selectedPoint = [...myPoints, ...campusPoints].find((point) => String(point.id) === delivery);
  const selectedPointDetail = selectedPoint === undefined ? null : deliveryPointDetail(selectedPoint);
  const newPlace = delivery === NEW_PLACE;

  function chooseDelivery(value: string) {
    setDelivery(value);
    // A new place needs a spot; the map is the way to give one without GPS.
    if (value === NEW_PLACE && placeAt === null) setMapOpen(true);
    setSnappedFrom(null);
    setLocationNote(null);
  }

  /*
   * A spot, from the browser or a pin on the map, decides the drop-off: a
   * known point if it is within 25 m of one (so the courier gets a name they
   * recognise, and searches by point still find the order), otherwise a new
   * place there.
   */
  function placeAtSpot(spot: Located) {
    const fromGps = spot.accuracy !== null;
    if (!isAllowedDropoff(spot)) {
      setSnappedFrom(null);
      setLocationNote(
        fromGps
          ? 'You appear to be off campus, so this cannot be a drop-off. Pick a point from the list.'
          : 'That spot is off campus. Drop the pin inside the outline.',
      );
      return;
    }
    const nearby = nearbyDeliveryPoint(spot, [...myPoints, ...campusPoints]);
    if (nearby !== null) {
      setDelivery(String(nearby.point.id));
      setSnappedFrom(spot);
      setLocationNote(
        `${fromGps ? 'You are' : 'That is'} ${Math.round(nearby.metres)} m from ${deliveryPointLabel(nearby.point)}, so it is selected.`,
      );
      return;
    }
    setDelivery(NEW_PLACE);
    setPlaceAt(spot);
    setSnappedFrom(null);
    setLocationNote(null);
  }

  const mapPoints = useMemo((): MapPoint[] => {
    const mineIds = new Set(myPoints.map((point) => point.id));
    return [...myPoints, ...campusPoints.filter((point) => !mineIds.has(point.id))].map((point) => ({
      id: String(point.id),
      label: deliveryPointLabel(point),
      latitude: point.latitude,
      longitude: point.longitude,
      tone: point.code === null ? 'accent' : 'info',
    }));
  }, [campusPoints, myPoints]);

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setLocationNote('This browser cannot report your location. Pick a point from the list.');
      return;
    }
    setLocating(true);
    setLocationNote(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        placeAtSpot({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => {
        setLocating(false);
        setLocationNote('Could not read your location. Pick a point from the list.');
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function keepAsNewPlace() {
    if (snappedFrom === null) return;
    setDelivery(NEW_PLACE);
    setPlaceAt(snappedFrom);
    setSnappedFrom(null);
    setLocationNote(null);
  }
  const remaining = balance === null ? null : balance - (Number.isNaN(credits) ? 0 : credits);

  const expiryDate = parseLocalInput(expiresAt);
  const deadlineDate = parseLocalInput(deliverBy);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid || submitting) return;

    const expiry = parseLocalInput(expiresAt);
    const deadline = parseLocalInput(deliverBy);
    if (expiry === null || deadline === null) return;

    const dropoff: NewDropoff =
      delivery === NEW_PLACE && placeAt !== null
        ? {
            name: placeName.trim(),
            building: placeBuilding.trim(),
            description: placeDescription.trim(),
            latitude: placeAt.latitude,
            longitude: placeAt.longitude,
          }
        : { deliveryPointId: Number(delivery) };

    setSubmitting(true);
    setFailure(null);
    try {
      // Order F1: the service reserves the credits before the order exists,
      // and refuses if they cannot be covered.
      const order = await createOrder({
        itemDescription: item.trim(),
        credits,
        expiryTime: expiry,
        deliveryTime: deadline,
        fromLocation: pickup,
        dropoff,
      });
      navigate(`/orders/${order.id}`);
    } catch (error) {
      setFailure(errorMessage(error, 'Could not reach the Order Service. Try again in a moment.'));
    } finally {
      setSubmitting(false);
      // The reservation lowered the balance. On failure, refresh anyway: a
      // rejection for insufficient credits means the shown figure was stale.
      void refreshCreditBalance();
    }
  }

  return (
    <form className={styles.page} onSubmit={handleSubmit} noValidate>
      {!locationsLive ? (
        <p className={styles.offline} role="status">
          Cannot reach the Supplier Service, so there are no locations to choose from. Start it
          and reload.
        </p>
      ) : null}
      {!pointsLive ? (
        <p className={styles.offline} role="status">
          Cannot reach the Order Service, so there are no drop-off points to choose from. Start it
          and reload.
        </p>
      ) : null}

      {/* Mobile header from the mockup; the app nav is hidden on this route. */}
      <div className={styles.mobileHeader}>
        <Link to="/browse" className={styles.back} aria-label="Back">
          <span aria-hidden="true">&lsaquo;</span>
        </Link>
        <h1 className={styles.mobileTitle}>New request</h1>
        <span className={styles.mobileBalance}>{balance ?? '--'} cr available</span>
      </div>

      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Post a new request</h1>
          <p className={styles.subtitle}>
            Credits are reserved when you post and transfer when you acknowledge delivery.
          </p>
        </header>

        {failure ? <Alert variant="danger">{failure}</Alert> : null}

        <div className={styles.row}>
          <SelectField
            label="Pickup location"
            options={locationOptions}
            placeholder="Choose a supplier"
            value={pickup}
            hint={
              <>
                Approved suppliers only &middot;{' '}
                <Link to="/suppliers" className={styles.browseLink}>
                  Browse suppliers
                </Link>
              </>
            }
            onChange={(event) => setPickup(event.target.value)}
          />
          <PickerField
            label="Delivery location"
            options={deliveryOptions}
            placeholder="Choose a drop-off point"
            value={delivery}
            error={delivery === '' ? null : errors.delivery}
            hint={
              newPlace
                ? null
                : (selectedPointDetail ?? 'Places you have used, then spots around campus')
            }
            onChange={chooseDelivery}
          />
        </div>

        <div className={styles.locate}>
          <Button type="button" variant="secondary" onClick={useMyLocation} loading={locating}>
            {newPlace && placeAt !== null ? 'Locate me again' : 'Use my location'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMapOpen((open) => !open)} aria-expanded={mapOpen}>
            {mapOpen ? 'Hide map' : 'Pick on map'}
          </Button>
          {locationNote ? (
            <p className={styles.locateNote} role="status">
              {locationNote}
              {snappedFrom !== null ? (
                <>
                  {' '}
                  <button type="button" className={styles.locateUndo} onClick={keepAsNewPlace}>
                    Make it a new place instead
                  </button>
                </>
              ) : null}
            </p>
          ) : newPlace && placeAt !== null ? (
            <p className={styles.locateNote}>
              {placeAt.accuracy === null
                ? 'Placed at the pin. Drag it, or tap the map, to move it.'
                : `Placed where you are, to within about ${Math.max(5, Math.round(placeAt.accuracy))} m.`}{' '}
              It is saved to your places once the request posts.
            </p>
          ) : null}
        </div>

        {mapOpen ? (
          <Suspense fallback={<p className={styles.locateNote}>Loading the map…</p>}>
            <DeliveryMap
              points={mapPoints}
              selectedId={newPlace || delivery === '' ? null : delivery}
              pin={newPlace ? placeAt : null}
              onPickPoint={chooseDelivery}
              onDropPin={(at) => placeAtSpot({ ...at, accuracy: null })}
            />
          </Suspense>
        ) : null}

        {newPlace ? (
          <div className={styles.newPlace}>
            <div className={styles.row}>
              <TextField
                label="Place name"
                name="placeName"
                placeholder="Block E side gate"
                maxLength={200}
                value={placeName}
                onChange={(event) => setPlaceName(event.target.value)}
                error={placeName === '' ? null : errors.placeName}
              />
              <TextField
                label="Building"
                name="placeBuilding"
                placeholder="Eusoff Hall"
                maxLength={200}
                value={placeBuilding}
                onChange={(event) => setPlaceBuilding(event.target.value)}
                error={placeBuilding === '' ? null : errors.placeBuilding}
              />
            </div>
            <TextAreaField
              label="Where exactly"
              placeholder="Side gate facing the bus stop, by the bicycle racks"
              maxLength={500}
              value={placeDescription}
              onChange={(event) => setPlaceDescription(event.target.value)}
              hint="The courier sees this once they accept."
            />
          </div>
        ) : null}

        <TextAreaField
          label="Item description"
          placeholder={'2 × iced latte (less ice), 1 almond croissant. Order under "Priya".'}
          value={item}
          onChange={(event) => setItem(event.target.value)}
        />

        {/*
          One grid for the last four blocks, because the two viewports pair
          them differently: desktop puts the deadline beside the reward and
          the summary beside the expiry, mobile puts the two times side by
          side under a full-width reward.
        */}
        <div className={styles.lower}>
          <div className={styles.areaCredits}>
          <CreditStepper
            label="Credit reward"
            value={credits}
            min={1}
            max={999}
            onChange={setCredits}
            error={errors.credits}
            success={
              errors.credits === null && remaining !== null
                ? `${remaining} credits will remain available`
                : undefined
            }
          />
          </div>

          <div className={styles.areaDeadline}>
          <DateTimeField
            label="Delivery deadline"
            value={deliverBy}
            min={toLocalInput(new Date())}
            onChange={setDeliverBy}
            error={errors.deliverBy}
            hint={deadlineDate ? formatWhen(deadlineDate) : 'Must be in the future'}
          />
          </div>

          <div className={styles.areaExpiry}>
          <DateTimeField
            label="Acceptance expiry"
            value={expiresAt}
            min={toLocalInput(new Date())}
            onChange={setExpiresAt}
            error={errors.expiresAt}
            hint={
              expiryDate
                ? `Before the delivery deadline · ${formatUntil(expiryDate)}`
                : 'Before the delivery deadline'
            }
          />
          </div>

          <div className={styles.summary}>
            <p className={styles.summaryLabel}>Balance after reserving</p>
            <p
              className={
                remaining !== null && remaining < 0 ? styles.summaryNegative : styles.summaryValue
              }
            >
              {remaining === null ? 'Balance unavailable' : `${remaining} credits`}
            </p>
            <Button type="submit" fullWidth disabled={!isValid} loading={submitting}>
              Post request
            </Button>
          </div>
        </div>
      </div>

      {/* UI FR20.2.1: the primary action is pinned on mobile. */}
      <div className={styles.mobileActions}>
        <Button type="submit" fullWidth disabled={!isValid} loading={submitting}>
          {/* The desktop summary panel is not shown here, so the amount goes on the button. */}
          {Number.isNaN(credits)
            ? 'Post request'
            : `Post request · ${credits} credit${credits === 1 ? '' : 's'}`}
        </Button>
      </div>
    </form>
  );
}
