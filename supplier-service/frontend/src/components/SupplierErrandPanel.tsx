// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-22
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import { useEffect, useState, type CSSProperties } from 'react'
import type { SupplierRemoteProps, SupplierErrandSummary } from '@relay/contracts'
import {
  ErrorMessage,
  GlassCard,
  IconButton,
  LoadingState,
  RelayButton,
  StatusBadge,
} from '@relay/ui'

function deadline(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

function route(value: SupplierErrandSummary['pickupLocation']) {
  return `${value.buildingName} · Level ${value.floorNumber}`
}

export function ErrandDetailCard({
  errand,
  api,
  onBack,
  onAccepted,
  style,
}: {
  errand: SupplierErrandSummary
  api: SupplierRemoteProps['errandApi']
  onBack: () => void
  onAccepted?: () => void
  style?: CSSProperties
}) {
  const [actionError, setActionError] = useState('')
  const [accepting, setAccepting] = useState(false)

  async function accept() {
    if (!api) return
    setAccepting(true)
    setActionError('')
    try {
      await api.acceptErrand(errand.id)
      onAccepted?.()
      onBack()
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Unable to accept this errand.')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <GlassCard
      className="supplier-detail-card supplier-errand-detail relay-mobile-sheet-surface relay-card-scroll-surface"
      style={style}
      aria-label="Errand details"
    >
      <div className="errand-detail-header">
        <IconButton label="Back to supplier details" onClick={onBack}>
          ‹
        </IconButton>
        <div>
          <p className="errand-eyebrow">AVAILABLE ERRAND</p>
          <h2>{errand.name}</h2>
          <div className="errand-detail-meta">
            <StatusBadge tone="success">Open</StatusBadge>
            <span>Due {deadline(errand.expiresAt)}</span>
          </div>
        </div>
      </div>
      <div className="errand-route-card">
        <div>
          <span className="route-label">PICKUP</span>
          <strong>{route(errand.pickupLocation)}</strong>
        </div>
        <div>
          <span className="route-label">DELIVERY</span>
          <strong>{errand.deliveryDetails.description}</strong>
        </div>
      </div>
      {errand.deliveryDetails.instructions && (
        <div className="errand-info-card">
          <span className="route-label">INSTRUCTIONS</span>
          <p>{errand.deliveryDetails.instructions}</p>
        </div>
      )}
      <div className="errand-reward-card">
        <div>
          <span className="route-label">REWARD</span>
          <strong>{errand.creditAmount} credits</strong>
        </div>
        <small>Transferred after delivery is confirmed</small>
      </div>
      {actionError && <ErrorMessage message={actionError} />}
      <div className="errand-action-stack">
        <RelayButton variant="primary" disabled={accepting || !api} onClick={() => void accept()}>
          {accepting ? 'Accepting…' : 'Accept errand'}
        </RelayButton>
      </div>
    </GlassCard>
  )
}

export function SupplierErrandPanel({
  supplierId,
  api,
  onSelect,
}: {
  supplierId: string
  api: SupplierRemoteProps['errandApi']
  onSelect: (errand: SupplierErrandSummary) => void
}) {
  const [errands, setErrands] = useState<SupplierErrandSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!api) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void api
      .getSupplierErrandView({ scope: 'explore', supplierId })
      .then(({ errands: loaded }) => {
        if (!cancelled) {
          setErrands(loaded)
          setError('')
        }
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, supplierId])

  return (
    <div className="supplier-errands" aria-label="Available errands">
      <div className="supplier-errands-heading">
        <span>Errands</span>
      </div>
      {loading && <LoadingState label="Loading errands" />}
      {!loading && error && <ErrorMessage message={error} />}
      {!loading && !error && errands.length === 0 && (
        <p className="supplier-no-errands">No errands</p>
      )}
      {!loading && !error && errands.length > 0 && (
        <div className="supplier-errand-list">
          {errands.map((errand) => (
            <button
              className="supplier-errand-row"
              type="button"
              key={errand.id}
              onClick={() => onSelect(errand)}
            >
              <span>
                <strong>{errand.name}</strong>
                <small>
                  {route(errand.pickupLocation)} · Due {deadline(errand.expiresAt)}
                </small>
              </span>
              <b>{errand.creditAmount} cr</b>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
