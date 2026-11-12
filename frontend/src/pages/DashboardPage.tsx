/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-20
 * Scope (AI-19): Rendered and tested the requested dashboard preview.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

  /*
  * AI Assistance Disclosure
  * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
  * Scope (AI-65): Added recommended errands UI into errand dashboard page
  */


import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActiveErrandsPanel,
  ActiveErrandsSummary,
} from '../components/errands/ActiveErrandsPanel'
import { AcceptErrandDialog } from '../components/errands/AcceptErrandDialog'
import { ErrandCard } from '../components/errands/ErrandCard'
import { ErrandFilters } from '../components/errands/ErrandFilters'
import {
  applyDeliveryBuildingNames,
  loadErrandDashboardBuildings,
  loadOpenErrandDashboard,
  loadRecommendedErrands,
  nameDeliveryBuildings,
  type OpenErrandDashboardData,
} from '../features/errands/errand.dashboard'
import type { MyErrandItem } from '../features/errands/my-errands.types'
import { acceptErrand, ErrandApiError } from '../features/errands/errand.api'
import { loadMyErrands } from '../features/errands/errand.view'
import { useAuth } from '../features/auth/useAuth'
import { useErrandNotificationRevision } from '../features/notifications/useErrandNotificationRevision'
import type {
  ErrandCreditFilter,
  ErrandDashboardItem,
  ErrandExpiryFilter,
  ErrandSort,
  RecommendedErrandDashboardItem,
} from '../features/errands/errand.types'
import type { SupplierReference } from '../features/suppliers/supplier.types'

export function DashboardPage() {
  const { currentUserId } = useAuth()
  const [deliveryBuildingId, setDeliveryBuildingId] = useState('')
  const [credit, setCredit] = useState<ErrandCreditFilter>('all')
  const [expiry, setExpiry] = useState<ErrandExpiryFilter>('all')
  const [sort, setSort] = useState<ErrandSort>('expires_at,asc')
  const [dashboardData, setDashboardData] = useState<OpenErrandDashboardData | null>(null)
  const [deliveryBuildings, setDeliveryBuildings] = useState<SupplierReference[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [buildingErrorMessage, setBuildingErrorMessage] = useState<string | null>(null)
  const [buildingRetryCount, setBuildingRetryCount] = useState(0)
  const [recommendedErrands, setRecommendedErrands] = useState<
    RecommendedErrandDashboardItem[]
  >([])
  const [recommendedError, setRecommendedError] = useState<string | null>(null)
  const [pendingErrand, setPendingErrand] = useState<ErrandDashboardItem | null>(null)
  const [activeErrands, setActiveErrands] = useState<MyErrandItem[]>([])
  const [activeErrandsLoading, setActiveErrandsLoading] = useState(Boolean(currentUserId))
  const [activeErrandsError, setActiveErrandsError] = useState<string | null>(null)
  const [activeRetryCount, setActiveRetryCount] = useState(0)
  const [acceptMessage, setAcceptMessage] = useState('')
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [isAccepting, setIsAccepting] = useState(false)
  const acceptControllerRef = useRef<AbortController | null>(null)
  const notificationRevision = useErrandNotificationRevision()

  useEffect(() => {
    const controller = new AbortController()

    loadErrandDashboardBuildings(controller.signal)
      .then((buildings) => {
        setDeliveryBuildings(buildings)
        setBuildingErrorMessage(null)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setBuildingErrorMessage(
          error instanceof Error ? error.message : 'Unable to load delivery locations.',
        )
      })

    return () => controller.abort()
  }, [buildingRetryCount])

  useEffect(() => {
    const controller = new AbortController()

    loadOpenErrandDashboard(
      { deliveryBuildingId, credit, expiry, sort },
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return
        setDashboardData(data)
        setErrorMessage(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load open errands.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [credit, deliveryBuildingId, expiry, retryCount, sort, notificationRevision])

  useEffect(() => {
    const controller = new AbortController()

    loadRecommendedErrands(controller.signal)
      .then((errands) => {
        if (controller.signal.aborted) return
        setRecommendedErrands(errands)
        setRecommendedError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRecommendedErrands([])
        setRecommendedError(
          error instanceof Error ? error.message : 'Unable to load recommendations.',
        )
      })

    return () => controller.abort()
  }, [retryCount, notificationRevision])

  useEffect(() => {
    if (!currentUserId) return

    const controller = new AbortController()
    loadMyErrands(currentUserId, controller.signal)
      .then((errands) => {
        if (controller.signal.aborted) return
        setActiveErrands(errands)
        setActiveErrandsError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setActiveErrandsError(
          error instanceof Error ? error.message : 'Unable to load your active errands.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setActiveErrandsLoading(false)
      })

    return () => controller.abort()
  }, [activeRetryCount, currentUserId, notificationRevision])

  useEffect(
    () => () => {
      acceptControllerRef.current?.abort()
    },
    [],
  )

  const displayData = useMemo(
    () =>
      dashboardData
        ? applyDeliveryBuildingNames(dashboardData, deliveryBuildings)
        : null,
    [dashboardData, deliveryBuildings],
  )
  const displayRecommended = useMemo(
    () => nameDeliveryBuildings(recommendedErrands, deliveryBuildings),
    [recommendedErrands, deliveryBuildings],
  )
  const visibleErrands = displayData?.items ?? []
  const availableCount = displayData?.total ?? 0

  function prepareRequest() {
    setIsLoading(true)
    setErrorMessage(null)
  }

  function updateDeliveryBuilding(buildingId: string) {
    prepareRequest()
    setDeliveryBuildingId(buildingId)
  }

  function updateCredit(nextCredit: ErrandCreditFilter) {
    prepareRequest()
    setCredit(nextCredit)
  }

  function updateExpiry(nextExpiry: ErrandExpiryFilter) {
    prepareRequest()
    setExpiry(nextExpiry)
  }

  function updateSort(nextSort: ErrandSort) {
    prepareRequest()
    setSort(nextSort)
  }

  function resetFilters() {
    prepareRequest()
    setDeliveryBuildingId('')
    setCredit('all')
    setExpiry('all')
    setRetryCount((count) => count + 1)
  }

  function retryRequest() {
    prepareRequest()
    setRetryCount((count) => count + 1)
  }

  function retryBuildings() {
    setBuildingErrorMessage(null)
    setBuildingRetryCount((count) => count + 1)
  }

  function refreshActiveErrands() {
    if (!currentUserId) return
    setActiveErrandsLoading(true)
    setActiveErrandsError(null)
    setActiveRetryCount((count) => count + 1)
  }

  function refreshDashboard() {
    retryRequest()
    refreshActiveErrands()
  }

  async function submitAcceptErrand() {
    if (!pendingErrand) return

    const controller = new AbortController()
    acceptControllerRef.current = controller
    setIsAccepting(true)
    setAcceptError(null)

    try {
      await acceptErrand(pendingErrand.id, controller.signal)
      if (controller.signal.aborted) return
      setAcceptMessage(`${pendingErrand.required_item} was added to your active errands.`)
      setPendingErrand(null)
      refreshDashboard()
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ErrandApiError && error.status === 409) {
        setAcceptError('This errand is no longer available. Refreshing the open errands list.')
        retryRequest()
      } else {
        setAcceptError(
          error instanceof Error ? error.message : 'Unable to accept this errand.',
        )
      }
    } finally {
      if (acceptControllerRef.current === controller) acceptControllerRef.current = null
      if (!controller.signal.aborted) setIsAccepting(false)
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
        <p className="text-xs font-medium tracking-[0.08em] text-[#175c45] sm:text-sm">
          CAMPUS ERRANDS
        </p>
        <h1 className="mt-2 max-w-3xl text-[2rem] font-medium leading-[1.08] tracking-[-0.035em] text-[#17211d] sm:text-[2.375rem]">
          Find an errand on your route
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68736c] sm:text-base">
          Help a student, earn credits, and make your next walk count.
        </p>
        </div>
        <button
          type="button"
          onClick={refreshDashboard}
          disabled={isLoading || activeErrandsLoading || !currentUserId}
          className="inline-flex h-10 w-fit shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#bdc8c0] bg-white px-4 text-sm font-semibold text-[#175c45] transition hover:bg-[#f0f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] disabled:cursor-not-allowed disabled:opacity-60"
        >
          ↻ Refresh
        </button>
      </div>

      <ActiveErrandsSummary
        errands={activeErrands}
        isLoading={activeErrandsLoading}
        errorMessage={
          currentUserId ? activeErrandsError : 'Your access token does not contain a user ID.'
        }
      />

      {displayRecommended.length > 0 ? (
        // Same column grid as the open errands below (main column + 18rem side
        // panel), so recommended cards are the same width as open errand cards.
        <section
          aria-labelledby="recommended-errands-heading"
          className="mt-5 grid gap-7 sm:mt-6 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-6"
        >
          <div>
            <h2
              id="recommended-errands-heading"
              className="text-[1.375rem] font-medium tracking-[-0.02em] text-[#17211d] sm:text-2xl"
            >
              Recommended for you
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {displayRecommended.map((errand) => (
                <div key={errand.id} className="flex flex-col gap-2">
                  <p className="text-xs font-medium tracking-[0.04em] text-[#175c45]">
                    {errand.recommendation_reason}
                  </p>
                  <ErrandCard errand={errand} onAccept={setPendingErrand} />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : recommendedError ? (
        <p role="status" className="mt-5 text-sm text-[#68736c] sm:mt-6">
          Recommendations are unavailable right now.
        </p>
      ) : null}

      <div className="mt-5 sm:mt-6">
        <ErrandFilters
          deliveryBuildings={deliveryBuildings}
          deliveryBuildingId={deliveryBuildingId}
          credit={credit}
          expiry={expiry}
          sort={sort}
          onDeliveryBuildingChange={updateDeliveryBuilding}
          onCreditChange={updateCredit}
          onExpiryChange={updateExpiry}
          onSortChange={updateSort}
        />
        {buildingErrorMessage ? (
          <div
            role="status"
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span>Delivery locations could not be loaded. {buildingErrorMessage}</span>
            <button
              type="button"
              onClick={retryBuildings}
              className="cursor-pointer font-semibold text-[#175c45] underline decoration-[#175c45]/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
            >
              Retry locations
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid items-start gap-7 xl:mt-7 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-6">
        <div>
          <div className="flex items-baseline justify-between gap-4" aria-live="polite">
            <h2 className="text-[1.375rem] font-medium tracking-[-0.02em] text-[#17211d] sm:text-2xl">
              Open errands
            </h2>
            <p className="text-sm text-[#68736c]">
              {isLoading
                ? 'Loading…'
                : errorMessage
                  ? 'Unavailable'
                  : `${availableCount} available`}
            </p>
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-6 py-10 text-center"
            >
              <h3 className="text-lg font-medium text-red-900">Could not load errands</h3>
              <p className="mt-2 text-sm text-red-700">{errorMessage}</p>
              <button
                type="button"
                onClick={retryRequest}
                className="mt-5 cursor-pointer rounded-lg bg-[#175c45] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d3c2d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
              >
                Try again
              </button>
            </div>
          ) : isLoading ? (
            <div
              role="status"
              className="mt-4 rounded-[18px] border border-[#dde3de] bg-white px-6 py-12 text-center text-sm text-[#68736c]"
            >
              Loading open errands…
            </div>
          ) : visibleErrands.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {visibleErrands.map((errand) => (
                <ErrandCard key={errand.id} errand={errand} onAccept={setPendingErrand} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[18px] border border-dashed border-[#bdc8c0] bg-white px-6 py-12 text-center">
              <h3 className="text-lg font-medium text-[#17211d]">No open errands match</h3>
              <p className="mt-2 text-sm text-[#68736c]">
                Clear the filters to see all available errands.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-5 cursor-pointer rounded-lg bg-[#175c45] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d3c2d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        <ActiveErrandsPanel
          errands={activeErrands}
          isLoading={activeErrandsLoading}
          errorMessage={
            currentUserId ? activeErrandsError : 'Your access token does not contain a user ID.'
          }
          onRetry={refreshActiveErrands}
        />
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {acceptMessage}
      </p>

      {pendingErrand ? (
        <AcceptErrandDialog
          errand={pendingErrand}
          isSubmitting={isAccepting}
          errorMessage={acceptError}
          onClose={() => {
            setAcceptError(null)
            setPendingErrand(null)
          }}
          onConfirm={submitAcceptErrand}
        />
      ) : null}
    </section>
  )
}
