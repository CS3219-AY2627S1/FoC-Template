import { authFetch, refreshAccessToken } from '@relay/user-auth-frontend-fetch'
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import {
  SERVICE_METADATA,
  type FetchSessionHandler,
  type CreditBalance,
  type ErrandViewContext,
  type ProfileAnchor,
  type ServiceId,
  type SessionError,
  type User,
  type UserLocation,
} from '@relay/contracts'
import { RemotePage } from '../remote/RemotePage'
import './App.css'
import { hostErrandApi } from './errandApi'
import { hostSupplierApi } from './supplierApi'

function App() {
  /*
   * MFE lifecycle note:
   *
   * RemotePage currently renders every remote and uses `visible` to hide the
   * inactive ones. This keeps each MFE mounted, so navigating User -> Supplier
   * -> User preserves User's local React state, including AccountView. The
   * host already owns session discovery/refresh and passes auth-derived state
   * and navigation callbacks into the remotes.
   *
   * If this host is changed to mount only the active MFE, render only the
   * RemotePage for `activeService`. That will reduce initial loading, but the
   * inactive MFE will be unmounted and its local state will be destroyed. When
   * making that change, also:
   *
   * 1. Complete the session handoff: keep the authenticated session state in
   *    the host and extend service contracts as needed so each MFE receives the
   *    auth state it needs after being mounted.
   * 2. Keep navigation callbacks in the host so MFEs request navigation rather
   *    than importing or mounting one another directly.
   * 3. Ensure the User MFE can restore its exact subview, including AccountView,
   *    from host-owned state when it is mounted again after returning from
   *    another MFE. It currently restores only the authenticated/profile state.
   *
   * The first visit to a service will then have a cold-start delay, while
   * subsequent visits can reuse the browser/module-federation cache.
   */
  const [activeService, setActiveService] = useState<ServiceId>('user')
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileAnchor, setProfileAnchor] = useState<ProfileAnchor>()
  const [creditOpen, setCreditOpen] = useState(false)
  const [creditHistoryOpen, setCreditHistoryOpen] = useState(false)
  const [creditAnchor, setCreditAnchor] = useState<ProfileAnchor>()
  const [userProfile, setUserProfile] = useState<User | null>(null)
  const [storedCreditBalance, setStoredCreditBalance] = useState<CreditBalance | null>(null)
  const [creditInvalidation, setCreditInvalidation] = useState<{
    version: number
    subject?: string
    baseline: CreditBalance | null
  }>({ version: 0, baseline: null })
  const [authenticatedSubject, setAuthenticatedSubject] = useState<string>()
  const [authVersion, setAuthVersion] = useState(0)
  const creditBalance =
    storedCreditBalance?.userId === authenticatedSubject ? storedCreditBalance : null
  const [errandViewContext, setErrandViewContext] = useState<ErrandViewContext>()
  const [errandCardOnSupplierMap, setErrandCardOnSupplierMap] = useState(false)
  const [userLocation, setUserLocation] = useState<UserLocation>()
  const [supplierMode, setSupplierMode] = useState<'explore' | 'requests' | 'my-errands'>('explore')
  const [marketplaceMapViewport, setMarketplaceMapViewport] = useState({
    center: { lat: 1.2966, lng: 103.7764 },
    zoom: 16,
  })

  useEffect(() => {
    if (!authenticatedSubject) return
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') void refreshAccessToken()
    }
    const timer = window.setInterval(
      () => {
        void refreshAccessToken()
      },
      12 * 60 * 1000,
    )
    window.addEventListener('focus', refreshOnReturn)
    document.addEventListener('visibilitychange', refreshOnReturn)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOnReturn)
      document.removeEventListener('visibilitychange', refreshOnReturn)
    }
  }, [authenticatedSubject])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setUserLocation({ lat: coords.latitude, lng: coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
    )
  }, [])

  async function requestUserLocation(): Promise<UserLocation | undefined> {
    if (!navigator.geolocation) return undefined
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const next = { lat: coords.latitude, lng: coords.longitude }
          setUserLocation(next)
          resolve(next)
        },
        () => resolve(undefined),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 },
      )
    })
  }

  const fetchSession: FetchSessionHandler = async () => {
    const response = await authFetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
    if (!response.ok)
      throw { code: 'SESSION INVALIDATED', message: 'No active session.' } satisfies SessionError
    const body = (await response.json()) as {
      ok: boolean
      data?: {
        user: {
          subject: string
          email: string
          emailVerified: boolean
          role: 'super-admin' | 'admin' | 'user'
        }
      }
    }
    if (!body.ok || !body.data?.user)
      throw { code: 'SESSION INVALIDATED', message: 'No active session.' } satisfies SessionError
    const user = body.data.user
    const profile = await authFetch('/api/user/me', { credentials: 'include', cache: 'no-store' })
    if (!profile.ok && profile.status !== 404) throw new Error('Unable to determine profile state.')
    return {
      token: '',
      userData: {
        id: user.subject,
        email: user.email,
        emailVerified: user.emailVerified,
        profileCreated: profile.ok,
        isAdmin: user.role === 'admin' || user.role === 'super-admin',
      },
    }
  }

  useEffect(() => {
    let cancelled = false
    const loadProfile = async () => {
      try {
        const session = await fetchSession()
        if (!cancelled) setAuthenticatedSubject(session.userData.id)
        if (!session.userData.profileCreated) {
          if (!cancelled) setUserProfile(null)
          return
        }
        // Initial session restoration chooses the signed-in landing page once.
        // Closing the profile card must not perform this navigation again.
        if (!cancelled) setActiveService('supplier')
        const response = await authFetch('/api/user/me', { credentials: 'include' })
        if (cancelled) return
        if (response.ok) {
          const body = (await response.json()) as { ok?: boolean; data?: User }
          if (body.ok && body.data) setUserProfile(body.data)
        } else if (response.status === 404) setUserProfile(null)
      } catch {
        if (!cancelled) {
          setAuthenticatedSubject(undefined)
          setStoredCreditBalance(null)
          setUserProfile(null)
        }
      }
    }
    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [])

  // Call this when a credit-changing action begins. Keep the displayed balance
  // until the service reports a newer snapshot.
  const invalidateCreditBalance = useCallback(() => {
    setCreditInvalidation((current) => ({
      version: current.version + 1,
      subject: authenticatedSubject,
      baseline: creditBalance?.userId === authenticatedSubject ? creditBalance : null,
    }))
  }, [authenticatedSubject, creditBalance])

  useEffect(() => {
    if (!authenticatedSubject) return

    const subject = authenticatedSubject
    const baseline = creditInvalidation.subject === subject ? creditInvalidation.baseline : null
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let lastError: unknown
    const controller = new AbortController()

    async function pollBalance() {
      attempts += 1
      try {
        const response = await authFetch('/api/credit', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Credit balance request failed (${response.status}).`)
        const balance = (await response.json()) as CreditBalance
        if (cancelled) return
        const unchanged =
          baseline &&
          balance.availableCredit === baseline.availableCredit &&
          balance.reserveCredit === baseline.reserveCredit &&
          String(balance.lastUpdated) === String(baseline.lastUpdated)
        if (!unchanged) {
          setStoredCreditBalance(balance)
          return
        }
        lastError = new Error('Credit balance has not changed yet.')
      } catch (error) {
        if (cancelled) return
        lastError = error
      }
      if (attempts >= 20) {
        console.error('Credit balance did not update after 20 attempts.', lastError)
        return
      }
      retryTimer = setTimeout(() => {
        void pollBalance()
      }, 1000)
    }

    void pollBalance()
    return () => {
      cancelled = true
      controller.abort()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [authenticatedSubject, creditInvalidation, authVersion])
  async function refreshUserProfile() {
    try {
      const session = await fetchSession({ forceRefresh: true })
      setAuthenticatedSubject(session.userData.id)
      if (!session.userData.profileCreated) {
        setUserProfile(null)
        setAuthVersion((version) => version + 1)
        return
      }
      const response = await authFetch('/api/user/me', { credentials: 'include' })
      if (response.ok) {
        const body = (await response.json()) as { ok?: boolean; data?: User }
        if (body.ok && body.data) setUserProfile(body.data)
      } else if (response.status === 404) setUserProfile(null)
      setAuthVersion((version) => version + 1)
    } catch {
      setAuthenticatedSubject(undefined)
      setStoredCreditBalance(null)
      setUserProfile(null)
      setAuthVersion((version) => version + 1)
    }
  }

  function navigateTo(service: ServiceId) {
    setProfileOpen(false)
    setProfileAnchor(undefined)
    closeCredit()
    if (service !== 'errand') {
      setErrandViewContext(undefined)
      setErrandCardOnSupplierMap(false)
    }
    if (service === 'supplier') setSupplierMode('explore')
    setActiveService(service)
  }

  function openErrandView(context: ErrandViewContext) {
    closeCredit()
    if (context.view === 'explore') {
      setSupplierMode('explore')
      navigateTo('supplier')
      return
    }
    if (context.view === 'create' || context.view === 'updates') {
      setErrandCardOnSupplierMap(activeService === 'supplier')
    } else {
      setErrandCardOnSupplierMap(false)
    }
    if (context.view === 'requests') setSupplierMode('requests')
    if (context.view === 'my-errands') setSupplierMode('my-errands')
    setErrandViewContext(context)
    if ((context.view !== 'create' && context.view !== 'updates') || activeService !== 'supplier') {
      setActiveService('errand')
    }
  }

  function openProfile(anchor: ProfileAnchor) {
    closeCredit()
    setProfileAnchor(anchor)
    setProfileOpen(true)
  }

  function openCredit(anchor: ProfileAnchor) {
    setProfileOpen(false)
    setProfileAnchor(undefined)
    setCreditAnchor(anchor)
    setCreditHistoryOpen(false)
    setCreditOpen(true)
  }

  function closeCredit() {
    setCreditOpen(false)
    setCreditHistoryOpen(false)
    setCreditAnchor(undefined)
  }

  const updateViewport = useCallback(
    (
      setViewport: Dispatch<SetStateAction<{ center: UserLocation; zoom: number }>>,
      nextViewport: { center: UserLocation; zoom: number },
    ) => {
      setViewport((currentViewport) =>
        currentViewport.zoom === nextViewport.zoom &&
        currentViewport.center.lat === nextViewport.center.lat &&
        currentViewport.center.lng === nextViewport.center.lng
          ? currentViewport
          : nextViewport,
      )
    },
    [],
  )

  const handleMarketplaceMapViewportChange = useCallback(
    (nextViewport: { center: UserLocation; zoom: number }) => {
      updateViewport(setMarketplaceMapViewport, nextViewport)
    },
    [updateViewport],
  )

  function closeProfile() {
    setProfileOpen(false)
    setProfileAnchor(undefined)
  }

  function profileCardStyle(): CSSProperties | undefined {
    if (!profileAnchor) return undefined
    const cardWidth = Math.min(405, window.innerWidth - 32)
    const cardMaxHeight = window.innerHeight - 96
    const top = Math.min(profileAnchor.bottom + 12, window.innerHeight - cardMaxHeight - 16)
    const right = Math.min(Math.max(16, profileAnchor.right), 16)
    return {
      top: Math.max(16, top),
      left: 'unset',
      right,
      width: cardWidth,
    }
  }

  function creditCardStyle(): CSSProperties | undefined {
    if (!creditAnchor) return undefined
    if (window.innerWidth <= 700) {
      const toolbarHeight = 72
      const contentHeight = creditHistoryOpen ? 640 : 260
      return {
        height: Math.min(contentHeight + toolbarHeight, window.innerHeight - 24),
      }
    }
    const cardWidth = Math.min(creditHistoryOpen ? 760 : 405, window.innerWidth - 32)
    const top = Math.max(16, creditAnchor.bottom + 12)
    const availableHeight = Math.max(180, window.innerHeight - top - 16)
    const height = Math.min(creditHistoryOpen ? 640 : 280, availableHeight)
    const left = Math.min(Math.max(16, creditAnchor.left), window.innerWidth - cardWidth - 16)
    return { top, left, width: cardWidth, height }
  }

  return (
    <main className="relay-host-shell">
      <div className="remote-grid">
        <RemotePage
          service="supplier"
          serviceLabel={SERVICE_METADATA.supplier.label}
          visible={activeService === 'supplier'}
          appProps={{
            userProfile,
            creditBalance,
            authVersion,
            supplierMode,
            navigateTo,
            openProfile,
            openCredit,
            openErrandView,
            supplierApi: hostSupplierApi,
            errandApi: hostErrandApi,
            onErrandAccepted: () => openErrandView({ view: 'my-errands' }),
            mapViewport: marketplaceMapViewport,
            onMapViewportChange:
              activeService === 'supplier' ? handleMarketplaceMapViewportChange : undefined,
            mapActive: activeService === 'supplier',
          }}
        />
        <RemotePage
          service="user"
          serviceLabel={SERVICE_METADATA.user.label}
          visible={activeService === 'user' || profileOpen}
          appProps={{
            fetchSession,
            authVersion,
            navigateTo,
            closeProfile,
            refreshUserProfile,
            presentation: profileOpen ? 'card' : 'full',
          }}
          overlay={profileOpen}
          bubbleAnchor={profileOpen ? profileAnchor : undefined}
          card={profileOpen}
          cardStyle={profileOpen ? profileCardStyle() : undefined}
        />
        <RemotePage
          service="credit"
          serviceLabel={SERVICE_METADATA.credit.label}
          visible={activeService === 'credit' || creditOpen}
          appProps={{
            creditBalance,
            authenticatedSubject,
            authVersion,
            closeCredit,
            creditHistoryOpen,
            showCreditHistory: () => setCreditHistoryOpen(true),
            showCreditBalance: () => setCreditHistoryOpen(false),
          }}
          overlay={creditOpen}
          bubbleAnchor={creditOpen ? creditAnchor : undefined}
          card={creditOpen}
          cardStyle={creditOpen ? creditCardStyle() : undefined}
        />
        <RemotePage
          service="errand"
          serviceLabel={SERVICE_METADATA.errand.label}
          visible={activeService === 'errand' || errandCardOnSupplierMap}
          appProps={{
            userProfile,
            creditBalance,
            authenticatedSubject,
            invalidateCreditBalance,
            navigateTo,
            openProfile,
            openCredit,
            openErrandView,
            errandViewContext,
            userLocation,
            requestUserLocation,
            errandApi: hostErrandApi,
            supplierApi: hostSupplierApi,
            mapViewport: marketplaceMapViewport,
            onMapViewportChange:
              activeService === 'errand' ? handleMarketplaceMapViewportChange : undefined,
            mapActive: activeService === 'errand',
            presentation: errandCardOnSupplierMap ? 'card' : 'full',
          }}
          overlay={errandCardOnSupplierMap}
          overlayClassName={
            errandCardOnSupplierMap && errandViewContext?.view === 'create'
              ? 'errand-create-overlay-page'
              : undefined
          }
        />
      </div>
    </main>
  )
}

export default App
