// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-14
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import '@relay/ui/styles.css'
import '@relay/ui/styles/map.css'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import {
  Errand,
  ErrandNotification,
  ErrandNotificationTypes,
  ErrandStatus,
  ProfileAnchor,
  ErrandRemoteProps,
  ServiceType,
} from '@relay/contracts'
import {
  BellIcon,
  BoltIcon,
  ButtonWithImage,
  BubblePopover,
  ClipboardPlusIcon,
  FilterIcon,
  LocationIcon,
  MapSelectionList,
  StatusBadge,
  PlusIcon,
  RelayButton,
  RelayCardAnchor,
  SlidingSegmentedControl,
  Spacer,
  RelayFormSurface,
  LoadingState,
  ErrorMessage,
  type BubbleAnchor,
} from '@relay/ui'
import { CreateErrandCard } from './components/CreateErrandCard'
import { ErrandDetailCard } from './components/ErrandDetailCard'
import { ErrandFilterPanel, type ErrandFilters } from './components/ErrandFilterPanel'
import { ErrandMap, getErrandAnchor } from './components/ErrandMap'
import { formatRoute, STATUS_LABELS, statusTone } from './types'
import { useErrandNotifications } from './hooks/useErrandNotifications'

import { useNotificationHistory } from './hooks/useNotificationHistory'
import { ErrandNotificationCard } from './components/ErrandNotificationCard'
import type { SavedNotification } from './notificationStore'

const NUS_CENTER = { lat: 1.2966, lng: 103.7764 }
const lifecycleRank: Record<ErrandStatus, number> = {
  DELIVERED: 0,
  PICKED_UP: 1,
  ACCEPTED: 2,
  OPEN: 3,
  EXPIRED: 4,
  CANCELLED: 5,
  CONFIRMED: 6,
  DELETED: 7,
}

export default function App({
  errandViewContext,
  navigateTo,
  openErrandView,
  openProfile,
  openCredit,
  invalidateCreditBalance,
  userProfile,
  creditBalance,
  authenticatedSubject,
  userLocation,
  requestUserLocation,
  mapViewport,
  onMapViewportChange,
  mapActive,
  presentation,
  errandApi,
  supplierApi,
}: ErrandRemoteProps) {
  const [errands, setErrands] = useState<Errand[]>([])
  const [nearbyErrandIds, setNearbyErrandIds] = useState<string[]>([])
  const [selectedErrandId, setSelectedErrandId] = useState<string>()
  const [selectedErrandAnchor, setSelectedErrandAnchor] = useState<BubbleAnchor>()
  const [showFilters, setShowFilters] = useState(false)
  const [showUpdates, setShowUpdates] = useState(false)
  const [updatesAnchor, setUpdatesAnchor] = useState<BubbleAnchor>()
  const updatesControlRef = useRef<HTMLDivElement>(null)
  const [notificationErrand, setNotificationErrand] = useState<Errand>()
  const [updatesLoading, setUpdatesLoading] = useState(false)
  const notificationRequestRef = useRef(0)
  const [updatesError, setUpdatesError] = useState('')
  const [location, setLocation] = useState(userLocation)
  const [map, setMap] = useState<LeafletMap>()
  const [createAnchor, setCreateAnchor] = useState<BubbleAnchor>()
  const [filters, setFilters] = useState<ErrandFilters>({
    statuses: [
      ErrandStatus.Open,
      ErrandStatus.Accepted,
      ErrandStatus.PickedUp,
      ErrandStatus.Delivered,
      ErrandStatus.Confirmed,
      ErrandStatus.Expired,
    ],
    serviceTypes: [
      ServiceType.Food,
      ServiceType.Drink,
      ServiceType.Shopping,
      ServiceType.Parcel,
      ServiceType.Printing,
    ],
    sort: 'lifecycle',
  })
  const view = errandViewContext?.view ?? 'requests'
  const selectedErrand =
    (notificationErrand?.id === selectedErrandId ? notificationErrand : undefined) ??
    errands.find((errand) => errand.id === selectedErrandId)
  const {
    notifications,
    popup,
    store: notificationStore,
  } = useNotificationHistory(
    authenticatedSubject,
    showUpdates || view === 'updates' || mapActive === false || presentation === 'card',
  )

  useLayoutEffect(() => {
    const measure = () => {
      if (errandViewContext?.view === 'updates') {
        setUpdatesAnchor(errandViewContext.anchor)
        return
      }
      const bounds = updatesControlRef.current?.getBoundingClientRect()
      if (bounds) {
        const { top, left, right, bottom } = bounds
        setUpdatesAnchor({ top, left, right, bottom })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [popup?.eventId, showUpdates, mapActive, presentation, errandViewContext])

  useEffect(() => {
    notificationRequestRef.current += 1
    setNotificationErrand(undefined)
    setSelectedErrandId(undefined)
    setShowUpdates(false)
    setUpdatesLoading(false)
    setUpdatesError('')
  }, [authenticatedSubject])
  const isCourierView =
    view === 'explore' ||
    (errandViewContext?.view === 'supplier' && errandViewContext.scope === 'explore')
  const isRequester = authenticatedSubject === selectedErrand?.requesterSub
  const role = isRequester ? 'requester' : 'courier'

  useEffect(() => {
    if (!errandApi || view === 'create' || view === 'supplier' || view === 'updates') return
    const load =
      view === 'requests' ? errandApi.getErrands({ scope: 'mine' }) : errandApi.getErrands()
    void load
      .then(({ errands: loaded }) => {
        const accepted =
          view === 'my-errands'
            ? loaded.filter((errand) => errand.courierSub === authenticatedSubject)
            : loaded
        setErrands(accepted)
      })
      .catch(() => undefined)
  }, [errandApi, authenticatedSubject, view])
  const handleViewportChange = useCallback(
    (viewport: { center: { lat: number; lng: number }; zoom: number }) => {
      onMapViewportChange?.(viewport)
    },
    [onMapViewportChange],
  )

  function persistCurrentViewport() {
    if (!map) return
    const center = map.getCenter()
    handleViewportChange({ center: { lat: center.lat, lng: center.lng }, zoom: map.getZoom() })
  }

  const visibleErrands = useMemo(() => {
    let filtered = errands

    // For 'my-errands' view, only show errands assigned to this user as courier
    if (view === 'my-errands') {
      filtered = filtered.filter((errand) => errand.courierSub === authenticatedSubject)
    }

    // Filter by status and service type (for explore/requests views)
    if (view !== 'my-errands') {
      filtered = filtered.filter(
        (errand) =>
          filters.statuses.includes(errand.status) &&
          filters.serviceTypes.includes(errand.supplierDetails.serviceType as ServiceType),
      )
    }

    return [...filtered].sort((left, right) => {
      if (filters.sort === 'deadline') return left.expiresAt.localeCompare(right.expiresAt)
      if (filters.sort === 'start') return left.startAt.localeCompare(right.startAt)
      if (filters.sort === 'distance' && location)
        return distance(left, location) - distance(right, location)
      return lifecycleRank[left.status] - lifecycleRank[right.status]
    })
  }, [errands, filters, location, view, authenticatedSubject])

  const nearbyErrands = visibleErrands.filter((errand) => nearbyErrandIds.includes(errand.id))

  function closeMapSelection() {
    notificationRequestRef.current += 1
    setUpdatesLoading(false)
    setNotificationErrand(undefined)
    setNearbyErrandIds([])
    setSelectedErrandId(undefined)
    setSelectedErrandAnchor(undefined)
  }

  useEffect(() => {
    closeMapSelection()
    if (view === 'updates') setUpdatesError('')
  }, [view, errandViewContext])

  function closeRemote() {
    if (presentation === 'card') {
      navigateTo?.('supplier')
      return
    }
    openErrandView?.({ view: 'requests' })
  }

  function openProfileCard(button: HTMLButtonElement) {
    if (!openProfile) {
      navigateTo?.('user')
      return
    }
    const { top, left, right, bottom, width, height } = button.getBoundingClientRect()
    const anchor: ProfileAnchor = { top, left, right, bottom, width, height }
    openProfile(anchor)
  }

  function openCreditCard(button: HTMLButtonElement) {
    if (!openCredit) return
    const { top, left, right, bottom, width, height } = button.getBoundingClientRect()
    openCredit({ top, left, right, bottom, width, height })
  }

  function closeUpdates() {
    notificationRequestRef.current += 1
    setUpdatesLoading(false)
    setShowUpdates(false)
    if (view === 'updates') closeRemote()
  }

  function openUpdates() {
    closeMapSelection()
    setUpdatesError('')
    setShowUpdates(true)
  }

  async function openNotification(notification: SavedNotification) {
    const request = ++notificationRequestRef.current
    setUpdatesLoading(true)
    setUpdatesError('')
    // Hide the transient popup, preserving its saved entry.
    notificationStore.dismiss(notification.eventId)
    try {
      const errand = errandApi
        ? (await errandApi.getErrand(notification.errandId)).errand
        : errands.find((item) => item.id === notification.errandId)
      if (request !== notificationRequestRef.current) return
      if (!errand) throw new Error('This errand is no longer available.')
      setNotificationErrand(errand)
      setSelectedErrandId(errand.id)
      setSelectedErrandAnchor(updatesAnchor)
      setNearbyErrandIds([])
      setShowUpdates(false)
    } catch {
      if (request !== notificationRequestRef.current) return
      setShowUpdates(true)
      setUpdatesError(
        'Unable to open this errand. It may have been deleted or is no longer available to you.',
      )
    } finally {
      if (request === notificationRequestRef.current) setUpdatesLoading(false)
    }
  }
  async function updateErrand(
    action: 'accept' | 'pickup' | 'deliver' | 'confirm' | 'cancel' | 'drop' | 'delete',
    id: string,
  ) {
    if (errandApi) {
      const actions = {
        accept: errandApi.acceptErrand,
        pickup: errandApi.pickupErrand,
        deliver: errandApi.deliverErrand,
        confirm: errandApi.confirmErrand,
        cancel: errandApi.cancelErrand,
        drop: errandApi.dropErrand,
        delete: errandApi.deleteErrand,
      }
      if (action === 'delete') {
        await actions.delete(id)
        setErrands((current) => current.filter((errand) => errand.id !== id))
        setSelectedErrandId(undefined)
        return
      }
      if (action === 'drop') {
        const response = await actions.drop(id)
        setErrands((current) =>
          current.map((errand) =>
            errand.id === id
              ? response.errand // Use the updated errand from the response
              : errand,
          ),
        )
        // Drop errand may result in OPEN (new errand in pool) or EXPIRED (credit release)
        if (
          response.errand.status === ErrandStatus.Expired ||
          response.errand.status === ErrandStatus.Open
        ) {
          invalidateCreditBalance?.()
        }
        // Close the errand detail window when courier drops the errand
        if (selectedErrandId === id) {
          setSelectedErrandId(undefined)
          setSelectedErrandAnchor(undefined)
        }
        // If we're viewing "my-errands" tab, switch back to "requests" since dropped errand
        // is no longer assigned to this courier
        if (view === 'my-errands') {
          openErrandView?.({ view: 'requests' })
        }
        return
      }
      const response = await actions[action](id)
      setNotificationErrand((current) => (current?.id === id ? response.errand : current))
      setErrands((current) =>
        current.map((errand) => (errand.id === id ? { ...errand, ...response.errand } : errand)),
      )
      if (action === 'cancel' || action === 'confirm') invalidateCreditBalance?.()
      if (action === 'accept') openErrandView?.({ view: 'my-errands' })
      return
    }
    const nextStatus: Partial<Record<typeof action, ErrandStatus>> = {
      accept: ErrandStatus.Accepted,
      pickup: ErrandStatus.PickedUp,
      deliver: ErrandStatus.Delivered,
      confirm: ErrandStatus.Confirmed,
      cancel: ErrandStatus.Cancelled,
      drop: ErrandStatus.Open,
    }
    const next = nextStatus[action]
    if (next)
      setErrands((current) =>
        current.map((errand) =>
          errand.id === id
            ? {
                ...errand,
                status: next,
                ...(action === 'drop' ? { courierName: undefined, courierSub: null } : {}),
              }
            : errand,
        ),
      )
    if (action === 'delete') {
      setErrands((current) => current.filter((errand) => errand.id !== id))
      setSelectedErrandId(undefined)
    }
  }

  // Refetch errands from API
  const refetchErrands = useCallback(async () => {
    if (!errandApi || view === 'create' || view === 'supplier' || view === 'updates') return
    const load =
      view === 'requests' ? errandApi.getErrands({ scope: 'mine' }) : errandApi.getErrands()
    void load
      .then(({ errands: loaded }) => {
        const accepted =
          view === 'my-errands'
            ? loaded.filter((errand) => errand.courierSub === authenticatedSubject)
            : loaded
        setErrands(accepted)
      })
      .catch(() => undefined)
  }, [errandApi, authenticatedSubject, view])

  // Refetch errand details from API
  const refetchErrandDetails = useCallback(
    async (errandId: string) => {
      if (!errandApi) return
      void errandApi
        .getErrand(errandId)
        .then(({ errand }) => {
          setErrands((current) => current.map((e) => (e.id === errandId ? errand : e)))
          setNotificationErrand((current) => (current?.id === errandId ? errand : current))
        })
        .catch(() => undefined)
    },
    [errandApi],
  )

  // SSE notifications for other users' changes
  const handleErrandUpdate = useCallback(
    (event: ErrandNotification) => {
      const known = errands.find((errand) => errand.id === event.errandId)
      const name =
        known?.name ??
        notificationStore
          .getSnapshot()
          .notifications.find((item) => item.errandId === event.errandId)?.errandName ??
        `Errand ${event.errandId.slice(0, 8)}`
      notificationStore.add(event, name)
      if (!known && errandApi && event.type !== ErrandNotificationTypes.ERRAND_DELETED) {
        void errandApi
          .getErrand(event.errandId)
          .then(({ errand }) => {
            notificationStore.nameErrand(event.errandId, errand.name)
          })
          .catch(() => undefined)
      }
      const updateStatus = (current: Errand[]) =>
        event.type === ErrandNotificationTypes.ERRAND_DELETED
          ? current.filter((errand) => errand.id !== event.errandId)
          : current.map((errand) =>
              errand.id === event.errandId ? { ...errand, status: event.newStatus } : errand,
            )
      setErrands(updateStatus)
      setNotificationErrand((current) =>
        current?.id === event.errandId
          ? event.type === ErrandNotificationTypes.ERRAND_DELETED
            ? undefined
            : { ...current, status: event.newStatus }
          : current,
      )

      // Invalidate credit balance when errand status changes affect credits
      if (event.type === ErrandNotificationTypes.ERRAND_STATUS_CHANGED) {
        if (
          event.newStatus === ErrandStatus.Cancelled ||
          event.newStatus === ErrandStatus.Confirmed ||
          event.newStatus === ErrandStatus.Expired
        ) {
          invalidateCreditBalance?.()
        }
      }
    },
    [errands, errandApi, notificationStore, invalidateCreditBalance],
  )

  useErrandNotifications(
    authenticatedSubject,
    handleErrandUpdate,
    refetchErrands,
    refetchErrandDetails,
  )

  async function locateMe() {
    const next = await requestUserLocation?.()
    if (next) setLocation(next)
  }

  const createAnchorForView =
    createAnchor ?? (errandViewContext?.view === 'create' ? errandViewContext.anchor : undefined)
  const createCard = view === 'create' && (
    <RelayCardAnchor
      placement={createAnchorForView ? 'anchored' : 'center-right'}
      anchor={createAnchorForView}
      preferredSide="top-end"
      className="errand-create-popover"
    >
      <CreateErrandCard
        initialSupplierId={
          errandViewContext?.view === 'create' ? errandViewContext.supplierId : undefined
        }
        onClose={closeRemote}
        onCreated={() => {
          invalidateCreditBalance?.()
          openErrandView?.({ view: 'requests' })
        }}
        errandApi={errandApi}
        supplierApi={supplierApi}
        authenticatedSubject={authenticatedSubject}
        creditBalance={creditBalance}
      />
    </RelayCardAnchor>
  )

  const selectedErrandCard = selectedErrand && (
    <BubblePopover anchor={selectedErrandAnchor} maxWidth={405} className="errand-detail-popover">
      <ErrandDetailCard
        errand={selectedErrand}
        role={role}
        onClose={closeMapSelection}
        onAction={(action) => updateErrand(action, selectedErrand.id)}
      />
    </BubblePopover>
  )

  const updatesCard = (showUpdates || view === 'updates') && !selectedErrand && (
    <RelayCardAnchor
      anchor={updatesAnchor}
      size="small"
      placement="anchored"
      preferredSide="top-start"
      className="errand-updates-popover"
    >
      <RelayFormSurface
        as="aside"
        headerVariant="card"
        className="relay-notification-history relay-card-scroll-surface"
        title="Updates"
        onClose={closeUpdates}
      >
        {updatesLoading && <LoadingState label="Opening errand" />}
        {updatesError && <ErrorMessage message={updatesError} />}
        {notifications.length === 0 && <p>No notifications yet.</p>}
        <div className="relay-notification-history-list">
          {notifications.map((notification) => (
            <ErrandNotificationCard
              key={notification.eventId}
              notification={notification}
              confirmRemoval
              onClose={() => notificationStore.remove(notification.eventId)}
              onSelect={() => void openNotification(notification)}
            />
          ))}
        </div>
      </RelayFormSurface>
    </RelayCardAnchor>
  )

  if (presentation === 'card' && view === 'updates') {
    return (
      <main className="errand-updates-overlay relay-design-system">
        {selectedErrandCard}
        {updatesCard}
      </main>
    )
  }

  if (presentation === 'card' && createCard) {
    return <main className="errand-create-overlay relay-design-system">{createCard}</main>
  }

  return (
    <main className="errand-map-shell relay-design-system">
      <ErrandMap
        errands={visibleErrands}
        center={mapViewport?.center ?? location ?? NUS_CENTER}
        userLocation={location}
        selectedId={selectedErrandId}
        groupOverlaps={view === 'requests' || view === 'my-errands'}
        onSelect={(errand, anchor, nearby) => {
          setNearbyErrandIds(nearby.length > 1 ? nearby.map((item) => item.id) : [])
          setSelectedErrandId(nearby.length === 1 ? errand.id : undefined)
          setSelectedErrandAnchor(anchor)
        }}
        onMapClick={closeMapSelection}
        onMapReady={setMap}
        zoom={mapViewport?.zoom ?? 16}
        onViewportChange={handleViewportChange}
        active={mapActive ?? true}
      />
      <div className="errand-top-controls map-top-menu" data-relay-card-exclusion="top">
        <RelayButton
          variant="secondary"
          size="map-pill"
          className="glass-pill glass-control"
          aria-label="Credits"
          onClick={(event) => openCreditCard(event.currentTarget)}
        >
          <BoltIcon className="errand-control-icon" />
          <span>{creditBalance?.availableCredit ?? '...'} cr</span>
        </RelayButton>
        <SlidingSegmentedControl
          size="map"
          cardExclusion="top"
          ariaLabel="Errand view"
          options={[
            { value: 'explore', label: 'Explore' },
            { value: 'requests', label: 'My Requests' },
            { value: 'my-errands', label: 'My Errands' },
          ]}
          value={view === 'my-errands' ? 'my-errands' : isCourierView ? 'explore' : 'requests'}
          onChange={(next) => {
            persistCurrentViewport()
            openErrandView?.(
              next === 'explore'
                ? { view: 'explore' }
                : next === 'my-errands'
                  ? { view: 'my-errands' }
                  : { view: 'requests' },
            )
          }}
        />
        <ButtonWithImage
          variant="secondary"
          size="map-pill"
          className="glass-pill glass-control"
          aria-label="Profile"
          onClick={(event) => openProfileCard(event.currentTarget)}
          imageUrl={userProfile?.profilePictureUrl}
          fallback={userProfile?.username?.trim().charAt(0).toUpperCase() || '?'}
        >
          {userProfile?.username ?? 'Complete profile'}
        </ButtonWithImage>
      </div>
      <div className="errand-map-controls" data-relay-card-exclusion="right">
        {view !== 'my-errands' && (
          <RelayButton
            variant="secondary"
            size="map-icon"
            onClick={() => setShowFilters(true)}
            aria-label="Open errand filters"
          >
            <FilterIcon />
          </RelayButton>
        )}
        <RelayButton
          variant="secondary"
          size="map-icon"
          onClick={() => void locateMe()}
          aria-label="Center map"
        >
          <LocationIcon />
        </RelayButton>
        <RelayButton
          variant="secondary"
          size="map-icon"
          onClick={() => map?.zoomIn()}
          aria-label="Zoom in"
        >
          <PlusIcon />
        </RelayButton>
        <RelayButton
          variant="secondary"
          size="map-icon"
          onClick={() => map?.zoomOut()}
          aria-label="Zoom out"
        >
          −
        </RelayButton>
      </div>
      <div className="errand-bottom-controls map-bottom-menu" data-relay-card-exclusion="bottom">
        <div ref={updatesControlRef} className="errand-updates-control">
          <RelayButton
            variant="secondary"
            size="map-action"
            className="updates-action"
            aria-label="Updates"
            onClick={openUpdates}
          >
            <BellIcon className="errand-control-icon" />
            <span className="errand-control-label">Updates</span>
          </RelayButton>
        </div>
        <Spacer />
        <RelayButton
          variant="primary"
          size="map-action"
          className="new-request-action"
          onClick={(event) => {
            const { top, left, right, bottom } = event.currentTarget.getBoundingClientRect()
            setCreateAnchor({ top, left, right, bottom })
            openErrandView?.({ view: 'create' })
          }}
        >
          <ClipboardPlusIcon className="errand-control-icon" />
          <span className="errand-control-label">New request</span>
        </RelayButton>
      </div>
      {!selectedErrand && nearbyErrands.length > 0 && (
        <BubblePopover anchor={selectedErrandAnchor}>
          <MapSelectionList
            title={view === 'requests' ? 'Select a request' : 'Select an errand'}
            items={nearbyErrands}
            getTitle={(errand) => errand.name}
            getSubtitle={(errand) => formatRoute(errand.pickupLocation)}
            getTrailing={(errand) => (
              <StatusBadge tone={statusTone(errand.status)}>
                {STATUS_LABELS[errand.status]}
              </StatusBadge>
            )}
            onSelect={(errand) => {
              if (!map) return
              setSelectedErrandId(errand.id)
              setSelectedErrandAnchor(getErrandAnchor(map, errand))
              setNearbyErrandIds([])
            }}
            onClose={closeMapSelection}
          />
        </BubblePopover>
      )}
      {selectedErrandCard}
      {updatesCard}
      {!showUpdates && view !== 'updates' && popup && mapActive !== false && (
        <RelayCardAnchor
          key={popup.eventId}
          anchor={updatesAnchor}
          size="small"
          placement="anchored"
          preferredSide="top-start"
          className="errand-updates-popover"
        >
          <div role="status" aria-live="polite">
            <ErrandNotificationCard
              notification={popup}
              onClose={() => notificationStore.dismiss(popup.eventId)}
              onSelect={() => void openNotification(popup)}
            />
          </div>
        </RelayCardAnchor>
      )}
      {createCard}
      {showFilters && (
        <ErrandFilterPanel
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </main>
  )
}

function distance(errand: Errand, location: { lat: number; lng: number }) {
  const lat = errand.pickupLocation.lat - location.lat
  const lng = errand.pickupLocation.lng - location.lng
  return lat * lat + lng * lng
}
