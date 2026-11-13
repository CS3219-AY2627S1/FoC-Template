// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-22
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import '@relay/ui/styles.css'
import '@relay/ui/styles/map.css'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import type { ProfileAnchor, SupplierRemoteProps, SupplierErrandSummary } from '@relay/contracts'
import { ServiceType } from '@relay/contracts'
import type { Supplier } from '@relay/contracts'
import {
  BellIcon,
  BoltIcon,
  ButtonWithImage,
  BubblePopover,
  ClipboardPlusIcon,
  FilterIcon,
  LocationIcon,
  PencilIcon,
  PlusIcon,
  RelayButton,
  RelayCardAnchor,
  SlidingSegmentedControl,
  Spacer,
  StorePlusIcon,
  type BubbleAnchor,
} from '@relay/ui'
import { ErrandDetailCard } from './components/SupplierErrandPanel'
import { SupplierDetailCard } from './components/SupplierDetailCard'
import { SupplierAdminPanel } from './components/SupplierAdminPanel'
import { SupplierFilterPanel, type SupplierFilters } from './components/SupplierFilterPanel'
import { getSupplierAnchor, SupplierMap, type MapPoint } from './components/SupplierMap'
import { SupplierList } from './components/SupplierList'
import { SupplierRowButton } from './components/SupplierRowButton'

const NUS_CENTER: MapPoint = { lat: 1.2966, lng: 103.7764 }
export default function App({
  navigateTo,
  openProfile,
  openCredit,
  openErrandView,
  userProfile,
  creditBalance,
  authVersion,
  supplierMode,
  errandApi,
  onErrandAccepted,
  mapViewport,
  onMapViewportChange,
  mapActive,
  supplierApi: activeApi,
}: SupplierRemoteProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [fallbackCenter, setFallbackCenter] = useState<MapPoint>(NUS_CENTER)
  const [userLocation, setUserLocation] = useState<MapPoint>()
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier>()
  const [selectedErrand, setSelectedErrand] = useState<SupplierErrandSummary>()
  const [selectedSupplierAnchor, setSelectedSupplierAnchor] = useState<BubbleAnchor>()
  const [nearbySuppliers, setNearbySuppliers] = useState<Supplier[]>()
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<SupplierFilters>({
    status: 'all',
    serviceTypes: Object.values(ServiceType),
  })
  const [activeMode, setActiveMode] = useState<'explore' | 'requests' | 'my-errands'>(
    supplierMode ?? 'explore',
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [map, setMap] = useState<LeafletMap>()
  const [adminMode, setAdminMode] = useState<'add' | 'edit' | undefined>()
  const [adminAnchor, setAdminAnchor] = useState<BubbleAnchor>()
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super-admin'
  const mapCenter = mapViewport?.center ?? fallbackCenter

  useEffect(() => {
    setActiveMode(supplierMode ?? 'explore')
  }, [supplierMode])

  const handleMapReady = useCallback((nextMap: LeafletMap) => setMap(nextMap), [])

  function returnToAccount() {
    if (navigateTo) {
      navigateTo('user')
      return
    }
    if (window.history.length > 1) window.history.back()
  }

  function openProfileCard(button: HTMLButtonElement) {
    if (openProfile) {
      const { top, left, right, bottom, width, height } = button.getBoundingClientRect()
      const anchor: ProfileAnchor = { top, left, right, bottom, width, height }
      openProfile(anchor)
      return
    }
    returnToAccount()
  }

  function openCreditCard(button: HTMLButtonElement) {
    if (!openCredit) return
    const { top, left, right, bottom, width, height } = button.getBoundingClientRect()
    openCredit({ top, left, right, bottom, width, height })
  }

  function openUpdates(button: HTMLButtonElement) {
    const { top, left, right, bottom } = button.getBoundingClientRect()
    openErrandView({ view: 'updates', anchor: { top, left, right, bottom } })
  }
  function openAdminPanel(mode: 'add' | 'edit', button: HTMLButtonElement) {
    const { top, left, right, bottom } = button.getBoundingClientRect()
    setAdminAnchor({ top, left, right, bottom })
    setAdminMode(mode)
  }

  // Debounce filter changes to reduce API calls
  function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)

    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedValue(value)
      }, delay)
      return () => clearTimeout(timer)
    }, [value, delay])

    return debouncedValue
  }

  const debouncedFilters = useDebounce(filters, 300)

  useEffect(() => {
    void activeApi
      .getSuppliers({
        status: debouncedFilters.status,
        serviceTypes: debouncedFilters.serviceTypes,
      })
      .then(({ suppliers: loadedSuppliers }) => {
        setSuppliers(loadedSuppliers)
        setErrorMessage('')
      })
      .catch((error: Error) => {
        setErrorMessage(error.message)
      })
  }, [activeApi, authVersion, debouncedFilters])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { lat: coords.latitude, lng: coords.longitude }
        setUserLocation(location)
        setFallbackCenter(location)
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
    )
  }, [])

  return (
    <main className="supplier-app">
      <SupplierMap
        center={mapCenter}
        suppliers={suppliers}
        userLocation={userLocation}
        zoom={mapViewport?.zoom ?? 16}
        onViewportChange={onMapViewportChange}
        active={mapActive ?? true}
        onSelect={(supplier, anchor, nearby) => {
          setSelectedSupplier(undefined)
          setSelectedErrand(undefined)
          setSelectedSupplierAnchor(anchor)
          setNearbySuppliers(nearby.length > 1 ? nearby : undefined)
          if (nearby.length === 1) setSelectedSupplier(supplier)
        }}
        onMapClick={() => {
          setSelectedSupplier(undefined)
          setSelectedErrand(undefined)
          setSelectedSupplierAnchor(undefined)
          setNearbySuppliers(undefined)
        }}
        onMapReady={handleMapReady}
      />
      <div className="supplier-top-controls map-top-menu" data-relay-card-exclusion="top">
        <RelayButton
          variant="secondary"
          size="map-pill"
          className="glass-pill glass-control"
          aria-label="Credits"
          onClick={(event) => openCreditCard(event.currentTarget)}
        >
          <BoltIcon className="supplier-control-icon" />
          <span>{creditBalance?.availableCredit ?? '...'} cr</span>
        </RelayButton>
        <SlidingSegmentedControl
          size="map"
          cardExclusion="top"
          ariaLabel="Supplier view"
          options={[
            { value: 'explore', label: 'Explore' },
            { value: 'requests', label: 'My Requests' },
            { value: 'my-errands', label: 'My Errands' },
          ]}
          value={activeMode}
          onChange={(nextMode) => {
            setActiveMode(nextMode)
            if (nextMode === 'requests' && openErrandView) {
              openErrandView({ view: 'requests' })
              return
            }
            if (nextMode === 'my-errands' && openErrandView) {
              openErrandView({ view: 'my-errands' })
              return
            }
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
      <div className="map-stub-controls" data-relay-card-exclusion="right">
        <RelayButton
          variant="secondary"
          size="map-icon"
          className="filter-map-control"
          onClick={() => setShowFilters(true)}
          aria-label="Open supplier filters"
        >
          <FilterIcon className="filter-icon" />
        </RelayButton>
        <RelayButton
          variant="secondary"
          size="map-icon"
          aria-label="Center map"
          onClick={() => map?.setView(userLocation ?? mapCenter)}
        >
          <LocationIcon className="location-icon" />
        </RelayButton>
        <RelayButton
          variant="secondary"
          size="map-icon"
          aria-label="Zoom in"
          onClick={() => map?.zoomIn()}
        >
          <PlusIcon className="location-icon" />
        </RelayButton>
        <RelayButton
          variant="secondary"
          size="map-icon"
          aria-label="Zoom out"
          onClick={() => map?.zoomOut()}
        >
          −
        </RelayButton>
      </div>
      <div className="supplier-bottom-controls map-bottom-menu" data-relay-card-exclusion="bottom">
        <SupplierRowButton
          size="map-action"
          className="updates-action"
          aria-label="Updates"
          onClick={(event) => openUpdates(event.currentTarget)}
        >
          <BellIcon className="supplier-control-icon" />
          <span className="supplier-control-label">Updates</span>
        </SupplierRowButton>
        <Spacer />
        {isAdmin && (
          <>
            {selectedSupplier && (
              <SupplierRowButton
                variant="secondary"
                className="supplier-admin-action"
                onClick={(event) => openAdminPanel('edit', event.currentTarget)}
                aria-label="Edit selected supplier"
                title="Edit selected supplier"
              >
                <span className="supplier-action-icon" aria-hidden="true">
                  <PencilIcon />
                </span>
                <span className="supplier-action-label">Edit selected</span>
              </SupplierRowButton>
            )}
            <SupplierRowButton
              variant="primary"
              size="map-action"
              className="supplier-admin-action"
              onClick={(event) => openAdminPanel('add', event.currentTarget)}
              aria-label="Add supplier"
              title="Add supplier"
            >
              <span className="supplier-action-icon" aria-hidden="true">
                <StorePlusIcon />
              </span>
              <span className="supplier-action-label">Add supplier</span>
            </SupplierRowButton>
          </>
        )}
        <SupplierRowButton
          variant="primary"
          size="map-action"
          className="new-request-action"
          onClick={(event) => {
            const { top, left, right, bottom } = event.currentTarget.getBoundingClientRect()
            openErrandView?.({ view: 'create', anchor: { top, left, right, bottom } })
          }}
        >
          <ClipboardPlusIcon className="supplier-control-icon" />
          <span className="supplier-control-label">New request</span>
        </SupplierRowButton>
      </div>
      {showFilters && (
        <SupplierFilterPanel
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
      {(selectedSupplier || nearbySuppliers) && (
        <BubblePopover anchor={selectedSupplierAnchor}>
          {selectedSupplier ? (
            selectedErrand ? (
              <ErrandDetailCard
                errand={selectedErrand}
                api={errandApi}
                onBack={() => setSelectedErrand(undefined)}
                onAccepted={onErrandAccepted}
              />
            ) : (
              <SupplierDetailCard
                supplier={selectedSupplier}
                errandApi={errandApi}
                onErrandSelect={setSelectedErrand}
                onClose={() => {
                  setSelectedSupplier(undefined)
                  setSelectedErrand(undefined)
                  setSelectedSupplierAnchor(undefined)
                  setNearbySuppliers(undefined)
                }}
              />
            )
          ) : (
            <SupplierList
              suppliers={nearbySuppliers ?? []}
              onSelect={(supplier) => {
                if (!map) return
                setSelectedErrand(undefined)
                setSelectedSupplier(supplier)
                setSelectedSupplierAnchor(getSupplierAnchor(map, supplier))
                setNearbySuppliers(undefined)
              }}
              onClose={() => {
                setSelectedSupplierAnchor(undefined)
                setNearbySuppliers(undefined)
              }}
            />
          )}
        </BubblePopover>
      )}
      {isAdmin && adminMode && adminAnchor && (
        <RelayCardAnchor
          placement="anchored"
          anchor={adminAnchor}
          preferredSide="top-end"
          className="supplier-admin-anchor"
        >
          <SupplierAdminPanel
            api={activeApi}
            supplier={adminMode === 'edit' ? selectedSupplier : undefined}
            onSaved={(supplier) => {
              setSuppliers((current) => {
                const index = current.findIndex((item) => item.id === supplier.id)
                if (index < 0) return [...current, supplier]
                const next = [...current]
                next[index] = supplier
                return next
              })
              setSelectedSupplier(supplier)
            }}
            onDeleted={(id) => {
              setSuppliers((current) => current.filter((supplier) => supplier.id !== id))
              setSelectedSupplier(undefined)
            }}
            onClose={() => {
              setAdminMode(undefined)
              setAdminAnchor(undefined)
            }}
          />
        </RelayCardAnchor>
      )}
      {errorMessage && (
        <div className="supplier-error" role="alert">
          {errorMessage}
        </div>
      )}
    </main>
  )
}
