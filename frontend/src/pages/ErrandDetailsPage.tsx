/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-07
 * Scope (AI-17): Wired and tested the existing pickup and receipt actions.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-22
 * Scope (AI-20): Built and tested the errand details preview with manual refresh.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-11-09 to 2026-11-10
 * Scope: Implementation and debugging assistance for opening chat from errand details.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import creditIcon from '../assets/errand-credit.svg'
import routeMarkers from '../assets/errand-route.svg'
import {
  ErrandActionDialog,
  type ErrandAction,
} from '../components/errands/ErrandActionDialog'
import type { ErrandDetails } from '../features/errands/errand-details.types'
import {
  cancelErrand,
  completeErrand,
  deliverErrand,
  ErrandApiError,
  failErrand,
} from '../features/errands/errand.api'
import { loadErrandDetails } from '../features/errands/errand.view'
import type { ErrandStatus } from '../features/errands/errand.types'
import { useAuth } from '../features/auth/useAuth'
import { useCredits } from '../features/credits/useCredits'
import { useErrandNotificationRevision } from '../features/notifications/useErrandNotificationRevision'
import { getConversationForErrand } from '../features/chat/chat.api'

function ChatLink({ errandId }: { errandId: string }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  async function openChat() {
    setLoading(true)
    setError(false)
    try {
      const conversation = await getConversationForErrand(errandId)
      if (conversation) navigate(`/chats/${conversation.id}`)
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }
  return <div className="mt-4">
    <button type="button" disabled={loading} onClick={() => void openChat()} className="h-10 w-full rounded-lg border border-[#175c45] px-4 text-sm font-semibold text-[#175c45] hover:bg-[#f0f6f2] disabled:opacity-60">
      {loading ? 'Opening chat…' : 'Open chat'}
    </button>
    {error ? <p className="mt-2 text-xs text-[#a33a32]">Chat is not available yet. Please try again.</p> : null}
  </div>
}

const statusPresentation: Record<
  ErrandStatus,
  { label: string; className: string }
> = {
  OPEN: { label: 'Open', className: 'bg-[#fff3d8] text-[#8e6523]' },
  ACCEPTED: { label: 'Accepted', className: 'bg-[#ddf3e7] text-[#1e694e]' },
  DELIVERED: { label: 'Ready for pickup', className: 'bg-[#ddf3e7] text-[#1e694e]' },
  COMPLETED: { label: 'Completed', className: 'bg-[#ddf3e7] text-[#1e694e]' },
  CANCELLED: { label: 'Cancelled', className: 'bg-[#edf0ed] text-[#68736c]' },
  FAILED: { label: 'Failed', className: 'bg-[#fde8e7] text-[#a33a32]' },
  EXPIRED: { label: 'Expired', className: 'bg-[#edf0ed] text-[#68736c]' },
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

type DetailRowProps = {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-[0.06em] text-[#7b867f]">{label}</dt>
      <dd className="mt-1.5 text-sm leading-6 text-[#28332d]">{value}</dd>
    </div>
  )
}

function getStatusCopy(errand: ErrandDetails) {
  if (errand.status === 'OPEN') {
    return {
      title: 'Waiting for a courier',
      description: 'Your request is visible to couriers until the collection deadline.',
    }
  }

  if (errand.status === 'ACCEPTED' && errand.viewerRole === 'requester') {
    return {
      title: 'Courier assigned',
      description: `${errand.courierName ?? 'A courier'} accepted your errand. Wait until the items are ready for pickup.`,
    }
  }

  if (errand.status === 'ACCEPTED') {
    return {
      title: 'Delivery in progress',
      description: 'You accepted this errand. Follow the pickup and delivery instructions shown here.',
    }
  }

  if (errand.status === 'DELIVERED') {
    return errand.viewerRole === 'requester'
      ? {
          title: 'Collect your items',
          description: 'Pick up your items at the delivery location, then confirm receipt or report a problem before the deadline.',
        }
      : {
          title: 'Awaiting requester confirmation',
          description: 'You marked the items ready for pickup. Credits transfer after the requester confirms receipt.',
        }
  }

  const terminalCopy: Record<Exclude<ErrandStatus, 'OPEN' | 'ACCEPTED' | 'DELIVERED'>, string> = {
    COMPLETED: 'The requester confirmed this delivery as completed.',
    CANCELLED: 'The requester cancelled this errand before it was accepted.',
    FAILED: 'This errand was reported as unsuccessful and is now closed.',
    EXPIRED: 'No courier accepted this errand before its collection deadline.',
  }

  return {
    title: statusPresentation[errand.status].label,
    description: terminalCopy[errand.status],
  }
}

function getOutcomeTime(errand: ErrandDetails) {
  if (errand.status === 'COMPLETED') return errand.completedAt
  if (errand.status === 'CANCELLED') return errand.cancelledAt
  if (errand.status === 'FAILED') return errand.failedAt
  if (errand.status === 'EXPIRED') return errand.expiresAt
  return null
}

export function ErrandDetailsPage() {
  const { errandId = '' } = useParams()
  return <ErrandDetailsView key={errandId} errandId={errandId} />
}

function ErrandDetailsView({ errandId }: { errandId: string }) {
  const { currentUserId } = useAuth()
  const [errand, setErrand] = useState<ErrandDetails | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(currentUserId && errandId))
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const [refreshMessage, setRefreshMessage] = useState('')
  const notificationRevision = useErrandNotificationRevision(errandId)

  useEffect(() => {
    if (!currentUserId || !errandId) return

    const controller = new AbortController()
    loadErrandDetails(errandId, currentUserId, controller.signal)
      .then((details) => {
        if (controller.signal.aborted) return
        setErrand(details)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(error instanceof Error ? error : new Error('Unable to load this errand.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [currentUserId, errandId, refreshCount, notificationRevision])

  function refreshErrand(message = 'Refreshing errand details…') {
    if (!currentUserId || !errandId) return
    setIsLoading(true)
    setLoadError(null)
    setRefreshMessage(message)
    setRefreshCount((count) => count + 1)
  }

  if (!currentUserId) {
    return (
      <ErrandLoadError
        title="Could not identify your account"
        message="Your access token does not contain a user ID. Please sign in again."
      />
    )
  }

  if (isLoading && !errand) {
    return (
      <section className="rounded-[18px] border border-[#dde3de] bg-white px-6 py-14 text-center text-sm text-[#68736c]" role="status">
        Loading errand details…
      </section>
    )
  }

  if (loadError && !errand) {
    const notFound = loadError instanceof ErrandApiError && loadError.status === 404
    return (
      <ErrandLoadError
        title={notFound ? 'Errand not found' : 'Could not load this errand'}
        message={loadError.message}
        onRetry={notFound ? undefined : () => refreshErrand()}
      />
    )
  }

  if (!errand) return null

  return (
    <ErrandDetailsContent
      key={errand.id}
      errand={errand}
      isRefreshing={isLoading}
      refreshMessage={refreshMessage}
      loadError={loadError?.message ?? null}
      onRefresh={refreshErrand}
    />
  )
}

type ErrandLoadErrorProps = {
  title: string
  message: string
  onRetry?: () => void
}

function ErrandLoadError({ title, message, onRetry }: ErrandLoadErrorProps) {
  return (
    <section className="mx-auto max-w-2xl py-12 text-center" role={onRetry ? 'alert' : undefined}>
      <p className="text-xs font-medium tracking-[0.08em] text-[#175c45]">ERRAND DETAILS</p>
      <h1 className="mt-3 text-3xl font-medium tracking-[-0.035em] text-[#17211d]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#68736c]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-lg bg-[#175c45] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d3c2d]"
        >
          Try again
        </button>
      ) : (
        <Link
          to="/my-errands"
          className="mt-6 inline-block rounded-lg bg-[#175c45] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d3c2d]"
        >
          Back to My errands
        </Link>
      )}
    </section>
  )
}

type ErrandDetailsContentProps = {
  errand: ErrandDetails
  isRefreshing: boolean
  refreshMessage: string
  loadError: string | null
  onRefresh: (message?: string) => void
}

function ErrandDetailsContent({
  errand,
  isRefreshing,
  refreshMessage,
  loadError,
  onRefresh,
}: ErrandDetailsContentProps) {
  const { refreshBalance } = useCredits()
  const [activeAction, setActiveAction] = useState<ErrandAction | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<{ action: ErrandAction; message: string } | null>(null)
  const [isPastDeadline, setIsPastDeadline] = useState(() => Date.parse(errand.expiresAt) <= Date.now())
  const actionControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const remainingMs = Date.parse(errand.expiresAt) - Date.now()
    const timeout = window.setTimeout(() => setIsPastDeadline(true), Math.max(0, remainingMs))
    return () => window.clearTimeout(timeout)
  }, [errand.expiresAt])

  useEffect(
    () => () => {
      actionControllerRef.current?.abort()
    },
    [],
  )

  const status = statusPresentation[errand.status]
  const statusCopy = getStatusCopy(errand)
  const outcomeTime = getOutcomeTime(errand)
  const isRequester = errand.viewerRole === 'requester'
  const canCancel = isRequester && errand.status === 'OPEN' && !errand.courierName
  const canDeliver = !isRequester && errand.status === 'ACCEPTED'
  const canResolve = isRequester && errand.status === 'DELIVERED'
  const showDeadlinePassed = isPastDeadline && (canCancel || canDeliver || canResolve)
  const deliveryLocation = [
    errand.deliveryBuilding,
    errand.deliveryFloor ? `Level ${errand.deliveryFloor}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  function openAction(action: ErrandAction) {
    setActionError(null)
    setActiveAction(action)
  }

  async function confirmAction(failureReason?: string) {
    if (!activeAction || isRefreshing || actionControllerRef.current) return

    const controller = new AbortController()
    actionControllerRef.current = controller
    setIsSubmitting(true)
    setActionError(null)

    try {
      if (activeAction === 'cancel') await cancelErrand(errand.id, controller.signal)
      if (activeAction === 'deliver') await deliverErrand(errand.id, controller.signal)
      if (activeAction === 'complete') await completeErrand(errand.id, controller.signal)
      if (activeAction === 'fail') {
        await failErrand(errand.id, failureReason ?? '', controller.signal)
      }
      if (controller.signal.aborted) return

      setActiveAction(null)
      onRefresh('Errand updated. Refreshing details…')
      if (activeAction !== 'deliver') void refreshBalance()
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ErrandApiError && error.status === 409) {
        setActiveAction(null)
        onRefresh()
      }
      setActionError({
        action: activeAction,
        message: error instanceof Error ? error.message : 'Unable to update this errand.',
      })
    } finally {
      if (actionControllerRef.current === controller) actionControllerRef.current = null
      if (!controller.signal.aborted) setIsSubmitting(false)
    }
  }

  return (
    <section>
      <Link
        className="inline-flex rounded-sm text-sm font-medium text-[#175c45] hover:text-[#0d3c2d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
        to="/my-errands"
      >
        ← Back to My errands
      </Link>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.08em] text-[#175c45]">
            ERRAND DETAILS
          </p>
          <h1 className="mt-2 max-w-3xl text-[2rem] font-medium leading-[1.1] tracking-[-0.035em] text-[#17211d] sm:text-[2.375rem]">
            {errand.requiredItem}
          </h1>
          <p className="mt-2 text-sm text-[#68736c]">Reference {errand.id}</p>
        </div>

        <button
          type="button"
          onClick={() => onRefresh()}
          disabled={isRefreshing}
          className="inline-flex h-10 w-fit shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#bdc8c0] bg-white px-4 text-sm font-semibold text-[#175c45] transition hover:bg-[#f0f6f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {refreshMessage}
      </p>

      {loadError ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          The latest details could not be loaded. {loadError}
        </p>
      ) : null}
      {!activeAction && actionError ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {actionError.action === 'cancel' && errand.courierName
            ? 'A courier accepted this errand before it could be cancelled.'
            : actionError.message}
        </p>
      ) : null}

      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6">
        <div className="space-y-5">
          <article className="rounded-[18px] border border-[#dde3de] bg-white p-5 shadow-[0_8px_24px_rgba(22,59,42,0.07)] sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-medium tracking-[-0.02em] text-[#17211d]">
                Route
              </h2>
              <span className="flex items-center gap-1.5 rounded-full bg-[#ddf3e7] px-3 py-1.5 text-sm font-medium text-[#175c45]">
                <img src={creditIcon} alt="" width="15" height="15" />
                {errand.creditValue} credits
              </span>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-[24px_minmax(0,1fr)]">
              <img
                src={routeMarkers}
                alt=""
                width="18"
                height="28"
                className="mt-1 hidden sm:block"
              />
              <dl className="grid gap-5 sm:grid-cols-2">
                <DetailRow label="PICK UP" value={`${errand.supplierName} · ${errand.pickupLocation}`} />
                <DetailRow label="DELIVER TO" value={deliveryLocation} />
              </dl>
            </div>
          </article>

          <article className="rounded-[18px] border border-[#dde3de] bg-white p-5 shadow-[0_8px_24px_rgba(22,59,42,0.07)] sm:p-6">
            <h2 className="text-xl font-medium tracking-[-0.02em] text-[#17211d]">
              Delivery information
            </h2>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              <DetailRow
                label="INSTRUCTIONS"
                value={errand.deliveryDescription ?? 'No additional instructions provided.'}
              />
              <DetailRow label="COLLECT BEFORE" value={formatDateTime(errand.expiresAt)} />
              <DetailRow label="REQUESTER" value={errand.requesterName} />
              <DetailRow label="COURIER" value={errand.courierName ?? 'Not accepted yet'} />
            </dl>
          </article>

          {errand.failureReason ? (
            <article className="rounded-[18px] border border-[#f0c8c5] bg-[#fff8f7] p-5 sm:p-6">
              <h2 className="text-base font-semibold text-[#8c302a]">Reported problem</h2>
              <p className="mt-2 text-sm leading-6 text-[#713934]">{errand.failureReason}</p>
            </article>
          ) : null}
        </div>

        <aside className="rounded-[18px] border border-[#dde3de] bg-white p-5 shadow-[0_8px_24px_rgba(22,59,42,0.07)] xl:sticky xl:top-[106px]">
          <span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium ${status.className}`}>
            {status.label}
          </span>
          <p className="mt-4 text-xs font-medium tracking-[0.06em] text-[#7b867f]">
            {errand.viewerRole === 'requester' ? 'YOU REQUESTED THIS' : 'YOU ARE DELIVERING'}
          </p>
          <h2 className="mt-2 text-lg font-medium text-[#17211d]">{statusCopy.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#68736c]">
            {statusCopy.description}
          </p>
          {errand.courierName ? (
            <ChatLink errandId={errand.id} />
          ) : null}
          <dl className="mt-5 space-y-4 border-t border-[#e6eae7] pt-5">
            <DetailRow label="CREATED" value={formatDateTime(errand.createdAt)} />
            {errand.acceptedAt ? (
              <DetailRow label="ACCEPTED" value={formatDateTime(errand.acceptedAt)} />
            ) : null}
            {errand.deliveredAt ? (
              <DetailRow label="READY FOR PICKUP" value={formatDateTime(errand.deliveredAt)} />
            ) : null}
            {outcomeTime ? (
              <DetailRow
                label={errand.status === 'EXPIRED' ? 'EXPIRED' : errand.status}
                value={formatDateTime(outcomeTime)}
              />
            ) : null}
          </dl>

          {showDeadlinePassed ? (
            <p className="mt-6 text-sm text-[#68736c]">The errand deadline has passed.</p>
          ) : null}

          {canCancel && !isPastDeadline ? (
            <button
              type="button"
              disabled={isRefreshing}
              onClick={() => openAction('cancel')}
              className="mt-6 h-11 w-full cursor-pointer rounded-lg border border-[#d49a95] bg-white px-4 text-sm font-semibold text-[#a33a32] transition hover:bg-[#fff5f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a33a32]"
            >
              Cancel errand
            </button>
          ) : null}

          {canDeliver && !isPastDeadline ? (
            <button
              type="button"
              disabled={isRefreshing}
              onClick={() => openAction('deliver')}
              className="mt-6 h-11 w-full cursor-pointer rounded-lg bg-[#d8f06b] px-4 text-sm font-semibold text-[#0d3c2d] transition hover:bg-[#cce85b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#175c45]"
            >
              Mark ready for pickup
            </button>
          ) : null}

          {canResolve && !isPastDeadline ? (
            <div className="mt-6 space-y-2">
              <button
                type="button"
                disabled={isRefreshing}
                onClick={() => openAction('complete')}
                className="h-11 w-full cursor-pointer rounded-lg bg-[#d8f06b] px-4 text-sm font-semibold text-[#0d3c2d] transition hover:bg-[#cce85b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
              >
                Confirm receipt
              </button>
              <button
                type="button"
                disabled={isRefreshing}
                onClick={() => openAction('fail')}
                className="h-11 w-full cursor-pointer rounded-lg border border-[#d49a95] bg-white px-4 text-sm font-semibold text-[#a33a32] transition hover:bg-[#fff5f4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a33a32]"
              >
                Report problem
              </button>
            </div>
          ) : null}
        </aside>
      </div>

      {activeAction ? (
        <ErrandActionDialog
          action={activeAction}
          errandName={errand.requiredItem}
          isSubmitting={isSubmitting}
          errorMessage={actionError?.message ?? null}
          onClose={() => {
            setActionError(null)
            setActiveAction(null)
          }}
          onConfirm={confirmAction}
        />
      ) : null}
    </section>
  )
}

